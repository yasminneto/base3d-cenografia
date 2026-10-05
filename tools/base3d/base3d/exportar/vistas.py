"""Vistas PNG de conferência (como Botafogo_R03_planta.png e vista_3D.png).

- planta: ortofoto com contornos (quando houver) ao lado da planta interpretada;
- isometrica: volumetria axonométrica sombreada;
- area_evento: aproximação do polígono com medidas (área, perímetro, comprimento, largura);
- pontos_de_vista: planta com os cones de visão das cenas.
Renders fotorrealistas saem das cenas do .skp (V-Ray, Enscape, D5); estas
vistas são as conferências automáticas que acompanham toda entrega.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

from ..cenas import _eixo_maior
from ..config import cor
from ..geo import parts
from .comum import objetos_planificados

FUNDO = "#f4f3ef"
TEXTO = "#26353d"
ORDEM = ["01_CONTEXTO", "12_AREAS_INTERNAS_LOTES", "11_CANTEIROS_AREAS_LIVRES", "02_PRAIA_AREIA", "17_AREIA_UMIDA",
         "06_AGUA", "03_PISTAS", "04_CALCADAS_CAMINHOS", "05_CICLOVIA", "16_PINTURA_PISO"]


def _rgb(c):
    return tuple(v / 255 for v in c)


def _desenhar_planta(ax, area, geo, janela=None):
    for cat in ORDEM:
        for s in [x for x in geo.superficies + geo.pinturas if x["categoria"] == cat]:
            for pg in parts(s["g"]):
                ax.add_patch(MplPolygon(np.array(pg.exterior.coords), closed=True, fc=_rgb(cor(cat)), ec="none"))
                for r in pg.interiors:
                    ax.add_patch(MplPolygon(np.array(r.coords), closed=True, fc="white", ec="none"))
    for p in geo.edificacoes:
        ax.add_patch(MplPolygon(np.array(p["g"].exterior.coords), closed=True, fc="#d6d7d2", ec="#b9bab4", lw=0.3))
    for ln in geo.meio_fio:
        ax.plot(*np.array(ln.coords).T, color="#6d6d68", lw=0.4)
    for i in geo.instancias:
        if i["tipo"] == "arvore":
            ax.add_patch(plt.Circle((i["x"], i["y"]), i["copa"] / 2, color=_rgb(cor("08_ARVORES_COPAS")), alpha=0.75, lw=0))
        else:
            ax.plot(i["x"], i["y"], "o", ms=2.5, color="#4d5459")
    ax.plot(*np.array(area.poligono.exterior.coords).T, color=_rgb(cor("00_LIMITE_EVENTO")), lw=1.8)
    x0, y0, x1, y1 = janela or area.recorte.bounds
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.axis("off")


def _escala(ax, comprimento=None):
    x0, x1 = ax.get_xlim()
    y0, y1 = ax.get_ylim()
    comprimento = comprimento or (100 if x1 - x0 > 250 else 20)
    xa, ya = x0 + (x1 - x0) * 0.05, y0 + (y1 - y0) * 0.04
    ax.plot([xa, xa + comprimento], [ya, ya], color=TEXTO, lw=3, solid_capstyle="butt")
    ax.text(xa + comprimento / 2, ya + (y1 - y0) * 0.012, f"{comprimento} m", ha="center", fontsize=8, color=TEXTO)
    ax.annotate("N", xy=(x1 - (x1 - x0) * 0.06, y1 - (y1 - y0) * 0.04), xytext=(x1 - (x1 - x0) * 0.06, y1 - (y1 - y0) * 0.1),
                ha="center", color="#e69f00", fontsize=10, fontweight="bold", arrowprops=dict(arrowstyle="->", color="#e69f00"))


def planta(area, geo, dados, destino: Path, titulo: str, fontes: str):
    tem_orto = dados.ortofoto and Path(dados.ortofoto).exists()
    fig, axs = plt.subplots(1, 2 if tem_orto else 1, figsize=(16 if tem_orto else 9, 14), facecolor=FUNDO)
    axs = np.atleast_1d(axs)
    if tem_orto:
        img = plt.imread(dados.ortofoto)
        x0, y0, x1, y1 = area.extensao
        axs[0].imshow(img, extent=(x0, x1, y0, y1))
        for s in geo.superficies:
            for pg in parts(s["g"]):
                axs[0].plot(*np.array(pg.exterior.coords).T, color="white", lw=0.35, alpha=0.8)
        axs[0].plot(*np.array(area.poligono.exterior.coords).T, color=_rgb(cor("00_LIMITE_EVENTO")), lw=1.8)
        rx0, ry0, rx1, ry1 = area.recorte.bounds
        axs[0].set_xlim(rx0, rx1)
        axs[0].set_ylim(ry0, ry1)
        axs[0].set_aspect("equal")
        axs[0].axis("off")
        axs[0].set_title("CONFERÊNCIA SOBRE ORTOFOTO", color=TEXTO, fontsize=11)
        _escala(axs[0])
    _desenhar_planta(axs[-1], area, geo)
    axs[-1].set_title("BASE INTERPRETADA · PLANTA", color=TEXTO, fontsize=11)
    _escala(axs[-1])
    fig.suptitle(titulo, x=0.06, ha="left", fontsize=20, fontweight="bold", color=TEXTO)
    fig.text(0.06, 0.935, f"Polígono do evento em amarelo · {area.poligono.area:,.2f} m² · unidade: metro".replace(",", "X").replace(".", ",").replace("X", "."),
             fontsize=11, color="#5a6b73")
    fig.text(0.06, 0.03, fontes, fontsize=9, color="#5a6b73", wrap=True)
    fig.savefig(destino, dpi=130, facecolor=FUNDO)
    plt.close(fig)


def area_evento(area, geo, destino: Path, titulo: str):
    pol = area.poligono
    x0, y0, x1, y1 = pol.buffer(35).bounds
    fig, ax = plt.subplots(figsize=(12, 12 * (y1 - y0) / max(x1 - x0, 1e-6) if (y1 - y0) < 2.5 * (x1 - x0) else 18), facecolor=FUNDO)
    _desenhar_planta(ax, area, geo, (x0, y0, x1, y1))
    eixo, comp = _eixo_maior(pol)
    ret = pol.minimum_rotated_rectangle
    lados = sorted(math.dist(*p) for p in zip(list(ret.exterior.coords)[:4], list(ret.exterior.coords)[1:5]))
    txt = (f"Área: {pol.area:,.1f} m²\nPerímetro: {pol.length:,.1f} m\n"
           f"Comprimento (eixo maior): {comp:,.1f} m\nLargura do retângulo envolvente: {lados[0]:,.1f} m")
    ax.text(0.02, 0.98, txt.replace(",", "X").replace(".", ",").replace("X", "."), transform=ax.transAxes, va="top",
            fontsize=10, color=TEXTO, bbox=dict(fc="white", ec="#cccccc"))
    ax.set_title(f"{titulo} · ÁREA DO EVENTO", color=TEXTO, fontsize=12)
    _escala(ax, 20)
    fig.savefig(destino, dpi=130, facecolor=FUNDO)
    plt.close(fig)


def pontos_de_vista(area, geo, cenas, destino: Path, titulo: str):
    fig, ax = plt.subplots(figsize=(10, 12), facecolor=FUNDO)
    _desenhar_planta(ax, area, geo)
    OR = area.origem
    for c in [c for c in cenas if c["perspectiva"]]:
        o = np.array(c["olho"][:2]) + OR[:2]
        a = np.array(c["alvo"][:2]) + OR[:2]
        v = a - o
        n = np.linalg.norm(v) or 1
        ang = math.radians(c.get("fov", 60) / 2)
        L = 40
        dirs = [np.array([math.cos(t) * v[0] - math.sin(t) * v[1], math.sin(t) * v[0] + math.cos(t) * v[1]]) / n * L for t in (-ang, ang)]
        ax.add_patch(MplPolygon([o, o + dirs[0], o + dirs[1]], closed=True, fc="#e69f00", alpha=0.25, ec="#b07800", lw=0.6))
        ax.text(*o, c["nome"], fontsize=6, color=TEXTO)
    ax.set_title(f"{titulo} · CENAS E PONTOS DE VISTA", color=TEXTO)
    fig.savefig(destino, dpi=130, facecolor=FUNDO)
    plt.close(fig)


def isometrica(modelo: dict, destino: Path, titulo: str, max_faces: int = 120000):
    faces, cores = [], []
    luz = np.array([-0.4, -0.5, 0.77])
    luz /= np.linalg.norm(luz)
    for o in objetos_planificados(modelo):
        if o["kind"] in ("planar",):
            continue
        vs = np.array(o["vertices"])
        base = np.array(_rgb(o["color"]))
        for fc in o["faces"]:
            p = vs[fc]
            n = np.cross(p[1] - p[0], p[2] - p[0])
            nn = np.linalg.norm(n)
            k = 0.55 + 0.45 * abs(float(n @ luz) / nn) if nn else 0.8
            faces.append(p)
            cores.append(np.clip(base * k, 0, 1))
    if len(faces) > max_faces:
        passo = len(faces) // max_faces + 1
        faces, cores = faces[::passo], cores[::passo]
    fig = plt.figure(figsize=(14, 11), facecolor="#b9bcbd")
    ax = fig.add_subplot(projection="3d", computed_zorder=False)
    ax.set_proj_type("ortho")
    # Arestas na cor da face escondem as frestas de antisserrilhamento entre triângulos.
    ax.add_collection3d(Poly3DCollection(faces, facecolors=cores, edgecolors=cores, linewidths=0.15))
    todos = np.concatenate([np.array(f) for f in faces])
    mn, mx = todos.min(axis=0), todos.max(axis=0)
    ext = np.maximum(mx - mn, 1.0)
    ax.set_xlim(mn[0], mx[0])
    ax.set_ylim(mn[1], mx[1])
    ax.set_zlim(mn[2], mn[2] + ext[2])
    ax.set_box_aspect(tuple(ext), zoom=1.35)  # mesma escala nos três eixos
    ax.view_init(elev=32, azim=-58)
    ax.axis("off")
    ax.set_facecolor("#b9bcbd")
    fig.suptitle(titulo, color=TEXTO, fontsize=14)
    fig.savefig(destino, dpi=130, facecolor="#b9bcbd")
    plt.close(fig)
