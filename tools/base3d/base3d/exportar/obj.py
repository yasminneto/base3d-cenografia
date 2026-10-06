"""OBJ + MTL (porta export_formats.py do R03), com texturas opcionais (nível detalhado).

Faces de N lados são mantidas (como no R03) ou trianguladas/quadrangularizadas
com `so_tri_quad=True`, para programas que não aceitam polígonos longos.
"""
from __future__ import annotations

import collections
import shutil
from pathlib import Path

import numpy as np

from .comum import objetos_planificados, uv_face


def _quebrar(face):
    if len(face) <= 4:
        return [face]
    return [[face[0], face[i], face[i + 1]] for i in range(1, len(face) - 1)]


def exportar_obj(modelo: dict, destino: Path, materiais: dict | None = None,
                 so_tri_quad: bool = False) -> dict:
    destino = Path(destino)
    materiais = materiais or {}
    flat = objetos_planificados(modelo)
    mtl = destino.with_suffix(".mtl")
    contagem = collections.Counter()
    OR = modelo["origin"]
    with destino.open("w", encoding="utf8") as f:
        f.write(f"# Base3D / metros / Z para cima / origem local E{OR[0]:.0f} N{OR[1]:.0f} EPSG:{modelo['epsg']}\n")
        f.write(f"# UTM = local + {OR[0]:.3f},{OR[1]:.3f},0\n")
        f.write(f"mtllib {mtl.name}\n")
        ov, ovt = 1, 1
        for o in flat:
            f.write(f"o {o['name']}\ng {o['layer']}\nusemtl {o['layer']}\n")
            f.write(f"s {'off' if o['kind'] in ('building', 'box', 'curb') else '1'}\n")
            vs = np.array(o["vertices"], dtype=float)
            for p in vs:
                f.write("v " + " ".join(f"{c:.6f}" for c in p) + "\n")
            tex = materiais.get(o["layer"])
            faces = [q for fc in o["faces"] for q in (_quebrar(fc) if so_tri_quad else [fc])]
            for fc in faces:
                contagem[len(fc)] += 1
                if tex:
                    uv = uv_face(vs[fc], tex["largura_m"], tex["altura_m"])
                    for u, v in uv:
                        f.write(f"vt {u:.5f} {v:.5f}\n")
                    f.write("f " + " ".join(f"{i + ov}/{ovt + k}" for k, i in enumerate(fc)) + "\n")
                    ovt += len(fc)
                else:
                    f.write("f " + " ".join(str(i + ov) for i in fc) + "\n")
            ov += len(vs)
    pasta_tex = destino.parent / "texturas"
    with mtl.open("w", encoding="utf8") as f:
        for camada, cor in {o["layer"]: o["color"] for o in flat}.items():
            f.write(f"newmtl {camada}\nKd {' '.join(f'{c / 255:.4f}' for c in cor)}\nKa 0.15 0.15 0.15\nKs 0 0 0\nd 1\nillum 1\n")
            tex = materiais.get(camada)
            if tex:
                pasta_tex.mkdir(exist_ok=True)
                shutil.copy2(tex["textura"], pasta_tex / tex["textura"].name)
                f.write(f"map_Kd texturas/{tex['textura'].name}\n")
            f.write("\n")
    return dict(objects=len(flat), face_sizes=dict(sorted(contagem.items())),
                buildings=sum(o["kind"] == "building" for o in flat),
                textured_layers=sorted(materiais), import_axes="Z up", units="metros")


def reler_obj(caminho: Path) -> dict:
    """Reimporta o OBJ e confere contagens e índices (substitui a conferência no Blender)."""
    nv = nvt = 0
    objetos = 0
    mn = [float("inf")] * 3
    mx = [float("-inf")] * 3
    tamanhos = collections.Counter()
    erros = 0
    for linha in Path(caminho).read_text(encoding="utf8").splitlines():
        if linha.startswith("v "):
            nv += 1
            for k, c in enumerate(map(float, linha.split()[1:4])):
                mn[k], mx[k] = min(mn[k], c), max(mx[k], c)
        elif linha.startswith("vt "):
            nvt += 1
        elif linha.startswith("o "):
            objetos += 1
        elif linha.startswith("f "):
            idx = [int(t.split("/")[0]) for t in linha.split()[1:]]
            tamanhos[len(idx)] += 1
            if max(idx) > nv or min(idx) < 1 or len(set(idx)) != len(idx):
                erros += 1
    # Envelope: com Z para cima, a extensão vertical é muito menor que a horizontal.
    # Se não for, o arquivo foi gravado com eixo trocado (o terreno "em pé" do caso Paulista).
    ext = [b - a for a, b in zip(mn, mx)] if nv else [0, 0, 0]
    return dict(objects=objetos, vertices=nv, uv=nvt, face_sizes=dict(sorted(tamanhos.items())),
                invalid_faces=erros, envelope_min=[round(v, 3) for v in mn] if nv else None,
                envelope_max=[round(v, 3) for v in mx] if nv else None,
                z_para_cima_ok=bool(nv) and ext[2] < max(ext[0], ext[1]))
