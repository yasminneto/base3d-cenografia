"""SketchUp .skp via SketchUp C SDK (porta export_skp.py do R03).

Requer o SDK oficial do SketchUp (Windows ou macOS), que dispensa o
SketchUp instalado. Informe a pasta com SketchUpAPI.dll (Windows) ou
SketchUpAPI.framework (macOS) na variável SKETCHUP_SDK_DIR.

O R03 recortava as declarações das funções de outro script com exec(); aqui
elas ficam declaradas neste módulo, com tipos explícitos.

Organização do arquivo (igual ao R03, que já foi aprovada):
  grupos raiz 01_Superficies_3D, 02_Edificacoes, 03_Vegetacao, 04_Postes,
  05_Meio_fio, 90_Base_PLANA_edicao_Z0 (oculto) e 91_Contornos_2D (oculto);
  uma tag por categoria; árvores e postes como componentes; arestas internas
  de terreno e copas suaves; unidade de exibição em metros.
Novo: cenas calculadas por nível (cenas.py) e texturas no nível detalhado.
"""
from __future__ import annotations

import ctypes as C
import os
import platform
from pathlib import Path

POL = 1 / 0.0254  # o formato .skp grava em polegadas


class Ref(C.Structure):
    _fields_ = [("ptr", C.c_void_p)]


class P3(C.Structure):
    _fields_ = [("x", C.c_double), ("y", C.c_double), ("z", C.c_double)]


class V3(C.Structure):
    _fields_ = [("x", C.c_double), ("y", C.c_double), ("z", C.c_double)]


class Cor(C.Structure):
    _fields_ = [("red", C.c_ubyte), ("green", C.c_ubyte), ("blue", C.c_ubyte), ("alpha", C.c_ubyte)]


class Caixa(C.Structure):
    _fields_ = [("min_point", P3), ("max_point", P3)]


class Transformacao(C.Structure):
    _fields_ = [("values", C.c_double * 16)]


ptr, size, b, d, s = C.POINTER(Ref), C.c_size_t, C.c_bool, C.c_double, C.c_char_p
psize = C.POINTER(C.c_size_t)

ASSINATURAS = {
    "SUInitialize": [], "SUTerminate": [],
    "SUModelCreate": [ptr], "SUModelRelease": [ptr], "SUModelGetEntities": [Ref, ptr],
    "SUModelSetName": [Ref, s], "SUModelSetDescription": [Ref, s],
    "SUModelGetOptionsManager": [Ref, ptr], "SUOptionsManagerGetOptionsProviderByName": [Ref, s, ptr],
    "SUOptionsProviderSetValue": [Ref, s, Ref],
    "SUTypedValueCreate": [ptr], "SUTypedValueSetInt32": [Ref, C.c_int32], "SUTypedValueRelease": [ptr],
    "SUModelAddLayers": [Ref, size, ptr], "SULayerCreate": [ptr], "SULayerSetName": [Ref, s],
    "SULayerSetVisibility": [Ref, b],
    "SUModelAddMaterials": [Ref, size, ptr], "SUMaterialCreate": [ptr], "SUMaterialSetName": [Ref, s],
    "SUMaterialSetColor": [Ref, C.POINTER(Cor)], "SUMaterialSetTexture": [Ref, Ref],
    "SUTextureCreateFromFile": [ptr, s, d, d],
    "SUGroupCreate": [ptr], "SUGroupSetName": [Ref, s], "SUEntitiesAddGroup": [Ref, Ref],
    "SUGroupGetEntities": [Ref, ptr], "SUDrawingElementSetLayer": [Ref, Ref],
    "SUDrawingElementSetMaterial": [Ref, Ref],
    "SUGeometryInputCreate": [ptr], "SUGeometryInputRelease": [ptr],
    "SUGeometryInputSetVertices": [Ref, size, C.POINTER(P3)],
    "SUGeometryInputAddFace": [Ref, ptr, psize], "SUGeometryInputFaceAddInnerLoop": [Ref, size, ptr],
    "SUGeometryInputAddEdge": [Ref, size, size, psize],
    "SULoopInputCreate": [ptr], "SULoopInputAddVertexIndex": [Ref, size],
    "SULoopInputEdgeSetSoft": [Ref, size, b], "SULoopInputEdgeSetSmooth": [Ref, size, b],
    "SUEntitiesFill": [Ref, Ref, b],
    "SUComponentDefinitionCreate": [ptr], "SUComponentDefinitionSetName": [Ref, s],
    "SUModelAddComponentDefinitions": [Ref, size, ptr], "SUComponentDefinitionGetEntities": [Ref, ptr],
    "SUComponentDefinitionCreateInstance": [Ref, ptr], "SUComponentInstanceSetName": [Ref, s],
    "SUComponentInstanceSetTransform": [Ref, C.POINTER(Transformacao)], "SUEntitiesAddInstance": [Ref, Ref, C.c_void_p],
    "SUCameraCreate": [ptr], "SUCameraSetOrientation": [Ref, C.POINTER(P3), C.POINTER(P3), C.POINTER(V3)],
    "SUCameraSetPerspective": [Ref, b], "SUCameraSetOrthographicFrustumHeight": [Ref, d],
    "SUCameraSetPerspectiveFrustumFOV": [Ref, d],
    "SUSceneCreate": [ptr], "SUSceneSetName": [Ref, s], "SUSceneSetUseCamera": [Ref, b], "SUSceneSetCamera": [Ref, Ref],
    "SUModelAddScenes": [Ref, size, ptr], "SUModelSetCamera": [Ref, ptr],
    "SUModelSaveToFile": [Ref, s], "SUModelCreateFromFileWithStatus": [ptr, s, C.POINTER(C.c_int)],
    "SUEntitiesGetNumInstances": [Ref, psize], "SUEntitiesGetNumFaces": [Ref, psize],
    "SUEntitiesGetNumEdges": [Ref, b, psize], "SUEntitiesGetEdges": [Ref, b, size, ptr, psize],
    "SUEdgeGetSoft": [Ref, C.POINTER(C.c_bool)], "SUEntitiesGetNumGroups": [Ref, psize],
    "SUEntitiesGetGroups": [Ref, size, ptr, psize], "SUEntitiesGetBoundingBox": [Ref, C.POINTER(Caixa)],
}
RETORNA_REF = ["SUGroupToDrawingElement", "SUComponentInstanceToDrawingElement"]


class SDK:
    def __init__(self, pasta: str | None = None):
        pasta = pasta or os.environ.get("SKETCHUP_SDK_DIR")
        if not pasta:
            raise RuntimeError("Defina SKETCHUP_SDK_DIR com a pasta do SketchUp C SDK (SketchUpAPI.dll).")
        if platform.system() == "Windows":
            os.add_dll_directory(pasta)
            self.lib = C.CDLL(str(Path(pasta) / "SketchUpAPI.dll"))
        else:
            self.lib = C.CDLL(str(Path(pasta) / "SketchUpAPI.framework" / "SketchUpAPI"))
        for nome, args in ASSINATURAS.items():
            f = getattr(self.lib, nome)
            f.argtypes, f.restype = args, C.c_int
        for nome in RETORNA_REF:
            f = getattr(self.lib, nome)
            f.argtypes, f.restype = [Ref], Ref

    def __call__(self, nome, *args):
        r = getattr(self.lib, nome)(*args)
        if r != 0:
            raise RuntimeError(f"{nome} falhou com SUResult={r}")

    def criar(self, nome) -> Ref:
        ref = Ref()
        self(nome, C.byref(ref))
        return ref


def exportar_skp(modelo: dict, destino: Path, cenas: list[dict], titulo: str, descricao: str,
                 materiais: dict | None = None, sdk_dir: str | None = None) -> dict:
    su = SDK(sdk_dir)
    materiais = materiais or {}
    su("SUInitialize")
    try:
        model = su.criar("SUModelCreate")
        ents = Ref()
        su("SUModelGetEntities", model, C.byref(ents))
        su("SUModelSetName", model, titulo.encode("utf8"))
        su("SUModelSetDescription", model, descricao.encode("utf8"))
        gerente, prov = Ref(), Ref()
        su("SUModelGetOptionsManager", model, C.byref(gerente))
        su("SUOptionsManagerGetOptionsProviderByName", gerente, b"UnitsOptions", C.byref(prov))
        val = su.criar("SUTypedValueCreate")
        for chave, valor in [("LengthUnit", 4), ("LengthFormat", 0), ("LengthPrecision", 3)]:  # metros, decimal
            su("SUTypedValueSetInt32", val, valor)
            su("SUOptionsProviderSetValue", prov, chave.encode(), val)
        su("SUTypedValueRelease", C.byref(val))
        tags, mats = {}, {}

        def tag(nome, visivel=True):
            if nome not in tags:
                ly = su.criar("SULayerCreate")
                su("SULayerSetName", ly, nome.encode("utf8"))
                su("SUModelAddLayers", model, 1, C.byref(ly))
                su("SULayerSetVisibility", ly, visivel)
                tags[nome] = ly
            return tags[nome]

        def material(camada, cor):
            if camada not in mats:
                m = su.criar("SUMaterialCreate")
                su("SUMaterialSetName", m, camada.encode("utf8"))
                c = Cor(*cor, 255)
                su("SUMaterialSetColor", m, C.byref(c))
                tex = materiais.get(camada)
                if tex:
                    t = Ref()
                    # Escala da textura em polegadas por unidade de textura; conferir no SketchUp.
                    su("SUTextureCreateFromFile", C.byref(t), str(tex["textura"]).encode("utf8"),
                       1 / (tex["largura_m"] * POL), 1 / (tex["altura_m"] * POL))
                    su("SUMaterialSetTexture", m, t)
                su("SUModelAddMaterials", model, 1, C.byref(m))
                mats[camada] = m
            return mats[camada]

        def grupo(pai, nome, camada=None, cor=None):
            g = su.criar("SUGroupCreate")
            su("SUGroupSetName", g, nome.encode("utf8"))
            su("SUEntitiesAddGroup", pai, g)
            el = su.lib.SUGroupToDrawingElement(g)
            if camada:
                su("SUDrawingElementSetLayer", el, tag(camada))
            if cor:
                su("SUDrawingElementSetMaterial", el, material(camada, cor))
            ge = Ref()
            su("SUGroupGetEntities", g, C.byref(ge))
            return ge

        def preencher(pai, o, em_grupo=True):
            ge = grupo(pai, o["name"], o.get("layer"), o.get("color")) if em_grupo else pai
            geom = su.criar("SUGeometryInputCreate")
            vs = o["vertices"]
            arr = (P3 * len(vs))(*[P3(*(c * POL for c in v)) for v in vs])
            su("SUGeometryInputSetVertices", geom, len(vs), arr)
            adj = {}
            for fi, face in enumerate(o["faces"]):
                for a, bb in zip(face, face[1:] + face[:1]):
                    adj.setdefault(tuple(sorted((a, bb))), []).append(fi)
            kind = o.get("kind")
            suaves = {e for e, fs in adj.items() if len(fs) == 2 and
                      (kind in ("surface", "organic", "reference") or (kind == "cylinder" and min(fs) >= 2))}
            for fi, face in enumerate(o["faces"]):
                loop = su.criar("SULoopInputCreate")
                for j in face:
                    su("SULoopInputAddVertexIndex", loop, j)
                for i, (a, bb) in enumerate(zip(face, face[1:] + face[:1])):
                    if tuple(sorted((a, bb))) in suaves:
                        su("SULoopInputEdgeSetSoft", loop, i, True)
                        su("SULoopInputEdgeSetSmooth", loop, i, True)
                idx = C.c_size_t()
                su("SUGeometryInputAddFace", geom, C.byref(loop), C.byref(idx))
                for anel in o.get("holes", {}).get(str(fi), []):
                    interno = su.criar("SULoopInputCreate")
                    for j in anel:
                        su("SULoopInputAddVertexIndex", interno, j)
                    su("SUGeometryInputFaceAddInnerLoop", geom, idx.value, C.byref(interno))
            su("SUEntitiesFill", ge, geom, True)
            su("SUGeometryInputRelease", C.byref(geom))

        raizes = {k: grupo(ents, k, k) for k in ["01_Superficies_3D", "02_Edificacoes", "03_Vegetacao", "04_Postes",
                                                  "05_Meio_fio", "90_Base_PLANA_edicao_Z0", "91_Contornos_2D"]}
        for o in modelo["objects"]:
            raiz = {"building": "02_Edificacoes", "curb": "05_Meio_fio"}.get(o["kind"], "01_Superficies_3D")
            preencher(raizes[raiz], o)
        defs = {}
        for nome, partes in modelo["definitions"].items():
            dfn = su.criar("SUComponentDefinitionCreate")
            su("SUComponentDefinitionSetName", dfn, nome.encode())
            su("SUModelAddComponentDefinitions", model, 1, C.byref(dfn))
            de = Ref()
            su("SUComponentDefinitionGetEntities", dfn, C.byref(de))
            for parte in partes:
                preencher(de, parte)
            defs[nome] = dfn
        for o in modelo["instances"]:
            ins = Ref()
            su("SUComponentDefinitionCreateInstance", defs[o["definition"]], C.byref(ins))
            su("SUComponentInstanceSetName", ins, o["name"].encode())
            sx, sy, sz = o["scale"]
            x, y, z = (v * POL for v in o["position"])
            t = Transformacao((C.c_double * 16)(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1))
            su("SUComponentInstanceSetTransform", ins, C.byref(t))
            raiz = "03_Vegetacao" if o["definition"].startswith("Arvore") else "04_Postes"
            su("SUEntitiesAddInstance", raizes[raiz], ins, None)
            su("SUDrawingElementSetLayer", su.lib.SUComponentInstanceToDrawingElement(ins), tag(o["layer"]))
        for o in modelo["planar"]:
            preencher(raizes["90_Base_PLANA_edicao_Z0"], o)
        for o in modelo["curves"]:
            ge = grupo(raizes["91_Contornos_2D"], o["name"])
            geom = su.criar("SUGeometryInputCreate")
            aneis = [o["outer"]] + o["holes"]
            pts = [p for anel in aneis for p in anel]
            arr = (P3 * len(pts))(*[P3(p[0] * POL, p[1] * POL, 0) for p in pts])
            su("SUGeometryInputSetVertices", geom, len(pts), arr)
            off = 0
            for anel in aneis:
                n = len(anel) if o.get("closed", True) else len(anel) - 1
                for i in range(n):
                    su("SUGeometryInputAddEdge", geom, off + i, off + (i + 1) % len(anel), None)
                off += len(anel)
            su("SUEntitiesFill", ge, geom, True)
            su("SUGeometryInputRelease", C.byref(geom))
        for nome in ["90_Base_PLANA_edicao_Z0", "91_Contornos_2D"]:
            su("SULayerSetVisibility", tags[nome], False)

        def camera(c):
            cam = su.criar("SUCameraCreate")
            olho, alvo = P3(*(v * POL for v in c["olho"])), P3(*(v * POL for v in c["alvo"]))
            cima = V3(*c["cima"])
            su("SUCameraSetOrientation", cam, C.byref(olho), C.byref(alvo), C.byref(cima))
            su("SUCameraSetPerspective", cam, bool(c["perspectiva"]))
            if c["perspectiva"]:
                su("SUCameraSetPerspectiveFrustumFOV", cam, float(c.get("fov", 60)))
            else:
                su("SUCameraSetOrthographicFrustumHeight", cam, float(c["altura_orto"]) * POL)
            return cam

        for c in cenas:
            cena = su.criar("SUSceneCreate")
            su("SUSceneSetName", cena, c["nome"].encode("utf8"))
            su("SUSceneSetUseCamera", cena, True)
            su("SUSceneSetCamera", cena, camera(c))
            su("SUModelAddScenes", model, 1, C.byref(cena))
        if cenas:
            cam = camera(cenas[0])
            su("SUModelSetCamera", model, C.byref(cam))
        su("SUModelSaveToFile", model, str(destino).encode("utf8"))
        su("SUModelRelease", C.byref(model))
        return _validar(su, destino, modelo, cenas)
    finally:
        su("SUTerminate")


def _validar(su, caminho, modelo, cenas) -> dict:
    chk, status = Ref(), C.c_int()
    su("SUModelCreateFromFileWithStatus", C.byref(chk), str(caminho).encode("utf8"), C.byref(status))
    ent = Ref()
    su("SUModelGetEntities", chk, C.byref(ent))
    rel = dict(load_status=status.value, groups=0, instances=0, faces=0, soft_edges=0, scenes=len(cenas))

    def andar(e):
        for chave, fn in [("instances", "SUEntitiesGetNumInstances"), ("faces", "SUEntitiesGetNumFaces")]:
            n = C.c_size_t()
            su(fn, e, C.byref(n))
            rel[chave] += n.value
        n = C.c_size_t()
        su("SUEntitiesGetNumEdges", e, False, C.byref(n))
        if n.value:
            arestas, got = (Ref * n.value)(), C.c_size_t()
            su("SUEntitiesGetEdges", e, False, n.value, arestas, C.byref(got))
            for a in arestas:
                f = C.c_bool()
                su("SUEdgeGetSoft", a, C.byref(f))
                rel["soft_edges"] += f.value
        n = C.c_size_t()
        su("SUEntitiesGetNumGroups", e, C.byref(n))
        rel["groups"] += n.value
        if n.value:
            gs, got = (Ref * n.value)(), C.c_size_t()
            su("SUEntitiesGetGroups", e, n.value, gs, C.byref(got))
            for g in gs:
                ee = Ref()
                su("SUGroupGetEntities", g, C.byref(ee))
                andar(ee)

    andar(ent)
    cx = Caixa()
    su("SUEntitiesGetBoundingBox", ent, C.byref(cx))
    rel["bounds_m"] = {k: [getattr(getattr(cx, k + "_point"), ax) * 0.0254 for ax in "xyz"] for k in ["min", "max"]}
    su("SUModelRelease", C.byref(chk))
    if rel["instances"] != len(modelo["instances"]):
        raise AssertionError(f"SKP: instâncias {rel['instances']} != {len(modelo['instances'])}")
    return rel
