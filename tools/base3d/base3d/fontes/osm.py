"""Fonte OpenStreetMap (Overpass) + Copernicus DEM (Open-Meteo), para cidades sem cadastro configurado.

Menos precisa que o cadastro do IPP: o OSM traz eixos de rua, não meio-fio. Por isso:
- pistas = eixo com largura da tag `width`, de `lanes` × 3,5 m ou de uma tabela por tipo de via;
- calçadas = faixa estimada ao lado da pista (metodo "estimated");
- alturas de prédio = tag `height` (atributo) ou `building:levels` × 3 m (derivada) ou padrão;
- terreno = Copernicus DEM de 90 m: serve para desníveis gerais, não para cota de meio-fio.
Recortes pequenos, cache em disco e servidores alternativos (Overpass costuma devolver 504 em
consultas grandes). Respeitar os termos de uso de cada serviço.
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import transform, unary_union

from ..config import FONTES
from ..geo import parts
from . import DadosFonte, amostras_terreno_pontos

VIAS_PEDESTRES = {"footway", "pedestrian", "path", "steps"}
VIAS_IGNORADAS = {"proposed", "construction", "raceway", "bus_guideway", "elevator", "platform", "corridor"}


def _metros(v):
    if v is None:
        return None
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)", str(v))
    return float(m.group(1).replace(",", ".")) if m else None


class ErroOSM(RuntimeError):
    pass


class FonteOSM:
    def __init__(self, area, cache: Path, tentativas: int = 3):
        self.cfg = FONTES["osm"]
        self.area = area
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.tentativas = tentativas
        self.log: list[str] = []
        self._utm = area.para_utm()

    # ---------------------------------------------------------------- HTTP
    def _http(self, url: str, dados: bytes | None = None) -> dict:
        req = urllib.request.Request(url, data=dados, headers={"User-Agent": "base3d/1.1 (cenografia)"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())

    def _overpass(self, consulta: str) -> dict:
        erros = []
        for servidor in self.cfg["overpass"]:
            for i in range(self.tentativas):
                try:
                    return self._http(servidor, urllib.parse.urlencode({"data": consulta}).encode())
                except Exception as e:  # 429/504 são comuns: espera e tenta o próximo servidor
                    erros.append(f"{servidor}: {e}")
                    time.sleep(2 ** (i + 1))
        raise ErroOSM("Overpass indisponível: " + " | ".join(erros[-3:]))

    # ---------------------------------------------------------------- dados
    def _bbox_lonlat(self):
        x0, y0, x1, y1 = self.area.extensao
        tr = self.area.para_lonlat()
        lons, lats = zip(*[tr.transform(x, y) for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]])
        return min(lats), min(lons), max(lats), max(lons)

    def consultar(self) -> dict:
        arquivo = self.cache / "osm.json"
        if arquivo.exists():
            return json.loads(arquivo.read_text(encoding="utf8"))
        s, w, n, e = self._bbox_lonlat()
        b = f"{s:.7f},{w:.7f},{n:.7f},{e:.7f}"
        consulta = f"""[out:json][timeout:120];
(
  way["building"]({b}); relation["building"]["type"="multipolygon"]({b});
  way["highway"]({b});
  way["natural"~"^(water|beach|sand)$"]({b}); relation["natural"~"^(water|beach|sand)$"]({b});
  node["natural"="tree"]({b}); node["highway"="street_lamp"]({b});
);
out geom;"""
        d = self._overpass(consulta)
        arquivo.write_text(json.dumps(d), encoding="utf8")
        self.log.append(f"[osm] {len(d.get('elements', []))} elementos baixados")
        return d

    def _linha(self, el):
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry") or []]
        return transform(self._utm.transform, LineString(pts)) if len(pts) >= 2 else None

    def _poligono(self, el):
        if el["type"] == "way":
            pts = [(p["lon"], p["lat"]) for p in el.get("geometry") or []]
            if len(pts) < 4 or pts[0] != pts[-1]:
                return None
            g = transform(self._utm.transform, Polygon(pts))
            return g if g.is_valid else g.buffer(0)
        externos, internos = [], []
        for m in el.get("members", []):
            pts = [(p["lon"], p["lat"]) for p in m.get("geometry") or []]
            if len(pts) >= 4 and pts[0] == pts[-1]:
                (internos if m.get("role") == "inner" else externos).append(Polygon(pts))
        if not externos:
            return None
        g = unary_union(externos).difference(unary_union(internos)) if internos else unary_union(externos)
        return transform(self._utm.transform, g.buffer(0))

    def terreno(self) -> np.ndarray:
        arquivo = self.cache / "terrain_samples.json"
        if arquivo.exists():
            amostras = json.loads(arquivo.read_text())
        else:
            pts = amostras_terreno_pontos(self.area, perto_m=30, longe_m=60)  # a fonte tem 90 m
            tr = self.area.para_lonlat()
            lonlat = [tr.transform(x, y) for x, y in pts]
            zs, lote = [], self.cfg["elevacao"]["lote"]
            for i in range(0, len(lonlat), lote):
                bloco = lonlat[i:i + lote]
                q = urllib.parse.urlencode({"latitude": ",".join(f"{la:.6f}" for _, la in bloco),
                                            "longitude": ",".join(f"{lo:.6f}" for lo, _ in bloco)})
                zs += self._http(f"{self.cfg['elevacao']['servico']}?{q}").get("elevation", [None] * len(bloco))
            amostras = [[float(x), float(y), (None if z is None else float(z))] for (x, y), z in zip(pts, zs)]
            arquivo.write_text(json.dumps(amostras))
        validas = [a for a in amostras if a[2] is not None]
        self.log.append(f"[terreno] {len(validas)} cotas do Copernicus DEM (90 m)")
        return np.array(validas, dtype=float).reshape(-1, 3)

    def carregar(self) -> DadosFonte:
        c = self.cfg
        d = DadosFonte(atribuicao=c["atribuicao"], datum_vertical=c["datum_vertical"], licenca=c["licenca"])
        d.rotulos = dict(edificacoes="Edificações OpenStreetMap", logradouros="Vias OpenStreetMap (eixos)",
                         ciclovias="Ciclovias OpenStreetMap", arvores="Árvores OpenStreetMap",
                         terreno=c["elevacao"]["rotulo"])
        d.datas = dict(edificacoes="base contínua (colaborativa)", terreno=c["elevacao"]["data"])
        larguras, passeios, mpp = c["larguras_m"], c["passeio_m"], c["metros_por_pavimento"]
        for el in self.consultar().get("elements", []):
            t = el.get("tags", {})
            if "building" in t and el["type"] in ("way", "relation"):
                g = self._poligono(el)
                if g is None or g.is_empty:
                    continue
                altura, metodo = _metros(t.get("height")), "source_attribute"
                if altura is None and _metros(t.get("building:levels")) is not None:
                    altura, metodo = _metros(t["building:levels"]) * mpp, "derived"
                base = _metros(t.get("min_height"))
                for pg in parts(g):
                    d.edificacoes.append(dict(g=pg, attr=t, id=f"osm{el['type'][0]}{el['id']}", base=None,
                                              altura=None if altura is None else altura - (base or 0),
                                              metodo_altura=metodo if altura is not None else None))
            elif "highway" in t and el["type"] == "way":
                tipo = t["highway"]
                if tipo in VIAS_IGNORADAS:
                    continue
                ln = self._linha(el)
                if ln is None:
                    continue
                if tipo == "cycleway":
                    d.ciclovias.append(dict(g=ln))
                elif tipo in VIAS_PEDESTRES:
                    d.caminhos.append(dict(g=ln, largura_m=_metros(t.get("width")) or 2.0))
                else:
                    base_tipo = tipo.replace("_link", "")
                    largura = _metros(t.get("width"))
                    if largura is None and _metros(t.get("lanes")):
                        largura = _metros(t["lanes"]) * 3.5
                    d.logradouros.append(dict(g=ln, id=f"osmw{el['id']}", nome=t.get("name") or f"({tipo})",
                                              largura_m=largura or larguras.get(base_tipo, 6.0),
                                              passeio_m=passeios.get(base_tipo, 1.5)))
            elif t.get("natural") in ("water", "beach", "sand") and el["type"] in ("way", "relation"):
                g = self._poligono(el)
                if g is not None and not g.is_empty:
                    (d.agua if t["natural"] == "water" else d.praia).append(g)
            elif el["type"] == "node" and t.get("natural") == "tree":
                x, y = self._utm.transform(el["lon"], el["lat"])
                d.arvores.append(dict(g=Point(x, y), copa=_metros(t.get("diameter_crown")), altura=_metros(t.get("height"))))
            elif el["type"] == "node" and t.get("highway") == "street_lamp":
                x, y = self._utm.transform(el["lon"], el["lat"])
                d.postes.append(dict(g=Point(x, y), altura=_metros(t.get("height"))))
        try:
            d.amostras_terreno = self.terreno()
        except Exception as e:
            d.amostras_terreno = None
            self.log.append(f"[terreno] indisponível ({e}); terreno plano em Z=0")
        d.log = self.log
        return d
