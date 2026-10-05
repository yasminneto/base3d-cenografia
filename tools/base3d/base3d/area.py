"""Área de trabalho: polígono do pedido, recorte, origem local.

Substitui os valores fixos do R03 (B=[686150,7460800,686750,7461750] e
origem E686470 N7461290), que agora são calculados a partir do polígono:
recorte arredondado a 50 m e origem arredondada a 10 m, a mesma convenção
observada em Botafogo.
"""
from __future__ import annotations

import io
import math
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon, box
from shapely.geometry.polygon import orient

from .config import Pedido


def epsg_sirgas_utm(lon: float, lat: float) -> int:
    """SIRGAS 2000 / UTM: 319xx para o hemisfério sul (zonas 17S a 25S)."""
    zona = int((lon + 180) // 6) + 1
    if lat < 0 and 17 <= zona <= 25:
        return 31960 + zona
    return (32700 if lat < 0 else 32600) + zona  # WGS 84 / UTM fora do Brasil


def ler_kml(caminho: Path) -> list[dict]:
    """Lê KML ou KMZ. Devolve polígonos como listas (lon, lat) externas e internas."""
    caminho = Path(caminho)
    raw = caminho.read_bytes()
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            nome = next(n for n in z.namelist() if n.lower().endswith(".kml"))
            raw = z.read(nome)
    root = ET.fromstring(raw)
    ns = re.match(r"\{.*\}", root.tag)
    ns = ns.group(0) if ns else ""

    def coords(el):
        txt = el.find(f".//{ns}coordinates").text.strip()
        pts = [tuple(float(v) for v in c.split(",")[:2]) for c in txt.split()]
        return pts

    out = []
    for placemark in root.iter(f"{ns}Placemark"):
        nome = placemark.findtext(f"{ns}name") or ""
        for poly in placemark.iter(f"{ns}Polygon"):
            outer = coords(poly.find(f"{ns}outerBoundaryIs"))
            inner = [coords(b) for b in poly.findall(f"{ns}innerBoundaryIs")]
            out.append(dict(nome=nome, externo=outer, internos=inner))
    if not out:
        raise ValueError(f"Nenhum polígono encontrado em {caminho}")
    return out


@dataclass
class AreaDeTrabalho:
    epsg: int
    poligono: Polygon  # UTM
    origem: np.ndarray  # (E, N, 0)
    recorte: Polygon  # área modelada (buffer ou retângulo)
    extensao: tuple[float, float, float, float]  # retângulo de download, múltiplo de 50 m
    aproximado: bool
    vertices_kml: int
    lonlat: list[tuple[float, float]]

    @property
    def caixa(self) -> Polygon:
        return box(*self.extensao)

    def para_utm(self):
        return Transformer.from_crs(4326, self.epsg, always_xy=True)

    def para_lonlat(self):
        return Transformer.from_crs(self.epsg, 4326, always_xy=True)

    def resumo(self) -> dict:
        return dict(
            epsg=self.epsg,
            area_m2=round(self.poligono.area, 2),
            perimetro_m=round(self.poligono.length, 2),
            vertices_kml=self.vertices_kml,
            poligono_aproximado=self.aproximado,
            origem=[float(v) for v in self.origem],
            extensao=list(self.extensao),
            area_recorte_m2=round(self.recorte.area, 1),
        )


def _arredonda_fora(v: float, passo: float, para_cima: bool) -> float:
    return (math.ceil(v / passo) if para_cima else math.floor(v / passo)) * passo


def montar_area(pedido: Pedido) -> AreaDeTrabalho:
    aproximado = False
    if pedido.kml:
        poly = ler_kml(pedido.kml)[0]
        lonlat = poly["externo"]
        internos = poly["internos"]
    else:
        lat, lon = pedido.centro
        lonlat, internos, aproximado = None, [], True

    ref_lon, ref_lat = (lonlat[0] if lonlat else (pedido.centro[1], pedido.centro[0]))
    epsg = pedido.epsg or epsg_sirgas_utm(ref_lon, ref_lat)
    tr = Transformer.from_crs(4326, epsg, always_xy=True)

    if lonlat:
        ext = [tr.transform(x, y) for x, y in lonlat]
        ints = [[tr.transform(x, y) for x, y in r] for r in internos]
        poligono = orient(Polygon(ext, ints), sign=1)
        if not poligono.is_valid:
            poligono = poligono.buffer(0)
        vertices = len(lonlat) - (1 if lonlat[0] == lonlat[-1] else 0)
    else:
        cx, cy = tr.transform(lon, lat)
        lado = math.sqrt(pedido.area_m2)
        poligono = box(cx - lado / 2, cy - lado / 2, cx + lado / 2, cy + lado / 2)
        lonlat = [Transformer.from_crs(epsg, 4326, always_xy=True).transform(x, y)
                  for x, y in poligono.exterior.coords]
        vertices = 4

    entorno = pedido.entorno
    buf = poligono.buffer(entorno, quad_segs=16)
    xmin, ymin, xmax, ymax = buf.bounds
    extensao = (_arredonda_fora(xmin, 50, False), _arredonda_fora(ymin, 50, False),
                _arredonda_fora(xmax, 50, True), _arredonda_fora(ymax, 50, True))
    recorte = buf if pedido.recorte == "entorno" else box(*extensao)
    c = poligono.centroid
    origem = np.array([round(c.x / 10) * 10, round(c.y / 10) * 10, 0.0])
    return AreaDeTrabalho(epsg=epsg, poligono=poligono, origem=origem, recorte=recorte,
                          extensao=extensao, aproximado=aproximado, vertices_kml=vertices,
                          lonlat=lonlat)
