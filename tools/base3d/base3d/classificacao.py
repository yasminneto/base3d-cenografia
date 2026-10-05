"""Classificação da geografia nas categorias 00–17.

Porta o método de spatial_base.py (R03), que deduz o espaço viário do cadastro:
    pista   = terra − quadras, limitada a 35 m dos eixos de logradouro
              (no cadastro do IPP o limite da quadra coincide com o meio-fio)
    calçada = quadras urbanas − lotes (o limite do lote é o alinhamento predial)
    canteiro/área livre = quadras sem lotes significativos
Em seguida aplica as rodadas de lapidação, preservando a origem de cada pedaço.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from shapely.geometry import Point
from shapely.geometry.polygon import orient

from .config import CATEGORIAS
from .geo import clean, parts, union

BUFFER_EIXO_M = 35.0
LARGURA_PISTA_SEM_CADASTRO_M = 12.0
LARGURA_CICLOVIA_M = 2.5
OCUPACAO_LOTES_URBANA = 0.15
ALTURA_PADRAO_M = 9.0

SUPERFICIES = [c for c, v in CATEGORIAS.items() if v["tipo"] == "superficie"
               and c not in ("13_MEIO_FIO", "16_PINTURA_PISO")]


@dataclass
class Peca:
    g: object
    fonte: str
    confianca: str
    status: str = "base_automatica"


@dataclass
class Geografia:
    superficies: list[dict] = field(default_factory=list)
    pinturas: list[dict] = field(default_factory=list)
    edificacoes: list[dict] = field(default_factory=list)
    instancias: list[dict] = field(default_factory=list)
    meio_fio: list = field(default_factory=list)  # LineStrings
    eixos: list[dict] = field(default_factory=list)
    referencias: list[dict] = field(default_factory=list)  # quadras/lotes para o 2D
    estatisticas: dict = field(default_factory=dict)
    pendencias: list[str] = field(default_factory=list)


def classificar(area, dados, perfil: dict, lapidacoes: list) -> Geografia:
    geo = Geografia()
    D = area.recorte
    rot = dados.rotulos
    pecas: dict[str, list[Peca]] = {c: [] for c in SUPERFICIES}

    # ------------------------------------------------ base automática (cadastro)
    Q = union([q["g"] for q in dados.quadras])
    L = union([l["g"] for l in dados.lotes])
    eixos = [s for s in dados.logradouros if s["g"].intersects(area.caixa)]
    terra = D
    if dados.quadras:
        corredor = union([s["g"].buffer(BUFFER_EIXO_M) for s in eixos])
        pistas = terra.difference(Q).intersection(corredor)
        fonte_pista = f"{rot.get('quadras', 'Quadras')} + {rot.get('logradouros', 'eixos')} (terra − quadras, ≤35 m dos eixos)"
        conf_pista = "media"
    else:
        pistas = union([s["g"].buffer(LARGURA_PISTA_SEM_CADASTRO_M / 2, cap_style=2) for s in eixos]).intersection(terra)
        fonte_pista = f"{rot.get('logradouros', 'eixos')} com largura genérica de {LARGURA_PISTA_SEM_CADASTRO_M:.0f} m"
        conf_pista = "baixa"
        geo.pendencias.append("Sem cadastro de quadras: pistas com largura genérica; requer lapidação.")
    pecas["03_PISTAS"].append(Peca(clean(pistas), fonte_pista, conf_pista))

    urbanas = [q["g"] for q in dados.quadras
               if q["g"].area > 0 and q["g"].intersection(L).area > q["g"].area * OCUPACAO_LOTES_URBANA]
    U = union(urbanas)
    calcadas = U.difference(L).intersection(terra)
    pecas["04_CALCADAS_CAMINHOS"].append(Peca(
        clean(calcadas), f"{rot.get('quadras', 'Quadras')} − {rot.get('lotes', 'lotes')}", "media"))
    pecas["11_CANTEIROS_AREAS_LIVRES"].append(Peca(
        clean(Q.difference(U).intersection(terra)), f"{rot.get('quadras', 'Quadras')} sem lotes", "media"))
    pecas["12_AREAS_INTERNAS_LOTES"].append(Peca(
        clean(L.intersection(terra)), rot.get("lotes", "Lotes"), "media"))

    if dados.ciclovias:
        cic = union([c["g"].buffer(LARGURA_CICLOVIA_M / 2, cap_style=2) for c in dados.ciclovias]).intersection(terra)
        _aplicar(pecas, "05_CICLOVIA", Peca(clean(cic), f"{rot.get('ciclovias', 'Ciclovias')} (eixo + {LARGURA_CICLOVIA_M} m)", "media"))

    # Garante exclusividade da base (ordem: pista, calçada, canteiro, lote).
    ocupado = None
    for cat in ["05_CICLOVIA", "03_PISTAS", "04_CALCADAS_CAMINHOS", "11_CANTEIROS_AREAS_LIVRES", "12_AREAS_INTERNAS_LOTES"]:
        for p in pecas[cat]:
            if ocupado is not None:
                p.g = clean(p.g.difference(ocupado))
            ocupado = p.g if ocupado is None else union([ocupado, p.g])

    # ------------------------------------------------ rodadas de lapidação
    for item in sorted(lapidacoes, key=lambda i: i.rodada):
        if item.categoria in SUPERFICIES and item.g.geom_type in ("Polygon", "MultiPolygon"):
            g = item.g.intersection(D)
            if item.acao == "remover":
                for p in pecas[item.categoria]:
                    p.g = clean(p.g.difference(g))
                _aplicar(pecas, "01_CONTEXTO", Peca(g, item.fonte, item.confianca, item.status))
            else:
                _aplicar(pecas, item.categoria, Peca(g, item.fonte, item.confianca, item.status))
        elif item.categoria == "16_PINTURA_PISO":
            for pg in parts(item.g.intersection(D)):
                geo.pinturas.append(dict(g=pg, fonte=item.fonte, confianca=item.confianca, status=item.status))
        elif item.categoria == "13_MEIO_FIO":
            geo.meio_fio += [ln for ln in parts(item.g.intersection(D), "LineString")]

    # ------------------------------------------------ edificações
    elev = dados.elevacao()
    predios = []
    invalidas = 0
    for e in dados.edificacoes:
        g = e["g"]
        if g.is_empty or not D.contains(g.representative_point()):
            continue
        base, altura, conf = e.get("base"), e.get("altura"), "media"
        if altura is None or altura <= 0:
            altura, conf = ALTURA_PADRAO_M, "baixa"
            invalidas += 1
        if base is None:
            base = float(elev([g.representative_point().coords[0]])[0])
        for pg in parts(g):
            predios.append(dict(g=orient(pg, sign=1), base=float(base), altura=float(altura),
                                fonte=rot.get("edificacoes", "Edificações"), confianca=conf,
                                status="base_automatica", id=e.get("id")))
    for item in [i for i in lapidacoes if i.categoria == "07_EDIFICACOES"]:
        predios = _lapidar_edificacao(predios, item, elev)
    geo.edificacoes = predios

    pegadas = union([p["g"] for p in predios])
    for cat in ["12_AREAS_INTERNAS_LOTES", "11_CANTEIROS_AREAS_LIVRES"]:
        for p in pecas[cat]:
            p.g = clean(p.g.difference(pegadas))

    # ------------------------------------------------ contexto (o que sobrou)
    ocupado = union([p.g for ps in pecas.values() for p in ps] + [pegadas])
    resto = clean(D.difference(ocupado), 0.5)
    pecas["01_CONTEXTO"].append(Peca(resto, "Área não classificada no recorte", "baixa"))

    # ------------------------------------------------ explode em feições nomeadas
    for cat in SUPERFICIES:
        n = 0
        for p in pecas[cat]:
            for pg in parts(p.g):
                if pg.area < 0.05:
                    continue
                geo.superficies.append(dict(g=orient(pg, sign=1), categoria=cat, nome=f"{cat}_{n:03d}",
                                            fonte=p.fonte, confianca=p.confianca, status=p.status))
                n += 1
    for i, p in enumerate(geo.pinturas):
        p.update(categoria="16_PINTURA_PISO", nome=f"16_PINTURA_PISO_{i:03d}")
    for i, p in enumerate(geo.edificacoes):
        p.update(categoria="07_EDIFICACOES", nome=f"Edificacao_{p['id']}_{i:03d}")

    # ------------------------------------------------ árvores e postes
    geo.instancias = _instancias(dados, lapidacoes, D)
    if not any(i["tipo"] == "arvore" for i in geo.instancias):
        geo.pendencias.append("Árvores não incluídas: a fonte não tem inventário e não houve lapidação (pontos 08).")
    if not any(i["tipo"] == "poste" for i in geo.instancias):
        geo.pendencias.append("Postes não incluídos: requer lapidação (pontos 10) ou cadastro de iluminação.")
    if not any(s["categoria"] == "06_AGUA" for s in geo.superficies):
        geo.pendencias.append("Sem água/linha d'água: se houver orla, desenhar na lapidação (06/02/17).")

    # ------------------------------------------------ meio-fio
    if perfil.get("meio_fio"):
        pista = union([s["g"] for s in geo.superficies if s["categoria"] == "03_PISTAS"])
        outras = union([s["g"] for s in geo.superficies
                        if s["categoria"] not in ("03_PISTAS", "06_AGUA", "02_PRAIA_AREIA", "17_AREIA_UMIDA", "01_CONTEXTO")])
        borda = pista.boundary.intersection(outras.buffer(0.05)).difference(D.boundary.buffer(0.1))
        geo.meio_fio += [ln for ln in parts(borda.simplify(0.02) if not borda.is_empty else borda, "LineString")
                         if ln.length > 0.5]

    # ------------------------------------------------ referências 2D
    geo.eixos = [dict(g=s["g"].intersection(area.caixa), nome=s["nome"], id=s["id"]) for s in eixos]
    geo.referencias = (
        [dict(g=q["g"].intersection(area.caixa), camada="92_QUADRAS") for q in dados.quadras] +
        [dict(g=l["g"].intersection(area.caixa), camada="91_LOTES") for l in dados.lotes])

    areas = {}
    for s in geo.superficies:
        areas[s["categoria"]] = areas.get(s["categoria"], 0) + s["g"].area
    geo.estatisticas = dict(
        edificacoes=len(geo.edificacoes),
        edificacoes_com_patio=sum(1 for p in geo.edificacoes if p["g"].interiors),
        registros_edificacoes_fonte=len(dados.edificacoes),
        alturas_padrao_aplicadas=invalidas,
        superficies=len(geo.superficies),
        areas_m2={k: round(v, 1) for k, v in sorted(areas.items())},
        meio_fio_m=round(sum(l.length for l in geo.meio_fio), 1),
        arvores=sum(1 for i in geo.instancias if i["tipo"] == "arvore"),
        postes=sum(1 for i in geo.instancias if i["tipo"] == "poste"),
        logradouros=sorted({e["nome"] for e in geo.eixos if not e["g"].is_empty}),
        itens_lapidacao=len(lapidacoes),
    )
    return geo


def _aplicar(pecas: dict, categoria: str, nova: Peca):
    """Recorta a peça nova de todas as outras e a adiciona à categoria."""
    if nova.g.is_empty:
        return
    for cat, ps in pecas.items():
        for p in ps:
            if p.g.intersects(nova.g):
                p.g = clean(p.g.difference(nova.g))
    pecas[categoria].append(nova)


def _lapidar_edificacao(predios: list, item, elev) -> list:
    g = item.g
    alvo = [p for p in predios if p["g"].intersects(g) and
            p["g"].intersection(g).area > 0.5 * min(p["g"].area, max(g.area, 1e-9))]
    if item.acao == "ajustar_altura":
        for p in [p for p in predios if p["g"].contains(g.representative_point()) or p in alvo]:
            if "altura_m" in item.props:
                p["altura"] = float(item.props["altura_m"])
            if "base_m" in item.props:
                p["base"] = float(item.props["base_m"])
            p.update(fonte=item.fonte, confianca=item.confianca, status=item.status)
        return predios
    if item.acao in ("remover", "substituir"):
        predios = [p for p in predios if p not in alvo]
    if item.acao in ("adicionar", "substituir"):
        for pg in parts(g):
            base = item.props.get("base_m")
            if base is None:
                base = float(elev([pg.representative_point().coords[0]])[0])
            predios.append(dict(g=orient(pg, sign=1), base=float(base),
                                altura=float(item.props.get("altura_m", ALTURA_PADRAO_M)),
                                fonte=item.fonte, confianca=item.confianca, status=item.status,
                                id=item.props.get("id", f"L{item.rodada}")))
    return predios


def _instancias(dados, lapidacoes, D) -> list[dict]:
    out = []
    for a in dados.arvores:
        if D.contains(a["g"]):
            out.append(dict(tipo="arvore", x=a["g"].x, y=a["g"].y, copa=a.get("copa") or 6.0,
                            altura=a.get("altura") or 8.0, fonte=dados.rotulos.get("arvores", "Inventário"),
                            confianca="media", status="base_automatica"))
    for item in lapidacoes:
        if item.categoria not in ("08_ARVORES_COPAS", "10_POSTES"):
            continue
        tipo = "arvore" if item.categoria == "08_ARVORES_COPAS" else "poste"
        if item.acao == "remover":
            zona = item.g if item.g.geom_type != "Point" else item.g.buffer(2.0)
            out = [i for i in out if not (i["tipo"] == tipo and zona.contains(Point(i["x"], i["y"])))]
            continue
        for pt in parts(item.g.intersection(D), "Point"):
            if tipo == "arvore":
                out.append(dict(tipo=tipo, x=pt.x, y=pt.y, copa=float(item.props.get("copa_m", 6.0)),
                                altura=float(item.props.get("altura_m", 8.0)), fonte=item.fonte,
                                confianca=item.props.get("confianca", "estimada"), status=item.status))
            else:
                out.append(dict(tipo=tipo, x=pt.x, y=pt.y, copa=None,
                                altura=float(item.props.get("altura_m", 6.0)), fonte=item.fonte,
                                confianca=item.props.get("confianca", "candidato"), status=item.status))
    arv = pst = 0
    for i in out:
        if i["tipo"] == "arvore":
            i["nome"] = f"Arvore_{arv:03d}"
            arv += 1
        else:
            i["nome"] = f"Poste_{pst:03d}"
            pst += 1
    return out
