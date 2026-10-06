"""Rhino .3dm nativo (porta export_formats.py do R03).

Edificações como extrusões sólidas com pátios (furos), superfícies como malhas,
árvores/postes como blocos, contornos 2D em camadas ocultas e, novidade,
as cenas gravadas como vistas nomeadas.
"""
from __future__ import annotations

import collections
from pathlib import Path

import rhino3dm as r


def exportar_3dm(modelo: dict, destino: Path, cenas: list[dict], titulo: str,
                 materiais: dict | None = None, versao: int = 6, contrato: dict | None = None) -> dict:
    materiais = materiais or {}
    rh = r.File3dm()
    rh.Settings.ModelUnitSystem = r.UnitSystem.Meters
    rh.Settings.ModelAbsoluteTolerance = 0.001
    camadas, mats = {}, {}

    def camada(nome, cor=(100, 110, 110), visivel=True):
        if nome not in camadas:
            ly = r.Layer()
            ly.Name = nome
            ly.Color = (*cor, 255)
            ly.Visible = visivel
            camadas[nome] = rh.Layers.Add(ly)
        return camadas[nome]

    def material(nome, cor):
        if nome not in mats:
            m = r.Material()
            m.Name = nome
            m.DiffuseColor = (*cor, 255)
            tex = materiais.get(nome)
            if tex:
                t = r.Texture()
                t.FileName = str(tex["textura"])
                m.SetBitmapTexture(t)
            mats[nome] = rh.Materials.Add(m)
        return mats[nome]

    def atributos(nome, cam, cor=(100, 110, 110), visivel=True):
        a = r.ObjectAttributes()
        a.Name = nome
        a.LayerIndex = camada(cam, tuple(cor), visivel)
        a.MaterialIndex = material(cam, tuple(cor))
        a.MaterialSource = r.ObjectMaterialSource.MaterialFromObject
        return a

    def malha(o):
        m = r.Mesh()
        m.Vertices.UseDoublePrecisionVertices = True
        for p in o["vertices"]:
            m.Vertices.Add(*p)
        for fc in o.get("export_faces", o["faces"]):
            if len(fc) <= 4:
                m.Faces.AddFace(*fc)
            else:
                for i in range(1, len(fc) - 1):
                    m.Faces.AddFace(fc[0], fc[i], fc[i + 1])
        m.Normals.ComputeNormals()
        m.Compact()
        if not m.IsValid:
            raise AssertionError(f"Malha inválida no 3DM: {o['name']}")
        return m

    furos = 0
    for o in modelo["objects"]:
        a = atributos(o["name"], o["layer"], o["color"])
        for chave, valor in (o.get("attributes") or dict(fonte=o.get("source", ""), confianca=o.get("confidence", ""))).items():
            a.SetUserString(str(chave), str(valor))
        if o["kind"] == "building":
            pts = [r.Point3d(x, y, o["base"]) for x, y in o["profile"]]
            crv = r.PolylineCurve(pts + [pts[0]])
            plano = r.Plane(r.Point3d(0, 0, o["base"]), r.Vector3d(0, 0, 1))
            ex = r.Extrusion.CreateWithPlane(crv, plano, o["height"], True)
            for anel in o["inner_profiles"]:
                p2 = [r.Point3d(x, y, 0) for x, y in anel]
                if not ex.AddInnerProfile(r.PolylineCurve(p2 + [p2[0]])):
                    raise AssertionError(f"Pátio inválido em {o['name']}")
                furos += 1
            if not (ex and ex.IsValid and ex.IsSolid):
                raise AssertionError(f"Extrusão inválida: {o['name']}")
            rh.Objects.AddExtrusion(ex, a)
        else:
            rh.Objects.AddMesh(malha(o), a)
    defs = {}
    for nome, partes in modelo["definitions"].items():
        geos = tuple(malha(p) for p in partes)
        attrs = tuple(atributos(p["name"], p["layer"], p["color"]) for p in partes)
        idx = rh.InstanceDefinitions.Add(nome, "Representação esquemática; posição e dimensões estimadas",
                                         "", "", r.Point3d(0, 0, 0), geos, attrs)
        defs[nome] = rh.InstanceDefinitions[idx].Id
    for o in modelo["instances"]:
        t = r.Transform.Scale(r.Plane.WorldXY(), *o["scale"])
        t.M03, t.M13, t.M23 = o["position"]
        a = atributos(o["name"], o["layer"])
        for chave, valor in (o.get("attributes") or {}).items():
            a.SetUserString(str(chave), str(valor))
        rh.Objects.AddInstanceObject(r.InstanceReference(defs[o["definition"]], t), a)
    for o in modelo["curves"]:
        for i, anel in enumerate([o["outer"]] + o["holes"]):
            pts = [r.Point3d(x, y, 0) for x, y in anel]
            if o.get("closed", True):
                pts += [pts[0]]
            rh.Objects.AddCurve(r.PolylineCurve(pts), atributos(f"{o['name']}_{i}", "91_CONTORNOS_2D::" + o["layer"], visivel=False))
    vistas = 0
    for c in cenas:
        try:
            vi = r.ViewInfo()
            vi.Name = c["nome"]
            vp = vi.Viewport
            olho, alvo = r.Point3d(*c["olho"]), r.Point3d(*c["alvo"])
            vp.SetCameraLocation(olho)
            vp.SetCameraDirection(r.Vector3d(alvo.X - olho.X, alvo.Y - olho.Y, alvo.Z - olho.Z))
            vp.SetCameraUp(r.Vector3d(*c["cima"]))
            if c["perspectiva"]:
                vp.ChangeToPerspectiveProjection(olho.DistanceTo(alvo), True, 50)
            else:
                vp.ChangeToParallelProjection(True)
            vi.Viewport = vp
            rh.NamedViews.Add(vi)
            vistas += 1
        except Exception:  # vistas nomeadas são conveniência; não bloqueiam a entrega
            pass
    rh.ApplicationName = titulo
    # rhino3dm não grava texto de documento; o contrato vai nos detalhes do arquivo e no *_contrato.json.
    resumo = "; ".join(f"{k}={v}" for k, v in (contrato or {}).items()
                       if k in ("versao_gerador", "crs_horizontal", "datum_vertical", "origem_local_E", "origem_local_N"))
    rh.ApplicationDetails = "Base pública + modelagem remota. Não é levantamento de campo. " + resumo
    if not rh.Write(str(destino), versao):
        raise AssertionError("Falha ao gravar 3DM")
    chk = r.File3dm.Read(str(destino))
    contagem = collections.Counter(type(o.Geometry).__name__ for o in chk.Objects)
    if not all(o.Geometry.IsValid for o in chk.Objects):
        raise AssertionError("Objetos inválidos ao reler o 3DM")
    return dict(rhino=dict(contagem), rhino_inner_profiles=furos, named_views=vistas,
                buildings=sum(o["kind"] == "building" for o in modelo["objects"]),
                instances=len(modelo["instances"]))
