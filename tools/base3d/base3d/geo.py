"""Utilidades geométricas comuns (portadas de spatial_base.py do R03)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from shapely import make_valid
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union


def parts(g, typ: str = "Polygon") -> list:
    """Achata qualquer geometria em uma lista do tipo pedido."""
    if g is None or g.is_empty:
        return []
    if g.geom_type == typ:
        return [g]
    if hasattr(g, "geoms"):
        return [p for sub in g.geoms for p in parts(sub, typ)]
    return []


def union(geoms):
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    return unary_union(geoms) if geoms else Polygon()


def esripoly(rings):
    """Anéis ESRI JSON -> polígono válido (externos horários, furos anti-horários)."""
    polys = [make_valid(Polygon(np.array(r)[:, :2])) for r in rings if len(r) > 3]
    flat = [p for g in polys for p in parts(g)]
    outers = [p for p in flat if not p.exterior.is_ccw]
    holes = [p for p in flat if p.exterior.is_ccw]
    if not outers:
        outers, holes = flat, []
    return make_valid(union(outers).difference(union(holes)))


def clean(g, min_area: float = 0.01):
    """Remove lascas numéricas e devolve apenas polígonos."""
    g = make_valid(g)
    ps = [p for p in parts(g) if p.area >= min_area]
    return union(ps)


def feature(g, **props) -> dict:
    return dict(type="Feature", geometry=mapping(g), properties=props)


def write_geojson(features: list, path: Path, epsg: int):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(
        json.dumps(dict(type="FeatureCollection",
                        crs=dict(type="name", properties=dict(name=f"EPSG:{epsg}")),
                        features=features)),
        encoding="utf8",
    )
