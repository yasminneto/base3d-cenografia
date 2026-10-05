"""DXF (2D e 3D) e conversão para DWG (porta export_cad.py do R03).

O R03 escrevia o DXF com ezdxf e usava o AutoCAD Core Console só para
converter em DWG 2018 e rodar AUDIT. Aqui a conversão aceita dois conversores:
- ODA File Converter (gratuito; recomendado para servidor);
- AutoCAD Core Console (accoreconsole.exe), quando houver licença na máquina.
Sem conversor disponível, os DXF são entregues e a pendência fica registrada.
"""
from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import ezdxf
from ezdxf.colors import rgb2int
from ezdxf.enums import TextEntityAlignment

from ..config import cor
from ..geo import parts


def _curvas_nivel(amostras: np.ndarray, recorte, intervalo=1.0):
    if amostras is None or len(amostras) < 4 or np.ptp(amostras[:, 2]) < intervalo:
        return []
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from shapely.geometry import LineString
    fig, ax = plt.subplots()
    niveis = np.arange(math.floor(amostras[:, 2].min()), math.ceil(amostras[:, 2].max()) + intervalo, intervalo)
    cs = ax.tricontour(amostras[:, 0], amostras[:, 1], amostras[:, 2], levels=niveis)
    out = []
    for nivel, segs in zip(cs.levels, cs.allsegs):
        for seg in segs:
            if len(seg) > 1:
                for ln in parts(LineString(seg).intersection(recorte), "LineString"):
                    if ln.length > 1:
                        out.append((float(nivel), ln))
    plt.close(fig)
    return out


def exportar_dxf(area, geo, dados, modelo: dict, pasta: Path, prefixo: str, notas: list[str]) -> dict:
    curvas = _curvas_nivel(dados.amostras_terreno, area.recorte)
    relatorio = {}
    orto_px = None
    if dados.ortofoto and Path(dados.ortofoto).exists():
        from PIL import Image
        with Image.open(dados.ortofoto) as im:
            orto_px = im.size
    for modo in ["local", "UTM"]:
        doc = ezdxf.new("R2018")
        doc.units = 6
        doc.header["$INSUNITS"] = 6
        doc.header["$MEASUREMENT"] = 1
        doc.header["$LUNITS"] = 2
        doc.header["$LUPREC"] = 3
        ms = doc.modelspace()
        desl = area.origem[:2] if modo == "local" else np.zeros(2)

        def xy(p):
            return tuple(np.array(p[:2]) - desl)

        def camada(nome, c=(130, 130, 130), desligada=False):
            if nome not in doc.layers:
                doc.layers.add(nome, true_color=rgb2int(tuple(c)), lineweight=13)
            if desligada:
                doc.layers.get(nome).off()
            return nome

        def poligono(g, cam):
            for pg in parts(g):
                for anel in [pg.exterior] + list(pg.interiors):
                    ms.add_lwpolyline([xy(p) for p in list(anel.coords)[:-1]], close=True, dxfattribs={"layer": cam})

        for s in geo.superficies + geo.pinturas:
            poligono(s["g"], camada(s["categoria"], cor(s["categoria"])))
        for p in geo.edificacoes:
            poligono(p["g"], camada("07_EDIFICACOES", cor("07_EDIFICACOES")))
        poligono(area.poligono, camada("00_LIMITE_EVENTO", cor("00_LIMITE_EVENTO")))
        camada("13_MEIO_FIO", cor("13_MEIO_FIO"))
        for ln in geo.meio_fio:
            ms.add_lwpolyline([xy(p) for p in ln.coords], dxfattribs={"layer": "13_MEIO_FIO"})
        camada("14_NOMES_LOGRADOUROS", (50, 65, 70))
        camada("15_NOTAS", (50, 65, 70))
        for ref in geo.referencias:
            cam = camada(ref["camada"] + "_REF", (140, 140, 140), True)
            poligono(ref["g"], cam)
        camada("93_EIXOS_LOGRADOUROS", (70, 90, 120), True)
        maiores = {}
        for e in geo.eixos:
            for ln in parts(e["g"], "LineString"):
                ms.add_lwpolyline([xy(p) for p in ln.coords], dxfattribs={"layer": "93_EIXOS_LOGRADOUROS"})
                if e["nome"] not in maiores or ln.length > maiores[e["nome"]].length:
                    maiores[e["nome"]] = ln
        for nome, ln in maiores.items():
            if ln.length < 40:
                continue
            meio = ln.interpolate(0.5, normalized=True)
            a, b = ln.interpolate(0.45, normalized=True), ln.interpolate(0.55, normalized=True)
            ang = (math.degrees(math.atan2(b.y - a.y, b.x - a.x)) + 90) % 180 - 90
            ms.add_text(nome, dxfattribs={"layer": "14_NOMES_LOGRADOUROS", "height": 2.2, "rotation": ang}).set_placement(
                xy(meio.coords[0]), align=TextEntityAlignment.MIDDLE_CENTER)
        for bloco in ["ARVORE_ESTIMADA", "POSTE_CANDIDATO"]:
            if bloco not in doc.blocks:
                b = doc.blocks.new(bloco)
                b.add_circle((0, 0), 1, dxfattribs={"layer": "0", "color": 0})
        for i in geo.instancias:
            arvore = i["tipo"] == "arvore"
            esc = i["copa"] / 2 if arvore else 0.25
            cam = camada("08_ARVORES_COPAS" if arvore else "10_POSTES", cor("08_ARVORES_COPAS" if arvore else "10_POSTES"))
            ms.add_blockref("ARVORE_ESTIMADA" if arvore else "POSTE_CANDIDATO", xy((i["x"], i["y"])),
                            dxfattribs={"layer": cam, "xscale": esc, "yscale": esc, "zscale": 1})
        camada("94_CURVAS_NIVEL_1M", (130, 105, 85), True)
        camada("95_COTAS_TERRENO", (130, 105, 85), True)
        for z, ln in curvas:
            ms.add_lwpolyline([xy(p) for p in ln.coords], dxfattribs={"layer": "94_CURVAS_NIVEL_1M", "elevation": z})
        if dados.amostras_terreno is not None:
            for x, y, z in dados.amostras_terreno[::8]:
                ms.add_text(f"{z:.2f}", dxfattribs={"layer": "95_COTAS_TERRENO", "height": 1.2}).set_placement(xy((x, y)))
        x0, y0, x1, y1 = area.extensao
        if orto_px:
            camada("90_ORTOFOTO", desligada=True)
            img = doc.add_image_def(filename=f"{prefixo}_ortofoto.jpg", size_in_pixel=orto_px)
            ms.add_image(img, insert=xy((x0, y0)), size_in_units=(x1 - x0, y1 - y0), dxfattribs={"layer": "90_ORTOFOTO"})
        for k, t in enumerate(notas):
            ms.add_text(t, dxfattribs={"layer": "15_NOTAS", "height": 2.5}).set_placement(xy((x0, y0 - 12 - k * 5)))
        auditoria = doc.audit()
        if auditoria.has_errors:
            raise AssertionError(f"DXF {modo} com erros de auditoria: {len(auditoria.errors)}")
        destino = pasta / f"{prefixo}_base_{modo}.dxf"
        doc.saveas(destino)
        relatorio[modo] = dict(entities=len(ms), layers=len(doc.layers), audit_errors=0, unit_meters=True,
                               arquivo=destino.name)
    relatorio["3D"] = _exportar_dxf_3d(modelo, pasta / f"{prefixo}_modelo3D_local.dxf")
    return relatorio


def _exportar_dxf_3d(modelo: dict, destino: Path) -> dict:
    """Superfícies e volumes como POLYFACE por camada, em coordenadas locais (AutoCAD 3D)."""
    from .comum import objetos_planificados
    doc = ezdxf.new("R2018")
    doc.units = 6
    ms = doc.modelspace()
    n = 0
    for o in objetos_planificados(modelo):
        if o["layer"] not in doc.layers:
            doc.layers.add(o["layer"], true_color=rgb2int(tuple(o["color"])))
        faces = []
        for fc in o["faces"]:
            if len(fc) <= 4:
                faces.append(fc)
            else:
                faces += [[fc[0], fc[i], fc[i + 1]] for i in range(1, len(fc) - 1)]
        pf = ms.add_polyface(dxfattribs={"layer": o["layer"]})
        vs = o["vertices"]
        pf.append_faces([[tuple(vs[i]) for i in fc] for fc in faces])
        pf.optimize()
        n += 1
    doc.saveas(destino)
    return dict(polyfaces=n, arquivo=destino.name)


def localizar_conversor() -> tuple[str, str] | None:
    """ODA primeiro (sem licença do AutoCAD no servidor); depois o AutoCAD mais recente."""
    def instalados(raiz, padrao):
        return sorted((str(p) for p in Path(raiz).glob(padrao)), reverse=True) if Path(raiz).exists() else []

    oda = [os.environ.get("ODA_FILE_CONVERTER"), shutil.which("ODAFileConverter")]
    oda += instalados("C:/Program Files/ODA", "ODAFileConverter*/ODAFileConverter.exe")
    for c in oda:
        if c and Path(c).exists():
            return "oda", c
    acad = [os.environ.get("ACCORECONSOLE")]
    acad += instalados("C:/Program Files/Autodesk", "AutoCAD 20*/accoreconsole.exe")
    for c in acad:
        if c and Path(c).exists():
            return "autocad", c
    return None


def converter_dwg(dxfs: list[Path], timeout: int = 600) -> dict:
    conv = localizar_conversor()
    if not conv:
        return dict(convertido=False, motivo="Nenhum conversor encontrado (ODA File Converter ou AutoCAD Core Console).")
    tipo, exe = conv
    feitos = []
    if tipo == "oda":
        with tempfile.TemporaryDirectory() as ent, tempfile.TemporaryDirectory() as sai:
            for d in dxfs:
                shutil.copy2(d, Path(ent) / d.name)
            subprocess.run([exe, ent, sai, "ACAD2018", "DWG", "0", "1", "*.DXF"], check=True, timeout=timeout)
            for d in dxfs:
                out = Path(sai) / (d.stem + ".dwg")
                if out.exists():
                    shutil.copy2(out, d.with_suffix(".dwg"))
                    feitos.append(d.with_suffix(".dwg").name)
    else:
        for d in dxfs:
            dwg = d.with_suffix(".dwg")
            scr = d.with_suffix(".scr")
            scr.write_text("\n".join([
                '(setvar "FILEDIA" 0)', '(setvar "CMDECHO" 0)',
                f'(command "_.DXFIN" "{d.as_posix()}")', '(command "_.ZOOM" "_E")',
                f'(command "_.SAVEAS" "2018" "{dwg.as_posix()}")', '(command "_.AUDIT" "_Y")',
                '(command "_.QSAVE")', "_.QUIT", "_N", ""]))
            subprocess.run([exe, "/s", str(scr)], check=True, timeout=timeout,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            scr.unlink(missing_ok=True)
            if dwg.exists():
                feitos.append(dwg.name)
    return dict(convertido=len(feitos) == len(dxfs), conversor=tipo, arquivos=feitos)
