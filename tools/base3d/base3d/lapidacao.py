"""Rodadas de lapidação.

Cada rodada é um GeoJSON (lon/lat ou UTM) desenhado no QGIS sobre a ortofoto
ou exportado de um trabalho anterior. As propriedades aceitas:

    categoria   código (ex.: "04_CALCADAS_CAMINHOS"), só o número ("04") ou apelido ("calcada").
                Os códigos do R03 (ex.: "03_RUAS_IPP2013") também são aceitos pelo número.
    acao        "adicionar" (padrão), "substituir", "remover" ou "ajustar_altura" (edificações).
    altura_m, base_m        edificações e postes
    copa_m, altura_m        árvores (pontos)
    fonte, confianca, nota  rastreabilidade (opcionais)

Polígonos de superfície recortam as demais superfícies e entram na categoria
indicada; a origem fica registrada como "lapidado_R<n>".
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import transform

from .config import CATEGORIAS

APELIDOS = {
    "limite": "00", "contexto": "01", "praia": "02", "areia": "02", "pista": "03", "rua": "03",
    "calcada": "04", "calçada": "04", "caminho": "04", "ciclovia": "05", "agua": "06", "água": "06",
    "edificacao": "07", "edificação": "07", "predio": "07", "arvore": "08", "árvore": "08",
    "poste": "10", "canteiro": "11", "lote": "12", "meio_fio": "13", "meio-fio": "13",
    "pintura": "16", "areia_umida": "17",
}
POR_NUMERO = {c[:2]: c for c in CATEGORIAS}
POR_NUMERO["09"] = "08_ARVORES_COPAS"  # tronco e copa formam uma só árvore


def normalizar_categoria(valor: str) -> str | None:
    if not valor:
        return None
    v = str(valor).strip()
    if v in CATEGORIAS:
        return v
    chave = APELIDOS.get(v.lower())
    if chave:
        return POR_NUMERO[chave]
    return POR_NUMERO.get(v[:2]) if v[:2].isdigit() else None


@dataclass
class ItemLapidacao:
    rodada: int
    categoria: str
    acao: str
    g: object
    props: dict
    arquivo: str

    @property
    def status(self) -> str:
        return f"lapidado_R{self.rodada}"

    @property
    def fonte(self) -> str:
        return self.props.get("fonte") or f"Lapidação R{self.rodada} ({self.arquivo})"

    @property
    def confianca(self) -> str:
        return self.props.get("confianca", "alta")


def carregar_lapidacoes(arquivos: list[Path], area) -> tuple[list[ItemLapidacao], list[str]]:
    itens, avisos = [], []
    tr = area.para_utm()
    for n, caminho in enumerate(arquivos, start=1):
        d = json.loads(Path(caminho).read_text(encoding="utf8"))
        ignorados = 0
        for f in d.get("features", []):
            p = f.get("properties") or {}
            cat = normalizar_categoria(p.get("categoria") or p.get("category"))
            if not cat or not f.get("geometry"):
                ignorados += 1
                continue
            g = shape(f["geometry"])
            x0, y0, x1, y1 = g.bounds
            if abs(x0) <= 180 and abs(y1) <= 90:
                g = transform(tr.transform, g)
            if not g.is_valid:
                g = g.buffer(0)
            itens.append(ItemLapidacao(rodada=int(p.get("rodada", n)), categoria=cat,
                                       acao=p.get("acao", "adicionar"), g=g, props=p,
                                       arquivo=Path(caminho).name))
        if ignorados:
            avisos.append(f"{Path(caminho).name}: {ignorados} feição(ões) sem categoria reconhecida ignorada(s).")
    return itens, avisos
