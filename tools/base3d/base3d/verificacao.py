"""Relatório de verificação (generaliza VERIFICACAO_R03.json).

Confere geometria e interoperabilidade, NÃO acurácia de campo — o relatório
diz isso explicitamente, como no R03.
"""
from __future__ import annotations

import collections

from shapely.strtree import STRtree

from .geo import union


def sobreposicoes(geo, tolerancia_m2: float = 0.05) -> dict:
    """Área sobreposta entre superfícies de categorias diferentes (deve ser ~0)."""
    sup = geo.superficies
    arvore = STRtree([s["g"] for s in sup])
    out = collections.Counter()
    for i, s in enumerate(sup):
        for j in arvore.query(s["g"]):
            if j <= i or sup[j]["categoria"] == s["categoria"]:
                continue
            a = s["g"].intersection(sup[j]["g"]).area
            if a > tolerancia_m2:
                out[f"{s['categoria']} x {sup[j]['categoria']}"] += a
    return {k: round(v, 3) for k, v in out.items()}


def cobertura_ruas(geo, recorte, tolerancia_m: float = 1.0) -> dict:
    """% do eixo de cada logradouro dentro da pista modelada (teste do R03 para 'ruas faltando')."""
    pista = union([s["g"] for s in geo.superficies if s["categoria"] in ("03_PISTAS", "05_CICLOVIA", "16_PINTURA_PISO")])
    pista = pista.buffer(tolerancia_m)
    por_nome = collections.defaultdict(list)
    for e in geo.eixos:
        g = e["g"].intersection(recorte.buffer(-tolerancia_m))
        if not g.is_empty:
            por_nome[e["nome"]].append(g)
    out = {}
    for nome, gs in por_nome.items():
        g = union(gs)
        if g.length < 20:
            continue
        out[nome] = dict(comprimento_referencia_m=round(g.length, 2),
                         dentro_da_pista_pct=round(100 * g.intersection(pista).length / g.length, 1))
    return dict(nota=f"Cobertura dos eixos oficiais pela pista modelada, tolerância {tolerancia_m} m. "
                     "Não é ensaio de acurácia posicional.", ruas=out)


def topologia_edificacoes(modelo: dict) -> dict:
    """Cada aresta de um volume fechado deve ser compartilhada por exatamente duas faces."""
    ruins = []
    for o in [o for o in modelo["objects"] if o["kind"] == "building"]:
        cont = collections.Counter()
        for fc in o["export_faces"]:
            for a, b in zip(fc, fc[1:] + fc[:1]):
                cont[tuple(sorted((a, b)))] += 1
        if any(v != 2 for v in cont.values()):
            ruins.append(o["name"])
    topo = sum(abs(o["footprint_area"]) for o in modelo["objects"] if o["kind"] == "building")
    return dict(volumes=sum(o["kind"] == "building" for o in modelo["objects"]),
                volumes_nao_fechados=ruins, area_total_coberturas_m2=round(topo, 3))


def distancias_evento(area, geo) -> list[dict]:
    """Distâncias do limite do evento a objetos nomeados, cada uma com os dois extremos declarados.

    "Distância até a rua" é ambígua: eixo, meio-fio e fachada são objetos diferentes e cada um
    tem procedência própria. Por isso cada linha diz de onde até onde e como o extremo foi obtido.
    """
    from shapely.ops import nearest_points
    pol = area.poligono
    out = []

    def linha(rotulo_ate, alvo, metodo_ate, nota=""):
        a, b = nearest_points(pol, alvo)
        out.append(dict(de="limite do evento (polígono do pedido)", ate=rotulo_ate,
                        distancia_m=round(pol.distance(alvo), 2),
                        ponto_de=[round(a.x, 3), round(a.y, 3)], ponto_ate=[round(b.x, 3), round(b.y, 3)],
                        metodo_ate=metodo_ate, nota=nota))

    if geo.edificacoes:
        mais_perto = min(geo.edificacoes, key=lambda p: pol.distance(p["g"]))
        nota = "O limite toca ou invade esta projeção." if pol.intersects(mais_perto["g"]) else ""
        linha(f"projeção da edificação {mais_perto['nome']} (fachada aproximada)", mais_perto["g"],
              mais_perto.get("metodos", {}).get("geometria", "source_attribute"),
              (nota + " Projeção cadastral, não a fachada medida; marquises e varandas não incluídas.").strip())
    if geo.meio_fio:
        linha("meio-fio modelado (borda pista × calçada)", union(geo.meio_fio), "derived",
              "Derivado do limite de quadra do cadastro; conferir em vistoria.")
    eixos = [e["g"] for e in geo.eixos if not e["g"].is_empty]
    if eixos:
        linha("eixo de logradouro oficial", union(eixos), "source_attribute",
              "Eixo não é borda de pista: não usar como distância até o meio-fio.")
    return out


def resumo_metodos(geo) -> dict:
    """Área por método de obtenção e contagem de atributos de edificação por método."""
    areas = collections.Counter()
    for s in geo.superficies + geo.pinturas:
        areas[s.get("metodo", "derived")] += s["g"].area
    pred = collections.defaultdict(collections.Counter)
    for p in geo.edificacoes:
        for k, v in p.get("metodos", {}).items():
            pred[k][v] += 1
    inst = collections.Counter(i.get("metodo", "estimated") for i in geo.instancias)
    return dict(superficies_m2={k: round(v, 1) for k, v in areas.items()},
                edificacoes={k: dict(v) for k, v in pred.items()}, arvores_postes=dict(inst))


def resumo_confianca(geo) -> dict:
    c = collections.Counter()
    for s in geo.superficies:
        c[(s["categoria"], s["confianca"], s["status"])] += s["g"].area
    out = collections.defaultdict(dict)
    for (cat, conf, st), a in sorted(c.items()):
        out[cat][f"{conf} / {st}"] = round(a, 1)
    return dict(out)


def montar_relatorio(pedido, area, geo, malha_rel: dict, topologia: dict, formatos: dict,
                     avisos: list[str], log_fontes: list[str], contrato: dict | None = None) -> dict:
    perfil = pedido.perfil
    ok_rodadas = len(pedido.lapidacoes) >= perfil["rodadas_lapidacao"]
    return dict(
        pedido=dict(codigo=pedido.codigo, nome=pedido.nome, nivel=pedido.nivel, nivel_rotulo=perfil["rotulo"],
                    finalidade=pedido.finalidade, precisao_estimada=perfil["precisao_estimada"],
                    rodadas_previstas=perfil["rodadas_lapidacao"], rodadas_recebidas=len(pedido.lapidacoes),
                    entrega_completa=ok_rodadas and not any("não gerado" in a for a in avisos)),
        area=area.resumo(),
        contrato=contrato or {},
        geografia=geo.estatisticas,
        metodos_de_obtencao=resumo_metodos(geo),
        distancias_evento=distancias_evento(area, geo),
        confianca_por_categoria=resumo_confianca(geo),
        validacao_geometrica=dict(sobreposicoes_superficies_m2=sobreposicoes(geo),
                                  edificacoes=topologia),
        malha=malha_rel,
        cobertura_ruas=cobertura_ruas(geo, area.recorte),
        formatos=formatos,
        pendencias=geo.pendencias + avisos,
        fontes_log=log_fontes,
        notas=["Geometria e interoperabilidade verificadas, não acurácia de campo.",
               "Base pública + modelagem remota; não substitui levantamento topográfico para locação de estruturas.",
               "Fontes com datas distintas; conferir mudanças recentes em vistoria."],
    )


def lista_pendencias_md(rel: dict) -> str:
    linhas = [f"# Verificação — {rel['pedido']['codigo']} · {rel['pedido']['nome']}", "",
              f"Nível: **{rel['pedido']['nivel_rotulo']}** · precisão estimada: {rel['pedido']['precisao_estimada']}",
              f"Rodadas de lapidação: {rel['pedido']['rodadas_recebidas']} de {rel['pedido']['rodadas_previstas']}",
              f"Entrega completa: {'sim' if rel['pedido']['entrega_completa'] else 'não'}", "", "## Pendências"]
    linhas += [f"- {p}" for p in rel["pendencias"]] or ["- Nenhuma"]
    linhas += ["", "## Distâncias do limite do evento (extremos declarados)"]
    for d in rel.get("distancias_evento", []):
        linhas.append(f"- até {d['ate']}: {d['distancia_m']} m ({d['metodo_ate']}). {d['nota']}".rstrip())
    linhas += ["", "## Cobertura das ruas"]
    for nome, r in sorted(rel["cobertura_ruas"]["ruas"].items()):
        linhas.append(f"- {nome}: {r['dentro_da_pista_pct']}% de {r['comprimento_referencia_m']} m")
    linhas += ["", "## Notas"] + [f"- {n}" for n in rel["notas"]]
    return "\n".join(linhas) + "\n"

