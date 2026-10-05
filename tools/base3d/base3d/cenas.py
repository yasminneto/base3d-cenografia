"""Cenas (câmeras) calculadas a partir do polígono do evento.

O R03 tinha só duas cenas ortogonais fixas. Aqui elas dependem da geometria:
- vista_geral: axonométrica de todo o recorte (como 01_Vista_geral do R03);
- planta: ortogonal de topo (como 02_Planta do R03);
- area_evento: perspectiva oblíqua enquadrando o polígono;
- pedestre: olho a 1,60 m no centro do polígono, olhando ao longo do eixo maior;
- pedestre_extremos: olho a 1,60 m em cada extremidade do eixo maior;
- aerea_evento: perspectiva de drone (~35 m) sobre o polígono;
- pontos_de_vista: definidos no pedido (palco, entrada, público...).
"""
from __future__ import annotations

import math

import numpy as np
from shapely.geometry import Point


def _eixo_maior(poligono):
    ret = poligono.minimum_rotated_rectangle
    c = list(ret.exterior.coords)[:4]
    lados = [(c[i], c[(i + 1) % 4]) for i in range(4)]
    a, b = max(lados, key=lambda s: math.dist(*s))
    v = np.subtract(b, a)
    comp = float(np.linalg.norm(v))
    return v / (comp or 1), comp


def montar_cenas(area, perfil: dict, elev, pontos_de_vista=()) -> list[dict]:
    OR = area.origem
    pol = area.poligono
    c = np.array([pol.centroid.x, pol.centroid.y])
    zc = float(elev([c])[0])
    x0, y0, x1, y1 = area.recorte.bounds
    tam = max(x1 - x0, y1 - y0)
    eixo, comp = _eixo_maior(pol)
    pedidas = set(perfil["cenas"])
    cenas = []

    def L(p, z):  # UTM -> local
        return [float(p[0] - OR[0]), float(p[1] - OR[1]), float(z)]

    centro_rec = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
    if "vista_geral" in pedidas:
        d = tam * 0.9
        cenas.append(dict(nome="01_Vista_geral", olho=L(centro_rec + np.array([d * 0.55, -d * 0.62]), zc + d * 0.75),
                          alvo=L(centro_rec, zc), cima=[0, 0, 1], perspectiva=False, altura_orto=tam * 1.1))
    if "planta" in pedidas:
        cenas.append(dict(nome="02_Planta", olho=L(centro_rec, zc + 1500), alvo=L(centro_rec, zc),
                          cima=[0, 1, 0], perspectiva=False, altura_orto=(y1 - y0) * 1.05))
    if "area_evento" in pedidas:
        d = max(comp, 60) * 0.9
        perp = np.array([eixo[1], -eixo[0]])
        olho = c + perp * d * 0.8 - eixo * d * 0.35
        cenas.append(dict(nome="03_Area_do_evento", olho=L(olho, zc + d * 0.55), alvo=L(c, zc),
                          cima=[0, 0, 1], perspectiva=True, fov=50))
    if "pedestre" in pedidas:
        cenas.append(dict(nome="04_Pedestre_centro", olho=L(c, zc + 1.6), alvo=L(c + eixo * 60, zc + 1.6),
                          cima=[0, 0, 1], perspectiva=True, fov=65))
    if "pedestre_extremos" in pedidas:
        for nome, s in [("05_Pedestre_extremo_A", -1), ("06_Pedestre_extremo_B", 1)]:
            p = c + eixo * s * comp * 0.45
            if not pol.buffer(5).contains(Point(*p)):
                p = np.array(pol.exterior.interpolate(pol.exterior.project(Point(*p))).coords[0])
            z = float(elev([p])[0])
            cenas.append(dict(nome=nome, olho=L(p, z + 1.6), alvo=L(c, zc + 1.6), cima=[0, 0, 1],
                              perspectiva=True, fov=65))
    if "aerea_evento" in pedidas:
        perp = np.array([eixo[1], -eixo[0]])
        cenas.append(dict(nome="07_Aerea_drone", olho=L(c - perp * 45 - eixo * comp * 0.5, zc + 35),
                          alvo=L(c, zc), cima=[0, 0, 1], perspectiva=True, fov=60))
    if "pontos_de_vista" in pedidas:
        tr = area.para_utm()
        for i, pv in enumerate(pontos_de_vista, start=1):
            p = np.array(tr.transform(pv.lon, pv.lat) if pv.lat is not None else (pv.x, pv.y))
            if pv.alvo:
                a = pv.alvo
                alvo = np.array(tr.transform(a["lon"], a["lat"]) if "lat" in a else (a["x"], a["y"]))
            else:
                alvo = c
            z = float(elev([p])[0])
            za = float(elev([alvo])[0])
            cenas.append(dict(nome=f"{10 + i:02d}_PV_{pv.nome}", olho=L(p, z + pv.altura_olho_m),
                              alvo=L(alvo, za + 1.6), cima=[0, 0, 1], perspectiva=True, fov=pv.fov))
    return cenas
