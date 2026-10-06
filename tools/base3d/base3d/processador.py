"""Processador automático: liga o Freela Hub (Supabase) ao motor.

Roda na máquina de produção (Windows com SketchUp SDK e ODA File Converter):

    set SUPABASE_URL=https://<projeto>.supabase.co
    set SUPABASE_SERVICE_ROLE_KEY=<chave de serviço>      (nunca no código nem no front-end)
    python -m base3d.processador                 # fica escutando, a cada 60 s
    python -m base3d.processador --uma-vez       # processa no máximo um pedido e sai

Para cada pedido em 'solicitado' (gera R01) ou 'em_lapidacao' (gera a próxima revisão):
1. reserva o pedido de forma atômica (RPC base3d_reservar_pedido);
2. escreve KML, lapidações e pedido.json numa pasta de trabalho;
3. roda o motor (pipeline.executar);
4. envia o ZIP ao bucket privado 'base3d' do Storage;
5. registra a rodada com o VERIFICACAO e muda o status para 'base_gerada' ou 'em_revisao'.
Se algo falhar, o pedido vai para 'erro' com a mensagem em erro_processamento.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .pipeline import executar, slug

BUCKET = "base3d"


class Supabase:
    """Cliente mínimo da API REST e do Storage, sem dependências externas."""

    def __init__(self, url: str, chave: str):
        self.url = url.rstrip("/")
        self.chave = chave

    def _req(self, metodo: str, caminho: str, corpo=None, cabecalhos: dict | None = None, binario: bytes | None = None):
        h = {"apikey": self.chave, "Authorization": f"Bearer {self.chave}"}
        if binario is None:
            h["Content-Type"] = "application/json"
        h.update(cabecalhos or {})
        dados = binario if binario is not None else (json.dumps(corpo).encode() if corpo is not None else None)
        req = urllib.request.Request(self.url + caminho, data=dados, method=metodo, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                txt = r.read().decode() or "null"
                return json.loads(txt)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {metodo} {caminho}: {e.code} {e.read().decode()[:300]}") from e

    def reservar(self, processador: str) -> dict | None:
        r = self._req("POST", "/rest/v1/rpc/base3d_reservar_pedido", {"p_processador": processador})
        return r[0] if r else None

    def atualizar_pedido(self, pedido_id: str, campos: dict):
        self._req("PATCH", f"/rest/v1/base3d_pedidos?id=eq.{pedido_id}", campos, {"Prefer": "return=minimal"})

    def inserir_rodada(self, rodada: dict):
        self._req("POST", "/rest/v1/base3d_rodadas", rodada, {"Prefer": "return=minimal"})

    def enviar_arquivo(self, caminho_remoto: str, arquivo: Path, tipo: str = "application/zip") -> str:
        destino = urllib.parse.quote(caminho_remoto)
        self._req("POST", f"/storage/v1/object/{BUCKET}/{destino}", binario=Path(arquivo).read_bytes(),
                  cabecalhos={"Content-Type": tipo, "x-upsert": "true"})
        return f"storage://{BUCKET}/{caminho_remoto}"


def montar_pedido(reg: dict, pasta: Path, fonte_local: dict | None = None) -> Path:
    """Converte a linha de base3d_pedidos em pedido.json + arquivos (mesma regra de lib/base3d.ts)."""
    pasta.mkdir(parents=True, exist_ok=True)
    lapidacoes = []
    for i, lap in enumerate(reg.get("lapidacoes") or [], start=1):
        nome = f"lapidacao_R{i + 1:02d}.geojson"
        conteudo = lap["conteudo"] if isinstance(lap["conteudo"], str) else json.dumps(lap["conteudo"])
        (pasta / nome).write_text(conteudo, encoding="utf8")
        lapidacoes.append(nome)
    pedido = dict(
        codigo=reg.get("job_code") or str(reg["id"])[:8], nome=reg["nome_local"], nivel=reg["nivel"],
        finalidade=reg.get("finalidade"), inclui_pista=bool(reg.get("inclui_pista")),
        fonte=reg.get("fonte") or "rio_ipp", lapidacoes=lapidacoes,
        pontos_de_vista=[dict(nome=p["nome"], lat=p["lat"], lon=p["lon"],
                              altura_olho_m=p.get("altura_olho_m", 1.6)) for p in reg.get("pontos_de_vista") or []],
        saida="saida", observacoes=reg.get("observacoes") or "",
    )
    if reg["origem_poligono"] == "kml":
        nome_kml = Path(reg.get("kml_nome") or f"{slug(reg['nome_local'])}.kml").name
        (pasta / nome_kml).write_text(reg["kml_conteudo"], encoding="utf8")
        pedido["kml"] = nome_kml
    else:
        pedido.update(centro=[reg["centro_lat"], reg["centro_lon"]], area_m2=float(reg["area_m2"]))
    if fonte_local:  # uso em testes ou cidades com arquivos próprios
        pedido.update(fonte="local", fonte_local=fonte_local)
    caminho = pasta / "pedido.json"
    caminho.write_text(json.dumps(pedido, indent=2, ensure_ascii=False), encoding="utf8")
    return caminho


def processar(sb: Supabase, reg: dict, raiz: Path, skp=True, dwg=True, fonte_local=None, verbose=True) -> dict:
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    revisao = f"R{len(reg.get('lapidacoes') or []) + 1:02d}"
    pasta = raiz / str(reg["id"]) / revisao
    try:
        caminho = montar_pedido(reg, pasta, fonte_local)
        res = executar(caminho, skp=skp, dwg=dwg, verbose=verbose)
        zip_path = Path(res["pacote"])
        url = sb.enviar_arquivo(f"{reg['id']}/{revisao}/{zip_path.name}", zip_path)
        rel = res["relatorio"]
        sb.inserir_rodada(dict(
            pedido_id=reg["id"], revisao=revisao, tipo="geracao" if revisao == "R01" else "lapidacao",
            pacote_url=url, verificacao=json.loads(json.dumps(rel, default=str)),
            pendencias=rel["pendencias"], entrega_completa=rel["pedido"]["entrega_completa"],
            observacoes=f"Gerado automaticamente por {reg.get('processador') or 'processador'}.",
            created_by="processador"))
        status = "base_gerada" if revisao == "R01" else "em_revisao"
        sb.atualizar_pedido(reg["id"], dict(status=status, processado_em=agora, erro_processamento=None))
        return dict(ok=True, revisao=revisao, status=status, pacote=url)
    except Exception as e:  # o pedido nunca fica preso em 'em_processamento'
        msg = f"{type(e).__name__}: {e}"
        sb.atualizar_pedido(reg["id"], dict(status="erro", processado_em=agora, erro_processamento=msg[:2000]))
        if verbose:
            traceback.print_exc()
        return dict(ok=False, revisao=revisao, erro=msg)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="base3d.processador")
    ap.add_argument("--uma-vez", action="store_true", help="processa no máximo um pedido e sai")
    ap.add_argument("--intervalo", type=int, default=60, help="segundos entre consultas")
    ap.add_argument("--pasta", default=os.environ.get("BASE3D_PASTA_TRABALHO", "trabalho_base3d"))
    ap.add_argument("--sem-skp", action="store_true")
    ap.add_argument("--sem-dwg", action="store_true")
    a = ap.parse_args(argv)
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not chave:
        print("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.", file=sys.stderr)
        return 2
    sb = Supabase(url, chave)
    nome = f"{socket.gethostname()}:{os.getpid()}"
    print(f"Processador {nome} ativo. Pasta de trabalho: {Path(a.pasta).resolve()}")
    while True:
        try:
            reg = sb.reservar(nome)
        except RuntimeError as e:
            print(f"Falha ao consultar pedidos: {e}", file=sys.stderr)
            reg = None
        if reg:
            print(f"Processando {reg.get('job_code') or reg['id']} · {reg['nome_local']} · {reg['nivel']}")
            r = processar(sb, reg, Path(a.pasta), skp=not a.sem_skp, dwg=not a.sem_dwg)
            print(json.dumps(r, ensure_ascii=False))
            if a.uma_vez:
                return 0 if r["ok"] else 1
            continue
        if a.uma_vez:
            print("Nenhum pedido aguardando.")
            return 0
        time.sleep(a.intervalo)


if __name__ == "__main__":
    sys.exit(main())
