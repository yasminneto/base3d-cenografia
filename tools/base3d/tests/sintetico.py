"""Gera um bairro sintético em UTM 23S (perto de Botafogo) para testes offline.

Quadras de 80 x 60 m separadas por ruas de 20 m; dentro de cada quadra, lotes
recuados 3 m (calçada) e um prédio por lote; uma faixa de praia a leste.
"""
from __future__ import annotations

import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, box, mapping

E0, N0 = 686300.0, 7461100.0
EPSG = 31983


def _fc(feats):
    return dict(type="FeatureCollection", features=feats)


def _f(g, **p):
    return dict(type="Feature", geometry=mapping(g), properties=p)


def gerar(pasta: Path, nivel="basico", lapidacoes=(), extras=None) -> Path:
    pasta.mkdir(parents=True, exist_ok=True)
    quadras, lotes, predios, eixos = [], [], [], []
    for i in range(4):
        for j in range(5):
            x, y = E0 + i * 100, N0 + j * 80
            q = box(x, y, x + 80, y + 60)
            quadras.append(_f(q, id=f"Q{i}{j}"))
            for k in range(2):
                lote = box(x + 3 + k * 37, y + 3, x + 3 + (k + 1) * 37, y + 57)
                lotes.append(_f(lote, id=f"L{i}{j}{k}"))
                pr = box(x + 6 + k * 37, y + 8, x + k * 37 + 37, y + 50)
                if (i + j + k) % 5 == 0:  # prédio com pátio interno
                    pr = pr.difference(pr.centroid.buffer(6, cap_style=3))
                predios.append(_f(pr, id=f"E{i}{j}{k}", base=2.0, altura=6.0 + 3 * ((i * 7 + j * 3 + k) % 8)))
    for i in range(5):
        x = E0 - 10 + i * 100
        eixos.append(_f(LineString([(x, N0 - 40), (x, N0 + 440)]), nome=f"Rua Vertical {i}"))
    for j in range(6):
        y = N0 - 10 + j * 80
        eixos.append(_f(LineString([(E0 - 60, y), (E0 + 460, y)]), nome=f"Rua Horizontal {j}"))
    terreno = [_f(Point(E0 - 100 + a * 25, N0 - 100 + b * 25, 1.5 + 0.004 * a * 25), z=None)
               for a in range(30) for b in range(28)]
    for nome, fc in [("quadras", quadras), ("lotes", lotes), ("edificacoes", predios),
                     ("logradouros", eixos), ("terreno", terreno)]:
        (pasta / f"{nome}.geojson").write_text(json.dumps(_fc(fc)))

    # Polígono do evento: faixa de 12 x 300 m sobre a Rua Vertical 2, em lon/lat (como o Google Earth).
    tr = Transformer.from_crs(EPSG, 4326, always_xy=True)
    x = E0 + 190
    anel = [(x - 6, N0 + 20), (x + 6, N0 + 20), (x + 6, N0 + 320), (x - 6, N0 + 320), (x - 6, N0 + 20)]
    coords = " ".join(f"{lon:.8f},{lat:.8f},0" for lon, lat in (tr.transform(*p) for p in anel))
    (pasta / "poligono.kml").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Evento teste</name>
<Polygon><outerBoundaryIs><LinearRing><coordinates>{coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark></Document></kml>""")
    pedido = dict(
        codigo="26-TEST-001", nome="Bairro sintético", nivel=nivel, finalidade="evento_via_publica",
        kml="poligono.kml", entorno_m=60, fonte="local",
        fonte_local=dict(quadras="quadras.geojson", lotes="lotes.geojson", edificacoes="edificacoes.geojson",
                         logradouros="logradouros.geojson", terreno="terreno.geojson"),
        lapidacoes=list(lapidacoes), saida="saida",
        pontos_de_vista=[dict(nome="Palco", x=x, y=N0 + 300)],
    )
    pedido.update(extras or {})
    caminho = pasta / "pedido.json"
    caminho.write_text(json.dumps(pedido, indent=2, ensure_ascii=False))
    return caminho


def lapidacao_exemplo(pasta: Path) -> str:
    """Rodada 1: praia + água a leste, árvores, postes, um ajuste de altura e uma ciclovia."""
    feats = [
        _f(box(E0 + 380, N0 - 80, E0 + 470, N0 + 460), categoria="praia"),
        _f(box(E0 + 430, N0 - 80, E0 + 470, N0 + 460), categoria="06"),
        _f(box(E0 + 182, N0 + 60, E0 + 185, N0 + 200), categoria="05_CICLOVIA"),
        _f(box(E0 + 188, N0 + 100, E0 + 192, N0 + 103), categoria="pintura"),
        _f(box(E0 + 206, N0 + 88, E0 + 237, N0 + 130), categoria="07", acao="ajustar_altura", altura_m=40),
    ]
    feats += [_f(Point(E0 + 178, N0 + 20 + k * 15), categoria="arvore", copa_m=7, altura_m=9) for k in range(18)]
    feats += [_f(Point(E0 + 202, N0 + 30 + k * 30), categoria="poste", altura_m=8) for k in range(9)]
    (pasta / "lapidacao_R1.geojson").write_text(json.dumps(_fc(feats)))
    return "lapidacao_R1.geojson"
