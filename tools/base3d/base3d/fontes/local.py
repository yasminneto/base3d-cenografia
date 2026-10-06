"""Fonte local: arquivos GeoJSON fornecidos pelo usuário.

Serve para cidades sem serviço configurado, para trabalho offline e para os
testes. Coordenadas em lon/lat (EPSG:4326) são convertidas automaticamente.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from shapely.geometry import shape
from shapely.ops import transform

from ..geo import parts
from . import DadosFonte


class FonteLocal:
    def __init__(self, arquivos: dict, area):
        self.arquivos = arquivos
        self.area = area
        self._tr = area.para_utm()

    def _feicoes(self, chave):
        caminho = self.arquivos.get(chave)
        if not caminho:
            return []
        d = json.loads(Path(caminho).read_text(encoding="utf8"))
        out = []
        for f in d["features"]:
            g = shape(f["geometry"])
            x0, y0, x1, y1 = g.bounds
            if abs(x0) <= 180 and abs(y1) <= 90:  # lon/lat
                g = transform(self._tr.transform, g)
            out.append((g, f.get("properties") or {}))
        return out

    def carregar(self) -> DadosFonte:
        d = DadosFonte(atribuicao=self.arquivos.get("atribuicao", "Arquivos locais"),
                       datum_vertical=self.arquivos.get("datum_vertical", "não informado"),
                       licenca=dict(resumo=self.arquivos.get("licenca", "não informada"),
                                    pendente="licenca" not in self.arquivos,
                                    nota="Informe a licença dos arquivos em fonte_local.licenca."))
        d.rotulos = {k: f"Arquivo local ({Path(v).name})" for k, v in self.arquivos.items()
                     if isinstance(v, (str, Path)) and k not in ("atribuicao", "datum_vertical", "licenca")}
        for g, p in self._feicoes("quadras"):
            d.quadras += [dict(g=pg, attr=p) for pg in parts(g)]
        for g, p in self._feicoes("lotes"):
            d.lotes += [dict(g=pg, attr=p) for pg in parts(g)]
        for i, (g, p) in enumerate(self._feicoes("edificacoes")):
            for pg in parts(g):
                d.edificacoes.append(dict(g=pg, attr=p, id=p.get("id", i),
                                          base=p.get("base"), altura=p.get("altura")))
        for i, (g, p) in enumerate(self._feicoes("logradouros")):
            for ln in parts(g, "LineString"):
                d.logradouros.append(dict(g=ln, id=i, nome=p.get("nome", "Sem nome")))
        for g, p in self._feicoes("ciclovias"):
            d.ciclovias += [dict(g=ln) for ln in parts(g, "LineString")]
        for g, p in self._feicoes("arvores"):
            d.arvores += [dict(g=pt, copa=p.get("copa"), altura=p.get("altura"))
                          for pt in parts(g, "Point")]
        terreno = self.arquivos.get("terreno")
        if isinstance(terreno, (int, float)):
            x0, y0, x1, y1 = self.area.extensao
            d.amostras_terreno = np.array([[x0, y0, terreno], [x1, y0, terreno],
                                           [x1, y1, terreno], [x0, y1, terreno]], dtype=float)
        else:
            pts = []
            for g, p in self._feicoes("terreno"):
                for pt in parts(g, "Point"):
                    z = pt.z if pt.has_z else p.get("z")
                    if z is not None:
                        pts.append([pt.x, pt.y, float(z)])
            d.amostras_terreno = np.array(pts, dtype=float).reshape(-1, 3)
        if self.arquivos.get("ortofoto"):
            d.ortofoto = Path(self.arquivos["ortofoto"])
        return d
