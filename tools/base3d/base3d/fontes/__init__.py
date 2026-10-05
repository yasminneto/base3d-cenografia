"""Fontes de dados. Cada fonte devolve um DadosFonte no sistema UTM da área."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator


@dataclass
class DadosFonte:
    quadras: list[dict] = field(default_factory=list)      # {g, attr}
    lotes: list[dict] = field(default_factory=list)        # {g, attr}
    edificacoes: list[dict] = field(default_factory=list)  # {g, base, altura, id, attr}
    logradouros: list[dict] = field(default_factory=list)  # {g: LineString, nome, id}
    ciclovias: list[dict] = field(default_factory=list)    # {g: LineString}
    arvores: list[dict] = field(default_factory=list)      # {g: Point, copa, altura}
    amostras_terreno: np.ndarray | None = None             # N x 3 (E, N, Z)
    ortofoto: Path | None = None
    rotulos: dict = field(default_factory=dict)            # camada -> descrição da fonte
    atribuicao: str = ""
    log: list[str] = field(default_factory=list)

    def elevacao(self):
        """Interpolador linear com vizinho mais próximo nas bordas (como no R03)."""
        s = self.amostras_terreno
        if s is None or len(s) == 0:
            return lambda xy: np.zeros(len(np.atleast_2d(xy)))
        if len(s) < 3:
            z0 = float(np.mean(s[:, 2]))
            return lambda xy: np.full(len(np.atleast_2d(xy)), z0)
        lin = LinearNDInterpolator(s[:, :2], s[:, 2])
        near = NearestNDInterpolator(s[:, :2], s[:, 2])

        def f(xy):
            xy = np.atleast_2d(np.asarray(xy, dtype=float))
            z = np.asarray(lin(xy), dtype=float)
            bad = ~np.isfinite(z)
            if bad.any():
                z[bad] = near(xy[bad])
            return z
        return f


def amostras_terreno_pontos(area, perto_m: float = 10, longe_m: float = 25):
    """Grade de amostragem: 10 m junto ao polígono, 25 m no entorno (padrão R01/R03)."""
    from shapely import contains_xy
    pts = []
    perto = area.poligono.buffer(50)
    x0, y0, x1, y1 = area.recorte.bounds
    for passo, zona in [(perto_m, perto), (longe_m, area.recorte)]:
        xs = np.arange(np.floor(x0 / passo) * passo, x1 + passo, passo)
        ys = np.arange(np.floor(y0 / passo) * passo, y1 + passo, passo)
        gx, gy = np.meshgrid(xs, ys)
        gx, gy = gx.ravel(), gy.ravel()
        mask = contains_xy(zona.buffer(passo), gx, gy)
        if passo == longe_m:
            mask &= ~contains_xy(perto, gx, gy)
        pts.extend(zip(gx[mask], gy[mask]))
    pts.extend(list(area.poligono.exterior.coords)[:-1])
    return np.unique(np.round(np.array(pts), 3), axis=0)


def carregar_fonte(pedido, area, pasta_cache: Path) -> DadosFonte:
    if pedido.fonte == "local":
        from .local import FonteLocal
        return FonteLocal(pedido.fonte_local, area).carregar()
    from .arcgis import FonteArcGIS
    return FonteArcGIS(pedido.fonte, area, pasta_cache,
                       resolucao_orto=pedido.perfil["ortofoto_resolucao_m"]).carregar()
