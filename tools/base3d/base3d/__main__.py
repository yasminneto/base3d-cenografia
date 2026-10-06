"""Linha de comando.

    python -m base3d gerar pedido.json [--sem-skp] [--sem-dwg] [--sdk PASTA]
    python -m base3d validar pedido.json
    python -m base3d recomendar --finalidade evento_via_publica --area 7680
    python -m base3d descobrir [rio_ipp]
    python -m base3d extensao [destino.rbz]
"""
from __future__ import annotations

import argparse
import json
import sys


def main(argv=None):
    ap = argparse.ArgumentParser(prog="base3d", description="Base 2D/3D de locais de evento a partir de um polígono.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gerar", help="executa o pedido e gera o pacote de entrega")
    g.add_argument("pedido")
    g.add_argument("--sem-skp", action="store_true")
    g.add_argument("--sem-dwg", action="store_true")
    g.add_argument("--sdk", help="pasta do SketchUp C SDK (ou variável SKETCHUP_SDK_DIR)")
    v = sub.add_parser("validar", help="confere o pedido sem processar")
    v.add_argument("pedido")
    r = sub.add_parser("recomendar", help="nível recomendado para a finalidade")
    r.add_argument("--finalidade")
    r.add_argument("--area", type=float)
    ext = sub.add_parser("extensao", help="gera o instalador .rbz da extensão SketchUp")
    ext.add_argument("destino", nargs="?", default="base3d_cenografia.rbz")
    dsc = sub.add_parser("descobrir", help="lista camadas dos serviços de uma fonte")
    dsc.add_argument("fonte", nargs="?", default="rio_ipp")
    a = ap.parse_args(argv)

    if a.cmd == "gerar":
        from .pipeline import executar
        res = executar(a.pedido, skp=not a.sem_skp, dwg=not a.sem_dwg, sdk_dir=a.sdk)
        print("\nPendências:")
        for p in res["relatorio"]["pendencias"]:
            print(" -", p)
        print("\nPacote:", res["pacote"])
    elif a.cmd == "validar":
        from .config import Pedido
        p = Pedido.carregar(a.pedido)
        erros = p.validar()
        print(json.dumps(dict(erros=erros, avisos=[] if erros else p.avisos()), indent=2, ensure_ascii=False))
        return 1 if erros else 0
    elif a.cmd == "recomendar":
        from .config import recomendar_nivel
        print(json.dumps(recomendar_nivel(a.finalidade, a.area), indent=2, ensure_ascii=False))
    elif a.cmd == "extensao":
        from .pipeline import construir_extensao
        print("Extensão gerada:", construir_extensao(a.destino))
    elif a.cmd == "descobrir":
        from .fontes.arcgis import descobrir
        print("\n".join(descobrir(a.fonte)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
