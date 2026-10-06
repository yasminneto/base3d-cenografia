"""Orquestra o processo completo: pedido -> pacote de entrega verificado.

Etapas (cada uma corresponde a um script do R03):
  área (novo) -> fontes (explore_sources + downloads) -> classificação (spatial_base)
  -> malha (build_model) -> cenas (novo) -> exportação (export_skp, export_formats,
  export_cad) -> vistas -> verificação e pacote (package_revision)
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import shutil
import time
import traceback
import unicodedata
import zipfile
from pathlib import Path

from . import __version__
from .area import montar_area
from .cenas import montar_cenas
from .classificacao import classificar
from .config import METODOS, Pedido
from .exportar.comum import carregar_materiais
from .fontes import carregar_fonte
from .geo import feature, write_geojson
from .lapidacao import carregar_lapidacoes
from .malha import montar_modelo
from .verificacao import lista_pendencias_md, montar_relatorio, topologia_edificacoes


def slug(txt: str) -> str:
    t = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", t).strip("_") or "Base"


class Registro:
    def __init__(self, verbose=True):
        self.verbose = verbose
        self.t0 = time.time()

    def __call__(self, msg):
        if self.verbose:
            print(f"[{time.time() - self.t0:6.1f}s] {msg}", flush=True)


def _tentar(formatos, avisos, chave, fn, rotulo):
    try:
        formatos[chave] = fn()
    except Exception as e:  # um formato falhar não derruba os demais
        formatos[chave] = dict(erro=str(e))
        avisos.append(f"{rotulo} não gerado: {e}")
        if not isinstance(e, (RuntimeError, ImportError)):
            formatos[chave]["traceback"] = traceback.format_exc(limit=3)


def executar(caminho_pedido: str | Path, skp: bool = True, dwg: bool = True, sdk_dir: str | None = None,
             verbose: bool = True) -> dict:
    log = Registro(verbose)
    pedido = Pedido.carregar(caminho_pedido)
    erros = pedido.validar()
    if erros:
        raise ValueError("Pedido inválido:\n- " + "\n- ".join(erros))
    avisos = pedido.avisos()
    perfil = pedido.perfil
    rev = f"R{len(pedido.lapidacoes) + 1:02d}"
    prefixo = f"{slug(pedido.nome)}_{rev}"
    saida = Path(pedido.saida) / prefixo
    trabalho = saida / "trabalho"
    fontes_dir = saida / "fontes"
    for p in (saida, trabalho, fontes_dir):
        p.mkdir(parents=True, exist_ok=True)
    log(f"Pedido {pedido.codigo} · nível {perfil['rotulo']} · saída {saida}")

    area = montar_area(pedido)
    log(f"Área: {area.poligono.area:,.1f} m² · EPSG:{area.epsg} · origem {area.origem[:2].tolist()} · extensão {area.extensao}")
    dados = carregar_fonte(pedido, area, fontes_dir)
    log(f"Fontes: {len(dados.quadras)} quadras, {len(dados.lotes)} lotes, {len(dados.edificacoes)} edificações, "
        f"{len(dados.logradouros)} eixos, {0 if dados.amostras_terreno is None else len(dados.amostras_terreno)} cotas")
    lapidacoes, av = carregar_lapidacoes(pedido.lapidacoes, area)
    avisos += av
    if dados.licenca.get("pendente"):
        avisos.append(f"Licença das fontes a confirmar antes de entrega comercial: {dados.licenca.get('nota', '')}")
    if "não informado" in dados.datum_vertical or "confirmar" in dados.datum_vertical.lower():
        avisos.append(f"Datum vertical: {dados.datum_vertical}. Cotas servem para desníveis relativos, não absolutos.")
    contrato = dict(
        gerador="base3d", versao_gerador=__version__, pedido=pedido.codigo, revisao=f"R{len(pedido.lapidacoes) + 1:02d}",
        nivel=pedido.nivel, crs_horizontal=f"EPSG:{area.epsg}", datum_vertical=dados.datum_vertical, unidade="metro",
        origem_local_E=float(area.origem[0]), origem_local_N=float(area.origem[1]), origem_local_Z=0.0,
        eixo_vertical="Z", entorno_m=pedido.entorno, recorte=pedido.recorte,
        fonte=pedido.fonte, atribuicao=dados.atribuicao, licenca=dados.licenca.get("resumo", ""),
        datas_fontes="; ".join(f"{k}: {v}" for k, v in dados.datas.items() if v),
        gerado_em=dt.datetime.now().isoformat(timespec="seconds"),
    )
    geo = classificar(area, dados, perfil, lapidacoes)
    log(f"Classificação: {geo.estatisticas['superficies']} superfícies, {geo.estatisticas['edificacoes']} edificações, "
        f"{geo.estatisticas['arvores']} árvores, {geo.estatisticas['postes']} postes")

    feats = [feature(s["g"], category=s["categoria"], object_name=s["nome"], source=s["fonte"],
                     confidence=s["confianca"], status=s["status"], metodo=s.get("metodo", "derived"))
             for s in geo.superficies + geo.pinturas]
    feats += [feature(p["g"], category="07_EDIFICACOES", object_name=p["nome"], source=p["fonte"],
                      confidence=p["confianca"], status=p["status"], base=p["base"], height=p["altura"],
                      id_origem=str(p.get("id")), **{f"metodo_{k}": v for k, v in p.get("metodos", {}).items()})
              for p in geo.edificacoes]
    feats.append(feature(area.poligono, category="00_LIMITE_EVENTO", object_name="Limite_evento",
                         source="Polígono do pedido", confidence="exata", status="pedido"))
    write_geojson(feats, saida / f"{prefixo}_geografia.geojson", area.epsg)
    from shapely.geometry import Point
    write_geojson([feature(Point(i["x"], i["y"]), category="08_ARVORES_COPAS" if i["tipo"] == "arvore" else "10_POSTES",
                           object_name=i["nome"], copa_m=i["copa"], altura_m=i["altura"], source=i["fonte"],
                           confidence=i["confianca"], metodo=i.get("metodo", "estimated")) for i in geo.instancias],
                  saida / f"{prefixo}_arvores_postes.geojson", area.epsg)

    modelo, malha_rel = montar_modelo(area, geo, dados, perfil)
    (trabalho / "model.json").write_text(json.dumps(modelo, separators=(",", ":")))
    log(f"Malha: {malha_rel}")
    cenas = montar_cenas(area, perfil, dados.elevacao(), pedido.pontos_de_vista)
    (trabalho / "cenas.json").write_text(json.dumps(cenas, indent=2, ensure_ascii=False))
    topologia = topologia_edificacoes(modelo)
    materiais = carregar_materiais(pedido.materiais) if perfil["materiais"] == "texturas" else {}

    titulo = f"{pedido.nome} {rev} - base organizada para edicao"
    descricao = (f"{rev} ({perfil['rotulo']}): {pedido.finalidade or 'sem finalidade'}; geometria oficial "
                 f"derivada + {len(pedido.lapidacoes)} rodada(s) de lapidação. Origem local EPSG:{area.epsg} "
                 f"E{area.origem[0]:.0f} N{area.origem[1]:.0f}. Base remota preliminar, não é levantamento.")
    formatos = {}

    from .exportar.obj import exportar_obj, reler_obj
    obj = saida / f"{prefixo}_modelo.obj"
    _tentar(formatos, avisos, "obj", lambda: dict(exportar_obj(modelo, obj, materiais), releitura=reler_obj(obj)), "OBJ")
    log("OBJ/MTL gravados")
    from .exportar.rhino import exportar_3dm
    _tentar(formatos, avisos, "rhino", lambda: exportar_3dm(modelo, saida / f"{prefixo}_Rhino6.3dm", cenas, titulo, materiais,
                                                                      contrato=contrato),
            "Rhino 3DM")
    log("3DM gravado")

    from .exportar.cad import converter_dwg, exportar_dxf
    hoje = dt.date.today().strftime("%d-%m-%Y")
    notas = [f"{pedido.nome.upper()} {rev} | {perfil['rotulo'].upper()} | {hoje}",
             f"Fontes: {dados.atribuicao}".strip(),
             "Sem levantamento de campo. Árvores, postes e itens interpretados são estimativas.",
             f"Unidades: metros. EPSG:{area.epsg}. Origem local E{area.origem[0]:.0f} N{area.origem[1]:.0f}.",
             "Limite do pedido preservado sem deslocamento." + (" Inclui faixa de pista." if pedido.inclui_pista else "")]
    _tentar(formatos, avisos, "cad", lambda: exportar_dxf(area, geo, dados, modelo, saida, prefixo, notas), "DXF")
    if dwg and "erro" not in formatos.get("cad", {}):
        dxfs = [saida / f"{prefixo}_base_local.dxf", saida / f"{prefixo}_base_UTM.dxf"]
        conv = converter_dwg(dxfs)
        formatos["dwg"] = conv
        if not conv.get("convertido"):
            avisos.append(f"DWG não gerado ({conv.get('motivo', 'falha na conversão')}); entregues os DXF equivalentes.")
    log("DXF/DWG processados")

    if skp:
        from .exportar.skp import exportar_skp
        _tentar(formatos, avisos, "skp", lambda: exportar_skp(modelo, saida / f"{prefixo}_SketchUp2026.skp", cenas, titulo,
                                                              descricao, materiais, sdk_dir, contrato), "SKP")
    else:
        avisos.append("SKP não gerado (desativado nesta execução).")
    log("SKP processado")

    if dados.ortofoto and Path(dados.ortofoto).exists():
        shutil.copy2(dados.ortofoto, saida / f"{prefixo}_ortofoto.jpg")
        jgw = Path(dados.ortofoto).with_suffix(".jgw")
        if jgw.exists():
            shutil.copy2(jgw, saida / f"{prefixo}_ortofoto.jgw")
    if pedido.kml:
        shutil.copy2(pedido.kml, fontes_dir / f"Poligono_original{Path(pedido.kml).suffix}")

    from .exportar import vistas
    fontes_txt = f"Fontes: {dados.atribuicao}. Pavimentos derivados do cadastro; itens interpretados indicados. Não constitui levantamento executivo."
    nome_up = f"{pedido.nome.upper()} | BASE PARA ESTUDO DO EVENTO"
    gerar = {
        "planta": lambda: vistas.planta(area, geo, dados, saida / f"{prefixo}_planta.png", nome_up, fontes_txt),
        "isometrica": lambda: vistas.isometrica(modelo, saida / f"{prefixo}_vista_3D.png", nome_up),
        "area_evento": lambda: vistas.area_evento(area, geo, saida / f"{prefixo}_area_evento.png", pedido.nome.upper()),
        "pontos_de_vista": lambda: vistas.pontos_de_vista(area, geo, cenas, saida / f"{prefixo}_cenas_planta.png", pedido.nome.upper()),
    }
    formatos["vistas"] = {}
    for v in perfil["vistas_png"]:
        _tentar(formatos["vistas"], avisos, v, lambda v=v: gerar[v]() or "ok", f"Vista {v}")
    log("Vistas PNG geradas")
    if perfil.get("renders"):
        avisos.append("Renders fotorrealistas: abrir o .skp e renderizar as cenas PV_* e 03/07 no motor de render "
                      "(V-Ray, Enscape ou D5). As câmeras já estão posicionadas.")

    rel = montar_relatorio(pedido, area, geo, malha_rel, topologia, formatos, avisos, dados.log, contrato)
    (saida / f"{prefixo}_contrato.json").write_text(json.dumps(contrato, indent=2, ensure_ascii=False), encoding="utf8")
    (saida / f"VERIFICACAO_{rev}.json").write_text(json.dumps(rel, indent=2, ensure_ascii=False, default=str), encoding="utf8")
    (saida / f"PENDENCIAS_{rev}.md").write_text(lista_pendencias_md(rel), encoding="utf8")
    (saida / "LEIA-ME.txt").write_text(leia_me(pedido, area, geo, dados, prefixo, rev, cenas, rel), encoding="utf8")
    zip_path = empacotar(saida, prefixo, rev)
    log(f"Pacote: {zip_path}")
    return dict(saida=str(saida), pacote=str(zip_path), relatorio=rel)


def empacotar(saida: Path, prefixo: str, rev: str) -> Path:
    arquivos = [p for p in sorted(saida.rglob("*")) if p.is_file() and "trabalho" not in p.parts
                and p.name != f"MANIFESTO_{rev}.json"]
    manifesto = {p.relative_to(saida).as_posix(): dict(bytes=p.stat().st_size,
                                                       sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                 for p in arquivos}
    man = saida / f"MANIFESTO_{rev}.json"
    man.write_text(json.dumps(manifesto, indent=2), encoding="utf8")
    arquivos.append(man)
    destino = saida.parent / f"{prefixo}_completo.zip"
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        for p in arquivos:
            z.write(p, f"{prefixo}/{p.relative_to(saida).as_posix()}")
    with zipfile.ZipFile(destino) as z:
        if z.testzip() is not None or len(z.infolist()) != len(arquivos):
            raise AssertionError("Pacote ZIP corrompido")
    return destino


def leia_me(pedido, area, geo, dados, prefixo, rev, cenas, rel) -> str:
    perfil = pedido.perfil
    e = geo.estatisticas
    r = area.resumo()

    def br(v, casas=2):
        return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")

    linhas = [
        f"{pedido.nome.upper()} — BASE {perfil['rotulo'].upper()} ({rev})",
        f"Pedido: {pedido.codigo} · Finalidade: {pedido.finalidade or '-'} · Preparação: {dt.date.today():%d/%m/%Y}",
        "",
        "COMECE AQUI",
        f"SketchUp 2026: {prefixo}_SketchUp2026.skp (cenas prontas: " + ", ".join(c["nome"] for c in cenas) + ").",
        f"AutoCAD 2026: {prefixo}_base_local.dwg (perto da origem) ou {prefixo}_base_UTM.dwg (coordenadas completas).",
        f"   Se o DWG não estiver no pacote, abra os .dxf equivalentes. Modelo 3D para AutoCAD: {prefixo}_modelo3D_local.dxf.",
        f"Rhino: {prefixo}_Rhino6.3dm (extrusões nativas, blocos, vistas nomeadas) ou {prefixo}_modelo.obj + .mtl.",
        "   Importar OBJ em METROS, eixo Z para cima.",
        f"QGIS: {prefixo}_geografia.geojson + {prefixo}_ortofoto.jpg (georreferenciada pelo .jgw).",
        "",
        "RECORTE E REFERÊNCIA",
        f"Polígono: {r['vertices_kml']} vértices preservados, sem deslocamento" + (" (APROXIMADO: gerado de centro + área)" if area.aproximado else "") + ".",
        f"Área: {br(r['area_m2'])} m². Perímetro: {br(r['perimetro_m'])} m. Entorno modelado: {br(pedido.entorno, 0)} m.",
        f"Sistema: EPSG:{area.epsg} (SIRGAS 2000 / UTM). X = leste, Y = norte de quadrícula, Z = altitude. Unidade: metro.",
        f"Origem dos modelos locais (OBJ, SKP, 3DM, DXF local): E = {br(area.origem[0], 3)} m; N = {br(area.origem[1], 3)} m; Z = 0.",
        "Para voltar ao UTM, somar esses valores às coordenadas locais.",
        "",
        "CONTEÚDO",
        f"- {e['edificacoes']} volumes de edificação ({e['edificacoes_com_patio']} com pátio interno), base e altura do cadastro;",
        f"  {e['alturas_padrao_aplicadas']} com altura padrão por falta de dado.",
        f"- {e['superficies']} superfícies classificadas: " + ", ".join(f"{k} {br(v, 0)} m²" for k, v in e["areas_m2"].items()) + ".",
        f"- Meio-fio vertical: {br(e['meio_fio_m'], 0)} m" + (f" (altura {perfil['altura_meio_fio_m']} m, pista rebaixada)." if perfil.get("meio_fio") else " (não modelado neste nível)."),
        f"- {e['arvores']} árvores e {e['postes']} postes como componentes reutilizáveis (posições e dimensões estimadas).",
        "- Base plana Z=0 (tag 90, oculta) para desenhar o evento; contornos 2D (tag 91, oculta).",
        "",
        "ORGANIZAÇÃO (tags / layers)",
    ] + [f"   {k}" for k in sorted({s['categoria'] for s in geo.superficies} | {'00_LIMITE_EVENTO', '07_EDIFICACOES'})] + [
        "",
        "COMO CADA DADO FOI OBTIDO (campo 'metodo' em cada objeto do SKP, 3DM e GeoJSON)",
    ] + [f"   {k}: {v}" for k, v in METODOS.items()] + [
        "No SketchUp: selecione o objeto > Janela > Informações da entidade, ou via Ruby:",
        "   Sketchup.active_model.selection[0].attribute_dictionary('base3d').to_a",
        "Nas edificações o método vem por atributo (metodo_geometria, metodo_base, metodo_altura).",
        "",
        "DISTÂNCIAS DO LIMITE DO EVENTO (cada uma diz de onde até onde)",
    ] + [f"- até {d['ate']}: {br(d['distancia_m'])} m ({d['metodo_ate']}). {d['nota']}".rstrip()
         for d in rel.get("distancias_evento", [])] + [
        "",
        "PRECISÃO E LIMITAÇÕES",
        f"Precisão estimada do nível: {perfil['precisao_estimada']}.",
        "Pistas e calçadas derivam do cadastro (limite de quadra = meio-fio; limite de lote = alinhamento).",
        "Itens com origem 'interpretada' ou 'lapidado_R*' foram desenhados sobre ortofoto: conferir em vistoria.",
        "Não há fachadas, rampas pequenas, degraus, tampas ou pontos elétricos. Água em Z=0 é só referência.",
        f"Datum vertical: {dados.datum_vertical}.",
        "Resolução da malha não é exatidão: o terreno segue a resolução do MDT de origem.",
        "Esta entrega atende estudo de ocupação e volumetria. Não substitui levantamento para locação de estruturas.",
        "",
        "PENDÊNCIAS",
    ] + [f"- {p}" for p in rel["pendencias"]] + [
        "",
        "COMO FAZER A PRÓXIMA RODADA DE LAPIDAÇÃO",
        f"1. Abra {prefixo}_geografia.geojson e a ortofoto no QGIS.",
        "2. Crie uma camada GeoJSON nova e desenhe só o que muda, com o campo 'categoria'",
        "   (ex.: 04_CALCADAS_CAMINHOS, 05_CICLOVIA, 06_AGUA, 02_PRAIA_AREIA, arvore, poste) e, se preciso, 'acao'",
        "   (adicionar, substituir, remover, ajustar_altura) e 'altura_m' / 'copa_m'.",
        "3. Acrescente o arquivo em 'lapidacoes' no pedido.json e rode de novo: a revisão sobe (R02, R03...).",
        "",
        "FONTES",
    ] + [f"- {k}: {v}" for k, v in dados.rotulos.items()] + [
        f"Atribuição obrigatória em apresentações derivadas: {dados.atribuicao}.",
        f"Licença: {dados.licenca.get('resumo', 'não informada')}." + (f" {dados.licenca.get('nota', '')}" if dados.licenca.get("pendente") else ""),
        "Não foram usadas texturas, imagens ou geometrias 3D extraídas do Google Earth/Maps: só o polígono",
        "desenhado pelo cliente. As políticas do Google proíbem derivar modelos 3D ou geodados das suas imagens e malhas.",
        "",
        "VERIFICAÇÕES",
        f"Ver VERIFICACAO_{rev}.json e PENDENCIAS_{rev}.md. Geometria e interoperabilidade verificadas; não acurácia de campo.",
    ]
    return "\n".join(linhas) + "\n"
