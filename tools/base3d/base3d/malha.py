"""Montagem da malha 3D (porta build_model.py do R03).

Convenções mantidas do R03, validadas em Botafogo:
- edificações: paredes de 4 lados, coberturas como uma face com furos (pátios);
  `export_faces` traz as coberturas trianguladas para OBJ/malhas;
- superfícies: Delaunay sobre grade de 5 m (perto do polígono) / 15 m (entorno),
  recortada exatamente pela borda de cada superfície; Z interpolado do MDT;
- solda de vértices a 0,1 mm e descarte de faces degeneradas;
- base plana auxiliar (Z=0) e contornos 2D para edição.
Novo em relação ao R03: meio-fio vertical (níveis intermediário e detalhado),
componentes de árvore/poste gerados aqui e marcador do limite em fita 3D.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.spatial import Delaunay, QhullError
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

from .config import cor
from .geo import parts, union

ERRO_AREA_MAX_M2 = 0.05


def atributos(item: dict, **extra) -> dict:
    """Metadados gravados em cada objeto (Attribute Dictionary no SKP, user strings no Rhino)."""
    out = dict(categoria=item.get("categoria", ""), nome=item.get("nome", ""), fonte=item.get("fonte", ""),
               confianca=item.get("confianca", ""), status=item.get("status", ""))
    if item.get("metodo"):
        out["metodo"] = item["metodo"]
    out.update({k: ("" if v is None else v) for k, v in extra.items()})
    return out


def _aneis(g):
    return [list(g.exterior.coords)[:-1]] + [list(r.coords)[:-1] for r in g.interiors]


class Montador:
    def __init__(self, area, elevacao, perfil: dict):
        self.area = area
        self.OR = area.origem
        self.elev = elevacao
        self.perfil = perfil
        self.h_meio_fio = perfil["altura_meio_fio_m"] if perfil.get("meio_fio") else 0.0
        self.erros_area = []

    def local(self, anel):
        return [[float(x - self.OR[0]), float(y - self.OR[1])] for x, y in anel]

    # ------------------------------------------------------------ objetos
    def plano(self, g, nome, camada):
        aneis = _aneis(orient(g, sign=1))
        vs, idx = [], []
        for anel in aneis:
            ini = len(vs)
            vs.extend([[x - self.OR[0], y - self.OR[1], 0.0] for x, y in anel])
            idx.append(list(range(ini, len(vs))))
        return dict(name=nome, layer=camada, color=cor(camada), kind="planar", vertices=vs,
                    faces=[idx[0]], holes={"0": idx[1:]})

    def edificacao(self, p):
        g = orient(p["g"], sign=1)
        aneis = _aneis(g)
        xy = [pt for anel in aneis for pt in anel]
        n = len(xy)
        base, topo = p["base"], p["base"] + p["altura"]
        vs = [[x - self.OR[0], y - self.OR[1], z] for z in (base, topo) for x, y in xy]
        ix, off = [], 0
        for anel in aneis:
            ix.append(list(range(off, off + len(anel))))
            off += len(anel)
        faces = [ix[0][::-1], [i + n for i in ix[0]]]
        holes = {"0": [r[::-1] for r in ix[1:]], "1": [[i + n for i in r] for r in ix[1:]]}
        for anel in ix:
            for a, b in zip(anel, anel[1:] + anel[:1]):
                faces.append([a, b, b + n, a + n])
        busca = {(round(x, 7), round(y, 7)): i for i, (x, y) in enumerate(xy)}
        tampas = []
        for tri in parts(constrained_delaunay_triangles(g)):
            tri = orient(tri, sign=1)
            try:
                t = [busca[(round(x, 7), round(y, 7))] for x, y in list(tri.exterior.coords)[:-1]]
            except KeyError:
                continue
            tampas.extend([t[::-1], [i + n for i in t]])
        return dict(name=p["nome"], layer="07_EDIFICACOES", color=cor("07_EDIFICACOES"), kind="building",
                    vertices=vs, faces=faces, holes=holes, export_faces=tampas + faces[2:],
                    profile=self.local(aneis[0]), inner_profiles=[self.local(r) for r in aneis[1:]],
                    base=base, height=p["altura"], source=p["fonte"], confidence=p["confianca"],
                    status=p["status"], footprint_area=g.area,
                    attributes=atributos(p, id_origem=p.get("id"), base_m=round(base, 3),
                                         altura_m=round(p["altura"], 3), area_projecao_m2=round(g.area, 3),
                                         **{f"metodo_{k}": v for k, v in p.get("metodos", {}).items()}))

    def superficie(self, g, s, deslocamento=0.0, plana=False):
        g = orient(g, sign=1)
        aneis = _aneis(g)
        xy = np.array([pt for anel in aneis for pt in anel])
        xmin, ymin, xmax, ymax = g.bounds
        passo = self.perfil["malha_passo_perto_m"] if g.distance(self.area.poligono) < 25 else self.perfil["malha_passo_longe_m"]
        if g.area > 250000:
            passo = 20
        pts = [tuple(v) for v in xy]
        if not plana:
            from shapely import contains_xy
            gx, gy = np.meshgrid(np.arange(math.ceil(xmin / passo) * passo, xmax, passo),
                                 np.arange(math.ceil(ymin / passo) * passo, ymax, passo))
            gx, gy = gx.ravel(), gy.ravel()
            m = contains_xy(g, gx, gy)
            pts += list(zip(gx[m], gy[m]))
        pts = np.unique(np.round(pts, 7), axis=0)
        if len(pts) < 3:
            return None
        tris = []
        if plana or len(pts) == 3:
            tris = parts(constrained_delaunay_triangles(g))
        else:
            try:
                simplices = Delaunay(pts - pts.mean(axis=0)).simplices
            except QhullError:
                simplices, tris = [], parts(constrained_delaunay_triangles(g))
            for sx in simplices:
                corte = Polygon(pts[sx]).intersection(g)
                for pg in parts(corte):
                    if pg.area > 1e-7:
                        tris.extend(parts(constrained_delaunay_triangles(pg)))
        vertices, faces, busca = [], [], {}
        for tri in tris:
            face = []
            for x, y in list(orient(tri, sign=1).exterior.coords)[:-1]:
                k = (round(x, 6), round(y, 6))
                if k not in busca:
                    busca[k] = len(vertices)
                    vertices.append(k)
                face.append(busca[k])
            if len(set(face)) == 3:
                faces.append(face)
        if not faces:
            return None
        xyz = np.zeros((len(vertices), 3))
        xyz[:, :2] = vertices
        if not plana:
            xyz[:, 2] = self.elev(np.array(vertices))
        xyz[:, 2] += deslocamento
        xyz -= self.OR
        # Solda a 0,1 mm (muito abaixo da acurácia das fontes) para evitar faces de área nula.
        xyz, inv = np.unique(np.round(xyz, 4), axis=0, return_inverse=True)
        inv = np.asarray(inv).ravel()
        limpas, vistos = [], set()
        for fc in faces:
            fc = [int(inv[i]) for i in fc]
            k = tuple(sorted(fc))
            if len(set(fc)) < 3 or k in vistos:
                continue
            vv = xyz[fc]
            if np.linalg.norm(np.cross(vv[1] - vv[0], vv[2] - vv[0])) < 1e-9:
                continue
            vistos.add(k)
            limpas.append(fc)
        if not limpas:
            return None
        usados = np.unique(np.array(limpas))
        remap = {int(v): i for i, v in enumerate(usados)}
        xyz = xyz[usados]
        faces = [[remap[i] for i in fc] for fc in limpas]
        vv, ff = xyz, np.array(faces)
        a = float(np.abs(np.cross(vv[ff[:, 1]] - vv[ff[:, 0]], vv[ff[:, 2]] - vv[ff[:, 0]])[:, 2]).sum() / 2)
        self.erros_area.append(abs(a - g.area))
        return dict(name=s["nome"], layer=s["categoria"], color=cor(s["categoria"]), kind="surface",
                    vertices=xyz.tolist(), faces=faces, source=s.get("fonte", ""),
                    confidence=s.get("confianca", ""), status=s.get("status", ""),
                    attributes=atributos(s, area_m2=round(g.area, 3)))

    def meio_fio(self, linhas):
        """Faixa vertical entre a cota da calçada (MDT) e a pista rebaixada."""
        if not self.h_meio_fio or not linhas:
            return None
        vs, faces = [], []
        for ln in linhas:
            ln = ln.segmentize(2.0)
            xy = np.array(ln.coords)[:, :2]
            if len(xy) < 2:
                continue
            z = self.elev(xy)
            ini = len(vs)
            for (x, y), zt in zip(xy, z):
                vs.append([x - self.OR[0], y - self.OR[1], float(zt)])
                vs.append([x - self.OR[0], y - self.OR[1], float(zt) - self.h_meio_fio])
            for i in range(len(xy) - 1):
                a = ini + 2 * i
                faces.append([a, a + 2, a + 3, a + 1])
        if not faces:
            return None
        return dict(name="Meio_fio", layer="13_MEIO_FIO", color=cor("13_MEIO_FIO"), kind="curb",
                    vertices=vs, faces=faces, source="Borda pista × calçada/canteiro (derivado)",
                    confidence="media", status="base_automatica",
                    attributes=dict(categoria="13_MEIO_FIO", fonte="Borda pista × calçada/canteiro",
                                    metodo="derived", metodo_altura="estimated", altura_m=self.h_meio_fio,
                                    nota="Altura padrão do nível; não medida em campo."))


# ---------------------------------------------------------------- componentes
def _cilindro(raio, z0, z1, lados, nome, camada):
    ang = np.linspace(0, 2 * math.pi, lados, endpoint=False)
    base = [[raio * math.cos(a), raio * math.sin(a), z0] for a in ang]
    topo = [[raio * math.cos(a), raio * math.sin(a), z1] for a in ang]
    vs = base + topo
    faces = [list(range(lados))[::-1], list(range(lados, 2 * lados))]
    for i in range(lados):
        j = (i + 1) % lados
        faces.append([i, j, j + lados, i + lados])
    return dict(name=nome, layer=camada, color=cor(camada), kind="cylinder", vertices=vs, faces=faces)


def _icosfera(centro, raios, nome, camada, subdiv=1):
    t = (1 + 5 ** 0.5) / 2
    v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
         [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
         [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
         [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
    v = [list(np.array(p) / np.linalg.norm(p)) for p in v]
    for _ in range(subdiv):
        meio, nf = {}, []

        def m(a, b):
            k = tuple(sorted((a, b)))
            if k not in meio:
                p = (np.array(v[a]) + np.array(v[b])) / 2
                v.append(list(p / np.linalg.norm(p)))
                meio[k] = len(v) - 1
            return meio[k]
        for a, b, c in f:
            ab, bc, ca = m(a, b), m(b, c), m(c, a)
            nf += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        f = nf
    vs = [[centro[0] + p[0] * raios[0], centro[1] + p[1] * raios[1], centro[2] + p[2] * raios[2]] for p in v]
    return dict(name=nome, layer=camada, color=cor(camada), kind="organic", vertices=vs, faces=f)


def definicoes() -> dict:
    """Componentes unitários: escala (copa/2, copa/2, altura) para árvores e (1, 1, altura) para postes."""
    return {
        "Arvore_esquematica": [
            _cilindro(0.06, 0.0, 0.45, 8, "Tronco", "09_ARVORES_TRONCOS"),
            _icosfera((0, 0, 0.66), (1.0, 1.0, 0.34), "Copa", "08_ARVORES_COPAS"),
        ],
        "Poste_generico": [
            _cilindro(0.09, 0.0, 1.0, 8, "Fuste", "10_POSTES"),
            dict(name="Luminaria", layer="10_POSTES", color=cor("10_POSTES"), kind="box",
                 vertices=[[0, -0.15, 0.97], [1.2, -0.15, 0.97], [1.2, 0.15, 0.97], [0, 0.15, 0.97],
                           [0, -0.15, 1.0], [1.2, -0.15, 1.0], [1.2, 0.15, 1.0], [0, 0.15, 1.0]],
                 faces=[[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]),
        ],
    }


def montar_modelo(area, geo, dados, perfil: dict) -> tuple[dict, dict]:
    m = Montador(area, dados.elevacao(), perfil)
    pistas = union([s["g"] for s in geo.superficies if s["categoria"] == "03_PISTAS"])
    objetos, planos, curvas = [], [], []
    for s in geo.superficies:
        desl = -m.h_meio_fio if s["categoria"] == "03_PISTAS" else 0.0
        o = m.superficie(s["g"], s, desl, plana=s["categoria"] == "06_AGUA")
        if o:
            objetos.append(o)
        if s["g"].area > 1:
            planos.append(m.plano(s["g"], "PLANO_" + s["nome"], s["categoria"]))
        curvas.append(dict(name=s["nome"], layer=s["categoria"], outer=m.local(_aneis(s["g"])[0]),
                           holes=[m.local(r) for r in _aneis(s["g"])[1:]], closed=True))
    for p in geo.pinturas:
        sobre_pista = p["g"].intersection(pistas).area > 0.5 * p["g"].area
        o = m.superficie(p["g"], p, 0.025 - (m.h_meio_fio if sobre_pista else 0.0))
        if o:
            objetos.append(o)
    for p in geo.edificacoes:
        objetos.append(m.edificacao(p))
        curvas.append(dict(name=p["nome"], layer="07_EDIFICACOES", outer=m.local(_aneis(p["g"])[0]),
                           holes=[m.local(r) for r in _aneis(p["g"])[1:]], closed=True))
    mf = m.meio_fio(geo.meio_fio)
    if mf:
        objetos.append(mf)
    for e in geo.eixos:
        for ln in parts(e["g"], "LineString"):
            if ln.length > 1:
                curvas.append(dict(name=f"{e['nome']}_{e['id']}", layer="EIXOS_LOGRADOUROS",
                                   outer=m.local(list(ln.coords)), holes=[], closed=False))
    fita = area.poligono.boundary.buffer(0.2, join_style=2).segmentize(5)
    marc = m.superficie(fita, dict(nome="Limite_evento_fita_3D", categoria="00_LIMITE_EVENTO",
                                   fonte="Polígono do pedido; fita de 0,4 m só para visualização",
                                   confianca="exata", status="pedido"), 0.12)
    if marc:
        marc["kind"] = "reference"
        objetos.append(marc)
    curvas.append(dict(name="Limite_evento", layer="00_LIMITE_EVENTO",
                       outer=m.local(_aneis(area.poligono)[0]), holes=[], closed=True))
    instancias = []
    for i in geo.instancias:
        z = float(m.elev([[i["x"], i["y"]]])[0])
        if i["tipo"] == "arvore":
            r = i["copa"] / 2
            instancias.append(dict(name=i["nome"], definition="Arvore_esquematica", layer="08_ARVORES_COPAS",
                                   position=[i["x"] - m.OR[0], i["y"] - m.OR[1], z], scale=[r, r, i["altura"]],
                                   source=i["fonte"], confidence=i["confianca"],
                                   attributes=atributos(dict(i, categoria="08_ARVORES_COPAS"), copa_m=i["copa"], altura_m=i["altura"])))
        else:
            instancias.append(dict(name=i["nome"], definition="Poste_generico", layer="10_POSTES",
                                   position=[i["x"] - m.OR[0], i["y"] - m.OR[1], z], scale=[1, 1, i["altura"]],
                                   source=i["fonte"], confidence=i["confianca"],
                                   attributes=atributos(dict(i, categoria="10_POSTES"), altura_m=i["altura"])))
    modelo = dict(origin=[float(v) for v in m.OR], epsg=area.epsg, objects=objetos,
                  definitions=definicoes(), instances=instancias, planar=planos, curves=curvas)
    relatorio = dict(
        objects=len(objetos), buildings=sum(o["kind"] == "building" for o in objetos),
        surface_faces=sum(len(o["faces"]) for o in objetos if o["kind"] == "surface"),
        planar_faces=len(planos), curves=len(curvas), instances=len(instancias),
        max_surface_area_error_m2=max(m.erros_area) if m.erros_area else 0.0,
    )
    if relatorio["max_surface_area_error_m2"] >= ERRO_AREA_MAX_M2:
        raise AssertionError(f"Erro de área de malha acima de {ERRO_AREA_MAX_M2} m²: {relatorio}")
    return modelo, relatorio
