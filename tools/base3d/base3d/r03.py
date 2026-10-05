"""Converte as camadas interpretadas de uma entrega anterior (ex.: Botafogo R03)
em um arquivo de lapidação, para que o motor novo reaproveite o trabalho feito.

    python -m base3d.r03 Botafogo_R03_cartografia.gpkg lapidacao_R03.geojson

Lê a tabela `modelo_poligonos` do GeoPackage (sem dependências extras) e leva
só o que não vem do cadastro: praia, areia úmida, água, ciclovia, pintura,
árvores (copa -> ponto com diâmetro) e postes candidatos.
"""
from __future__ import annotations

import json
import math
import sqlite3
import sys
from pathlib import Path

from shapely import wkb
from shapely.geometry import mapping

INTERPRETADAS = {"02": "02_PRAIA_AREIA", "05": "05_CICLOVIA", "06": "06_AGUA", "16": "16_PINTURA_PISO",
                 "17": "17_AREIA_UMIDA", "08": "arvore", "10": "poste"}
TAMANHO_ENVELOPE = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}


def geometria_gpkg(blob: bytes):
    flags = blob[3]
    inicio = 8 + TAMANHO_ENVELOPE[(flags >> 1) & 0b111]
    return wkb.loads(bytes(blob[inicio:]))


def converter(gpkg: Path, destino: Path, tabela: str = "modelo_poligonos", epsg: int = 31983) -> dict:
    con = sqlite3.connect(gpkg)
    col_geom = con.execute("select column_name from gpkg_geometry_columns where table_name=?", (tabela,)).fetchone()[0]
    feats, contagem = [], {}
    for blob, cat, nome in con.execute(f'select "{col_geom}", category, object_name from "{tabela}"'):
        if not blob or not cat:
            continue
        alvo = INTERPRETADAS.get(str(cat)[:2])
        if not alvo:
            continue
        g = geometria_gpkg(blob)
        props = dict(categoria=alvo, fonte=f"Entrega anterior ({gpkg.name}: {nome})", confianca="estimada")
        if alvo == "arvore":
            props["copa_m"] = round(2 * math.sqrt(g.area / math.pi), 2) if g.area > 0 else 6.0
            g = g.centroid
        elif alvo == "poste":
            g = g.centroid
        feats.append(dict(type="Feature", geometry=mapping(g), properties=props))
        contagem[alvo] = contagem.get(alvo, 0) + 1
    destino.write_text(json.dumps(dict(type="FeatureCollection",
                                       crs=dict(type="name", properties=dict(name=f"EPSG:{epsg}")),
                                       features=feats)), encoding="utf8")
    return contagem


if __name__ == "__main__":
    print(converter(Path(sys.argv[1]), Path(sys.argv[2])))
