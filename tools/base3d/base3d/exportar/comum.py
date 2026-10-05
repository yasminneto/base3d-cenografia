"""Funções compartilhadas pelos exportadores."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np


def objetos_planificados(modelo: dict) -> list[dict]:
    """Objetos + instâncias expandidas (como flat.json do R03), em coordenadas locais."""
    flat = []
    for ob in modelo["objects"]:
        o = dict(ob)
        if o.get("inner_profiles") or o.get("export_faces"):
            o["faces"] = o.get("export_faces", o["faces"])
        flat.append(o)
    for inst in modelo["instances"]:
        for parte in modelo["definitions"][inst["definition"]]:
            o = dict(parte)
            o["name"] = inst["name"] + "_" + parte["name"]
            o["vertices"] = (np.array(parte["vertices"]) * inst["scale"] + inst["position"]).tolist()
            flat.append(o)
    return flat


def carregar_materiais(pasta: Path | None) -> dict:
    """Biblioteca opcional: <pasta>/materiais.json = {categoria: {textura, largura_m, altura_m}}."""
    if not pasta:
        return {}
    cfg = Path(pasta) / "materiais.json"
    if not cfg.exists():
        return {}
    d = json.loads(cfg.read_text(encoding="utf8"))
    out = {}
    for cat, m in d.items():
        tex = Path(pasta) / m["textura"]
        if tex.exists():
            out[cat] = dict(textura=tex, largura_m=float(m.get("largura_m", 1.0)),
                            altura_m=float(m.get("altura_m", m.get("largura_m", 1.0))),
                            rugosidade=m.get("rugosidade"))
    return out


def uv_face(vs: np.ndarray, largura: float, altura: float) -> np.ndarray:
    """Projeção planar por face: topo usa XY; paredes usam (ao longo da face, Z)."""
    n = np.cross(vs[1] - vs[0], vs[2] - vs[0])
    norma = np.linalg.norm(n)
    n = n / norma if norma else np.array([0, 0, 1.0])
    if abs(n[2]) > 0.7:
        return np.c_[vs[:, 0] / largura, vs[:, 1] / altura]
    h = np.array([-n[1], n[0]])
    h = h / (np.linalg.norm(h) or 1)
    return np.c_[(vs[:, 0] * h[0] + vs[:, 1] * h[1]) / largura, vs[:, 2] / altura]
