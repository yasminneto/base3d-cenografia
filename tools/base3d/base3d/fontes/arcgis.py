"""Fonte ArcGIS REST (IPP / Prefeitura do Rio e serviços equivalentes).

Generaliza explore_sources.py e os downloads do R03:
- camadas localizadas pelo nome em cada serviço (sem índice fixo);
- consulta por envelope com paginação via objectIds (funciona em MapServer e FeatureServer);
- MDT por Identify ponto a ponto, com cache;
- ortofoto por exportImage em blocos de até 4000 px, com world file.
Todas as respostas brutas ficam em <saida>/fontes/, como no pacote R03.
"""
from __future__ import annotations

import concurrent.futures
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point

from ..config import FONTES
from ..geo import esripoly
from . import DadosFonte, amostras_terreno_pontos

LOTE_IDS = 200


def _numero(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def _campo(attr: dict, nomes: list[str]):
    for n in nomes:
        if n in attr and attr[n] not in (None, ""):
            return attr[n]
    return None


class ErroFonte(RuntimeError):
    pass


class FonteArcGIS:
    def __init__(self, nome: str, area, cache: Path, resolucao_orto: float = 0.25,
                 tentativas: int = 4):
        self.cfg = FONTES[nome]
        self.area = area
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.resolucao_orto = resolucao_orto
        self.tentativas = tentativas
        self.log: list[str] = []

    # ---------------------------------------------------------------- HTTP
    def _get(self, url: str, params: dict | None = None, post: bool = False, binario=False):
        data = urllib.parse.urlencode(params or {})
        for i in range(self.tentativas):
            try:
                if post:
                    req = urllib.request.Request(url, data=data.encode(), method="POST")
                else:
                    req = urllib.request.Request(url + ("?" + data if data else ""))
                req.add_header("User-Agent", "base3d/1.0")
                raw = urllib.request.urlopen(req, timeout=90).read()
                if binario:
                    return raw
                d = json.loads(raw)
                if isinstance(d, dict) and "error" in d:
                    raise ErroFonte(f"{url}: {d['error']}")
                return d
            except ErroFonte:
                raise
            except Exception as e:  # rede instável: recua 2, 4, 8 s
                if i == self.tentativas - 1:
                    raise ErroFonte(f"Falha ao acessar {url}: {e}") from e
                time.sleep(2 ** (i + 1))

    # ------------------------------------------------------------ camadas
    def resolver_camada(self, chave: str) -> str | None:
        cfg = self.cfg["camadas"][chave]
        if cfg.get("url"):
            return cfg["url"]
        padrao = re.compile(cfg["nome"], re.I)
        for servico in cfg["servicos"]:
            try:
                meta = self._get(servico, dict(f="pjson"))
            except ErroFonte as e:
                self.log.append(f"[{chave}] serviço indisponível: {e}")
                continue
            for lyr in meta.get("layers", []) + meta.get("tables", []):
                if padrao.search(lyr.get("name", "")) and not lyr.get("subLayerIds"):
                    url = f"{servico}/{lyr['id']}"
                    self.log.append(f"[{chave}] camada '{lyr['name']}' -> {url}")
                    return url
        if cfg.get("opcional"):
            self.log.append(f"[{chave}] camada opcional não encontrada; seguindo sem ela.")
            return None
        raise ErroFonte(
            f"Camada '{chave}' não encontrada nos serviços {cfg['servicos']}. "
            "Rode `python -m base3d descobrir` e informe a URL em data/fontes.json (campo 'url')."
        )

    def consultar(self, chave: str) -> list[dict]:
        """Feições ESRI JSON que tocam a extensão de download. Usa cache em disco."""
        arquivo = self.cache / f"{chave}.json"
        if arquivo.exists():
            return json.loads(arquivo.read_text(encoding="utf8"))["features"]
        url = self.resolver_camada(chave)
        if not url:
            return []
        epsg = self.area.epsg
        x0, y0, x1, y1 = self.area.extensao
        comum = dict(f="json", where="1=1", geometry=f"{x0},{y0},{x1},{y1}",
                     geometryType="esriGeometryEnvelope", inSR=epsg,
                     spatialRel="esriSpatialRelIntersects")
        ids = self._get(f"{url}/query", dict(comum, returnIdsOnly="true"), post=True)
        oids = sorted(ids.get("objectIds") or [])
        feats = []
        for i in range(0, len(oids), LOTE_IDS):
            lote = oids[i:i + LOTE_IDS]
            d = self._get(f"{url}/query", dict(f="json", objectIds=",".join(map(str, lote)),
                                                outFields="*", returnGeometry="true",
                                                outSR=epsg), post=True)
            feats.extend(d.get("features", []))
        arquivo.write_text(json.dumps(dict(url=url, features=feats)), encoding="utf8")
        self.log.append(f"[{chave}] {len(feats)} feições baixadas")
        return feats

    # ------------------------------------------------------------ terreno
    def _identify(self, x: float, y: float):
        servico = self.cfg["terreno"]["servico"]
        d = self._get(f"{servico}/identify", dict(
            f="json", geometry=json.dumps(dict(x=x, y=y)), geometryType="esriGeometryPoint",
            sr=self.area.epsg, layers="all", tolerance=0, returnGeometry="false",
            mapExtent=f"{x - 5},{y - 5},{x + 5},{y + 5}", imageDisplay="10,10,96"))
        for r in d.get("results", []):
            a = r.get("attributes", {})
            for k, v in a.items():
                if re.search(r"pixel|valor|value", k, re.I):
                    z = _numero(v)
                    if z is not None and abs(z) < 9000:
                        return z
        return None

    def terreno(self) -> np.ndarray:
        arquivo = self.cache / "terrain_samples.json"
        if arquivo.exists():
            amostras = json.loads(arquivo.read_text())
        else:
            pts = amostras_terreno_pontos(self.area)
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                zs = list(pool.map(lambda p: self._identify(*p), pts))
            amostras = [[float(x), float(y), z] for (x, y), z in zip(pts, zs)]
            arquivo.write_text(json.dumps(amostras))
        validas = [a for a in amostras if a[2] is not None]
        self.log.append(f"[terreno] {len(validas)} de {len(amostras)} amostras válidas")
        return np.array(validas, dtype=float).reshape(-1, 3)

    # ------------------------------------------------------------ ortofoto
    def ortofoto(self) -> Path | None:
        destino = self.cache / "ortofoto.jpg"
        if destino.exists():
            return destino
        try:
            from PIL import Image
        except ImportError:
            self.log.append("[ortofoto] Pillow ausente; ortofoto não baixada.")
            return None
        servico = self.cfg["ortofoto"]["servico"]
        x0, y0, x1, y1 = self.area.extensao
        res = self.resolucao_orto
        w, h = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
        bloco = 4000
        mosaico = Image.new("RGB", (w, h))
        for j in range(0, h, bloco):
            for i in range(0, w, bloco):
                bw, bh = min(bloco, w - i), min(bloco, h - j)
                bx0, by1 = x0 + i * res, y1 - j * res
                raw = self._get(f"{servico}/exportImage", dict(
                    f="image", format="jpg", bbox=f"{bx0},{by1 - bh * res},{bx0 + bw * res},{by1}",
                    bboxSR=self.area.epsg, imageSR=self.area.epsg, size=f"{bw},{bh}",
                    interpolation="RSP_BilinearInterpolation"), binario=True)
                from io import BytesIO
                mosaico.paste(Image.open(BytesIO(raw)).convert("RGB"), (i, j))
        mosaico.save(destino, quality=90)
        destino.with_suffix(".jgw").write_text(
            f"{res}\n0\n0\n{-res}\n{x0 + res / 2}\n{y1 - res / 2}\n")
        self.log.append(f"[ortofoto] {w}x{h} px a {res} m/px")
        return destino

    # ------------------------------------------------------------ montagem
    def carregar(self) -> DadosFonte:
        cam = self.cfg["camadas"]
        d = DadosFonte(atribuicao=self.cfg.get("atribuicao", ""),
                       datum_vertical=self.cfg.get("datum_vertical", "não informado"),
                       licenca=self.cfg.get("licenca", {}))
        d.datas = {k: v.get("data", "") for k, v in cam.items()}
        d.datas.update(terreno=self.cfg["terreno"].get("data", ""), ortofoto=self.cfg["ortofoto"].get("data", ""))
        d.rotulos = {k: v.get("rotulo", k) for k, v in cam.items()}
        d.rotulos["terreno"] = self.cfg["terreno"]["rotulo"]
        d.rotulos["ortofoto"] = self.cfg["ortofoto"]["rotulo"]
        for f in self.consultar("quadras"):
            d.quadras.append(dict(g=esripoly(f["geometry"]["rings"]), attr=f["attributes"]))
        for f in self.consultar("lotes"):
            d.lotes.append(dict(g=esripoly(f["geometry"]["rings"]), attr=f["attributes"]))
        campos = cam["edificacoes"].get("campos", {})
        for i, f in enumerate(self.consultar("edificacoes")):
            a = f["attributes"]
            d.edificacoes.append(dict(
                g=esripoly(f["geometry"]["rings"]), attr=a, id=_campo(a, ["OBJECTID", "objectid", "FID"]) or i,
                base=_numero(_campo(a, campos.get("base", []))),
                altura=_numero(_campo(a, campos.get("altura", [])))))
        nomes = cam["logradouros"].get("campos", {}).get("nome", [])
        for i, f in enumerate(self.consultar("logradouros")):
            for p in f["geometry"].get("paths", []):
                d.logradouros.append(dict(g=LineString(np.array(p)[:, :2]), id=i,
                                          nome=_campo(f["attributes"], nomes) or "Sem nome"))
        for f in self.consultar("ciclovias"):
            for p in f["geometry"].get("paths", []):
                d.ciclovias.append(dict(g=LineString(np.array(p)[:, :2])))
        cpa = cam["arvores"].get("campos", {})
        for f in self.consultar("arvores"):
            g = f["geometry"]
            if "x" in g:
                d.arvores.append(dict(g=Point(g["x"], g["y"]),
                                      copa=_numero(_campo(f["attributes"], cpa.get("copa", []))),
                                      altura=_numero(_campo(f["attributes"], cpa.get("altura", [])))))
        d.amostras_terreno = self.terreno()
        try:
            d.ortofoto = self.ortofoto()
        except ErroFonte as e:
            self.log.append(f"[ortofoto] indisponível: {e}")
        d.log = self.log
        return d


def descobrir(nome: str = "rio_ipp") -> list[str]:
    """Lista as camadas dos serviços configurados (equivalente a explore_sources.py)."""
    cfg = FONTES[nome]
    f = FonteArcGIS.__new__(FonteArcGIS)
    f.tentativas = 2
    linhas = []
    servicos = sorted({s for c in cfg["camadas"].values() for s in c["servicos"]})
    for s in servicos:
        try:
            meta = f._get(s, dict(f="pjson"))
            linhas.append(s)
            for lyr in meta.get("layers", []):
                linhas.append(f"   {lyr['id']:>3}  {lyr['name']}")
        except ErroFonte as e:
            linhas.append(f"{s}\n   ERRO: {e}")
    return linhas
