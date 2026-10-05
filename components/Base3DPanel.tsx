'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseProps } from '@/app/page';
import { supabase } from '@/lib/supabase';
import {
  AREA_ALERTA_M2, CENA_LABEL, FINALIDADES, NIVEIS, ORDEM_NIVEIS, PROXIMOS_STATUS, STATUS_LABEL,
  NivelBase3D, PedidoBase3D, PontoDeVista, RodadaBase3D, StatusBase3D,
  baixarArquivo, centroDoLinkEarth, formatarNumero, lerPoligonoKml, medirPoligono, nivelAbaixo,
  nomeArquivoKml, pedidoParaMotor, recomendarNivel,
} from '@/lib/base3d';
import {
  AlertTriangle, Box, CheckCircle2, Download, FileUp, Layers, Loader2, MapPin, Plus, Trash2, X,
} from 'lucide-react';

const CHAVE_LOCAL = 'freelahub.base3d.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERFIS_OPERADORES = ['MASTER', 'C-LEVEL', 'OPERAÇÃO', 'OPERAÇÕES'];

const STATUS_COR: Record<StatusBase3D, string> = {
  solicitado: 'bg-slate-100 text-slate-700',
  em_processamento: 'bg-sky-50 text-sky-700',
  base_gerada: 'bg-indigo-50 text-indigo-700',
  em_lapidacao: 'bg-amber-50 text-amber-700',
  em_revisao: 'bg-orange-50 text-orange-700',
  entregue: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-red-50 text-red-600',
};

interface Armazenamento { pedidos: PedidoBase3D[]; rodadas: RodadaBase3D[] }

function lerLocal(): Armazenamento {
  try {
    const raw = window.localStorage.getItem(CHAVE_LOCAL);
    return raw ? JSON.parse(raw) : { pedidos: [], rodadas: [] };
  } catch {
    return { pedidos: [], rodadas: [] };
  }
}

function gravarLocal(d: Armazenamento) {
  try { window.localStorage.setItem(CHAVE_LOCAL, JSON.stringify(d)); } catch { /* armazenamento indisponível */ }
}

async function buscarDados(): Promise<Armazenamento & { local: boolean }> {
  try {
    const [p, r] = await Promise.all([
      supabase.from('base3d_pedidos').select('*').order('created_at', { ascending: false }),
      supabase.from('base3d_rodadas').select('*').order('created_at', { ascending: true }),
    ]);
    if (p.error || r.error) throw p.error || r.error;
    return { pedidos: (p.data ?? []) as PedidoBase3D[], rodadas: (r.data ?? []) as RodadaBase3D[], local: false };
  } catch {
    // Sem Supabase configurado ou migração ainda não aplicada: trabalha no navegador.
    return { ...lerLocal(), local: true };
  }
}

const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}`);
const inputCls = 'w-full border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary bg-white focus:outline-none focus:border-action-cyan';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1';

export default function Base3DPanel({ db }: { db: DatabaseProps }) {
  const [aba, setAba] = useState<'pedidos' | 'novo' | 'niveis'>('pedidos');
  const [pedidos, setPedidos] = useState<PedidoBase3D[]>([]);
  const [rodadas, setRodadas] = useState<RodadaBase3D[]>([]);
  const [modoLocal, setModoLocal] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusBase3D>('todos');
  const operador = PERFIS_OPERADORES.includes(db.currentUser?.profile as string);

  useEffect(() => {
    let ativo = true;
    buscarDados().then(d => {
      if (!ativo) return;
      setPedidos(d.pedidos);
      setRodadas(d.rodadas);
      setModoLocal(d.local);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, []);

  const salvarPedido = async (p: PedidoBase3D, novo: boolean) => {
    if (!modoLocal) {
      const { id, created_at, updated_at, ...campos } = p;
      const q = novo
        ? supabase.from('base3d_pedidos').insert({ id, ...campos }).select().single()
        : supabase.from('base3d_pedidos').update(campos).eq('id', id).select().single();
      const { data, error } = await q;
      if (error) throw error;
      p = data as PedidoBase3D;
    }
    const salvo = p;
    setPedidos(atual => (novo ? [salvo, ...atual] : atual.map(x => (x.id === salvo.id ? salvo : x))));
    if (modoLocal) {
      const d = lerLocal();
      d.pedidos = novo ? [salvo, ...d.pedidos] : d.pedidos.map(x => (x.id === salvo.id ? salvo : x));
      gravarLocal(d);
    }
    return salvo;
  };

  const salvarRodada = async (r: RodadaBase3D) => {
    if (!modoLocal) {
      const { created_at, ...campos } = r;
      const { data, error } = await supabase.from('base3d_rodadas').insert(campos).select().single();
      if (error) throw error;
      r = data as RodadaBase3D;
    }
    const salva = r;
    setRodadas(atual => [...atual, salva]);
    if (modoLocal) {
      const d = lerLocal();
      d.rodadas = [...d.rodadas, salva];
      gravarLocal(d);
    }
  };

  const visiveis = pedidos.filter(p => filtroStatus === 'todos' || p.status === filtroStatus);
  const pedidoSel = pedidos.find(p => p.id === selecionado) ?? null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-text-primary flex items-center gap-2">
            <Box className="w-5 h-5" /> Base 3D / Cenografia
          </h2>
          <p className="text-xs text-text-secondary mt-0.5 max-w-2xl">
            Pedidos de base 2D/3D do local do evento a partir do polígono do Google Earth. Entrega em SketchUp 2026
            (.skp com cenas), DWG, Rhino e OBJ, com relatório de verificação por rodada.
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([['pedidos', 'Pedidos'], ['novo', 'Novo pedido'], ['niveis', 'Níveis de esforço']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer ${aba === k ? 'bg-white text-text-primary shadow-xs' : 'text-text-secondary'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {modoLocal && !carregando && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Tabelas do Supabase indisponíveis (aplique a migração <code>20261005000000_base3d_pedidos.sql</code>).
            Os pedidos estão sendo guardados só neste navegador.
          </span>
        </div>
      )}

      {aba === 'niveis' && <NiveisInfo />}

      {aba === 'novo' && (
        <NovoPedido db={db} onCancelar={() => setAba('pedidos')}
          onSalvar={async p => { const s = await salvarPedido(p, true); setSelecionado(s.id); setAba('pedidos'); }} />
      )}

      {aba === 'pedidos' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}
              className="border border-border-subtle rounded-lg px-2 py-1.5 text-xs bg-white">
              <option value="todos">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button onClick={() => setAba('novo')}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-action-cyan text-black text-xs font-bold cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Novo pedido
            </button>
          </div>
          <div className="bg-white border border-border-subtle rounded-2xl shadow-xs overflow-x-auto">
            {carregando ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : visiveis.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-secondary">Nenhum pedido ainda.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-text-secondary border-b border-border-subtle">
                    <th className="px-4 py-3">Job</th><th className="px-4 py-3">Local</th><th className="px-4 py-3">Finalidade</th>
                    <th className="px-4 py-3">Nível</th><th className="px-4 py-3 text-right">Área (m²)</th>
                    <th className="px-4 py-3">Revisão</th><th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(p => {
                    const revs = rodadas.filter(r => r.pedido_id === p.id);
                    return (
                      <tr key={p.id} onClick={() => setSelecionado(p.id)}
                        className={`border-b border-border-subtle cursor-pointer hover:bg-slate-50 ${selecionado === p.id ? 'bg-slate-50' : ''}`}>
                        <td className="px-4 py-3 font-mono text-[11px]">{p.job_code || '—'}</td>
                        <td className="px-4 py-3 font-bold text-text-primary">{p.nome_local}</td>
                        <td className="px-4 py-3 text-text-secondary">{FINALIDADES[p.finalidade]?.rotulo ?? p.finalidade}</td>
                        <td className="px-4 py-3">{NIVEIS[p.nivel].rotulo}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.area_m2 ? formatarNumero(Number(p.area_m2)) : '—'}</td>
                        <td className="px-4 py-3">{revs.length ? revs[revs.length - 1].revisao : '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{p.prazo ? new Date(p.prazo + 'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded font-bold text-[10px] ${STATUS_COR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {pedidoSel && (
            <DetalhePedido pedido={pedidoSel} rodadas={rodadas.filter(r => r.pedido_id === pedidoSel.id)} operador={operador}
              usuarioId={db.currentUser?.id} onFechar={() => setSelecionado(null)}
              onStatus={s => salvarPedido({ ...pedidoSel, status: s }, false)}
              onRodada={salvarRodada} />
          )}
        </div>
      )}
    </div>
  );
}

function NiveisInfo() {
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {ORDEM_NIVEIS.map(n => {
        const p = NIVEIS[n];
        return (
          <div key={n} className="bg-white border border-border-subtle rounded-2xl p-4 shadow-xs space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <h3 className="text-sm font-extrabold text-text-primary">{p.rotulo}</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{p.descricao}</p>
            <ul className="text-[11px] text-text-primary space-y-1">
              <li><b>Rodadas de lapidação:</b> {p.rodadas_lapidacao}</li>
              <li><b>Precisão estimada:</b> {p.precisao_estimada}</li>
              <li><b>Entorno modelado:</b> {p.entorno_m} m</li>
              <li><b>Meio-fio 3D:</b> {p.meio_fio ? 'sim' : 'não'} · <b>Materiais:</b> {p.materiais === 'texturas' ? 'texturas' : 'cores lisas'}</li>
              <li><b>Renders:</b> {p.renders ? 'cenas preparadas para render' : 'não'}</li>
            </ul>
            <div>
              <p className={labelCls}>Cenas no .skp</p>
              <ul className="text-[11px] text-text-secondary list-disc pl-4">
                {p.cenas.map(c => <li key={c}>{CENA_LABEL[c] ?? c}</li>)}
              </ul>
            </div>
          </div>
        );
      })}
      <p className="md:col-span-3 text-[11px] text-text-muted">
        Base pública + modelagem remota: não substitui levantamento topográfico para locação de estruturas.
        Precisão centimétrica exige vistoria e levantamento de campo.
      </p>
    </div>
  );
}

function NovoPedido({ db, onSalvar, onCancelar }: {
  db: DatabaseProps; onSalvar: (p: PedidoBase3D) => Promise<void>; onCancelar: () => void;
}) {
  const [jobId, setJobId] = useState('');
  const [nome, setNome] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [origem, setOrigem] = useState<'kml' | 'coordenadas'>('kml');
  const [kml, setKml] = useState<{ nome: string; texto: string } | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [areaInformada, setAreaInformada] = useState('');
  const [link, setLink] = useState('');
  const [incluiPista, setIncluiPista] = useState(false);
  const [pontos, setPontos] = useState<PontoDeVista[]>([]);
  const [prazo, setPrazo] = useState('');
  const [obs, setObs] = useState('');
  const [nivel, setNivel] = useState<NivelBase3D | ''>('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const medida = useMemo(() => {
    if (origem !== 'kml' || !kml) return null;
    const pol = lerPoligonoKml(kml.texto);
    return pol ? { ...medirPoligono(pol.coords), nome: pol.nome } : null;
  }, [origem, kml]);
  const area = origem === 'kml' ? medida?.area ?? null : Number(areaInformada.replace(',', '.')) || null;
  const rec = recomendarNivel(finalidade, area);
  const nivelFinal: NivelBase3D = nivel || rec.nivel;
  const job = db.jobs.find(j => j.id === jobId);

  const carregarKml = async (f: File | undefined) => {
    setErro('');
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.kml')) {
      setErro('Envie o arquivo .kml (no Google Earth: menu ⋮ do polígono → "Exportar como arquivo KML").');
      return;
    }
    const texto = await f.text();
    const pol = lerPoligonoKml(texto);
    if (!pol) {
      setErro('Nenhum polígono encontrado no KML.');
      return;
    }
    setKml({ nome: f.name, texto });
    if (!nome) setNome(pol.nome.trim() || f.name.replace(/\.kml$/i, ''));
  };

  const usarLink = (v: string) => {
    setLink(v);
    const c = centroDoLinkEarth(v);
    if (c && origem === 'coordenadas') { setLat(String(c.lat)); setLon(String(c.lon)); }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!nome.trim() || !finalidade) return setErro('Informe o nome do local e a finalidade.');
    if (origem === 'kml' && !medida) return setErro('Envie o KML do polígono.');
    if (origem === 'coordenadas' && (!Number(lat) || !Number(lon) || !area)) return setErro('Informe latitude, longitude e área em m².');
    setSalvando(true);
    const agora = new Date().toISOString();
    const jobCode = job ? (job.job_code || job.jobCode || null) : null;
    const pedido: PedidoBase3D = {
      id: novoId(),
      job_id: job && UUID.test(job.id) ? job.id : null,
      job_code: jobCode,
      nome_local: nome.trim(),
      finalidade,
      nivel: nivelFinal,
      nivel_recomendado: rec.nivel,
      origem_poligono: origem,
      kml_nome: origem === 'kml' ? kml!.nome : null,
      kml_conteudo: origem === 'kml' ? kml!.texto : null,
      centro_lat: origem === 'kml' ? medida!.centro.lat : Number(lat),
      centro_lon: origem === 'kml' ? medida!.centro.lon : Number(lon),
      area_m2: area ? Number(area.toFixed(2)) : null,
      perimetro_m: origem === 'kml' ? Number(medida!.perimetro.toFixed(2)) : null,
      link_google_earth: link || null,
      inclui_pista: incluiPista,
      pontos_de_vista: pontos.filter(p => p.nome && Number.isFinite(p.lat) && Number.isFinite(p.lon)),
      prazo: prazo || null,
      observacoes: obs || null,
      status: 'solicitado',
      nucleo_id: job?.nucleoId ?? db.currentUser?.nucleoId ?? null,
      solicitante_id: db.currentUser?.id ?? null,
      created_at: agora,
      updated_at: agora,
    };
    try {
      await onSalvar(pedido);
    } catch (err) {
      setErro(`Não foi possível salvar: ${(err as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const perfil = NIVEIS[nivelFinal];
  return (
    <form onSubmit={enviar} className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white border border-border-subtle rounded-2xl p-4 shadow-xs space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Job vinculado (opcional)</label>
            <select value={jobId} onChange={e => setJobId(e.target.value)} className={inputCls}>
              <option value="">— Sem vínculo —</option>
              {db.jobs.map(j => (
                <option key={j.id} value={j.id}>{(j.job_code || j.jobCode || '') + ' · ' + (j.name || j.title)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Nome do local *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="Ex.: Orla de Botafogo" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Para que será feita a modelagem? *</label>
            <select value={finalidade} onChange={e => setFinalidade(e.target.value)} className={inputCls}>
              <option value="">Selecione a finalidade</option>
              {Object.entries(FINALIDADES).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}
            </select>
            {rec.prioridades.length > 0 && (
              <p className="text-[11px] text-text-secondary mt-1">Prioridades de detalhamento: {rec.prioridades.join(' · ')}</p>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>Polígono do espaço</label>
          <div className="flex gap-2 mb-2">
            {([['kml', 'KML do Google Earth'], ['coordenadas', 'Coordenadas + área']] as const).map(([k, l]) => (
              <button type="button" key={k} onClick={() => setOrigem(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${origem === k ? 'border-action-cyan bg-amber-50' : 'border-border-subtle'}`}>{l}</button>
            ))}
          </div>
          {origem === 'kml' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 border border-dashed border-border-subtle rounded-xl p-3 cursor-pointer hover:bg-slate-50">
                <FileUp className="w-4 h-4" />
                <span className="text-xs">{kml ? kml.nome : 'Selecionar arquivo .kml'}</span>
                <input type="file" accept=".kml" className="hidden" onChange={e => carregarKml(e.target.files?.[0])} />
              </label>
              {medida && (
                <p className="text-[11px] text-text-secondary">
                  {medida.vertices} vértices · área ≈ <b>{formatarNumero(medida.area)} m²</b> · perímetro ≈ {formatarNumero(medida.perimetro)} m
                  <span className="text-text-muted"> (área real no terreno, como no Google Earth; em SIRGAS 2000 / UTM o motor registra cerca de 0,2% a menos por causa da escala da projeção)</span>
                </p>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className={labelCls}>Latitude</label><input value={lat} onChange={e => setLat(e.target.value)} className={inputCls} placeholder="-22.94506" /></div>
              <div><label className={labelCls}>Longitude</label><input value={lon} onChange={e => setLon(e.target.value)} className={inputCls} placeholder="-43.18077" /></div>
              <div><label className={labelCls}>Área (m²)</label><input value={areaInformada} onChange={e => setAreaInformada(e.target.value)} className={inputCls} placeholder="7680,97" /></div>
              <p className="sm:col-span-3 text-[11px] text-text-muted">Sem KML, o motor gera um quadrado aproximado com essa área. Prefira o KML.</p>
            </div>
          )}
          <div className="mt-2">
            <label className={labelCls}>Link do Google Earth (opcional)</label>
            <input value={link} onChange={e => usarLink(e.target.value)} className={inputCls} placeholder="https://earth.google.com/web/..." />
          </div>
          <label className="flex items-center gap-2 mt-2 text-xs">
            <input type="checkbox" checked={incluiPista} onChange={e => setIncluiPista(e.target.checked)} />
            A área inclui faixa de rolamento de propósito (ex.: evento de motos, corrida)
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Pontos de vista do evento (palco, entrada, público)</label>
            <button type="button" onClick={() => setPontos([...pontos, { nome: '', lat: NaN, lon: NaN, altura_olho_m: 1.6 }])}
              className="text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"><Plus className="w-3 h-3" /> Adicionar</button>
          </div>
          {pontos.length === 0 && <p className="text-[11px] text-text-muted">Viram cenas no .skp (nível detalhado). Opcional nos demais níveis.</p>}
          {pontos.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mt-1">
              <input className={inputCls} placeholder="Nome" value={p.nome}
                onChange={e => setPontos(pontos.map((x, k) => k === i ? { ...x, nome: e.target.value } : x))} />
              <input className={inputCls} placeholder="Latitude" value={Number.isFinite(p.lat) ? p.lat : ''}
                onChange={e => setPontos(pontos.map((x, k) => k === i ? { ...x, lat: Number(e.target.value) } : x))} />
              <input className={inputCls} placeholder="Longitude" value={Number.isFinite(p.lon) ? p.lon : ''}
                onChange={e => setPontos(pontos.map((x, k) => k === i ? { ...x, lon: Number(e.target.value) } : x))} />
              <button type="button" onClick={() => setPontos(pontos.filter((_, k) => k !== i))} className="px-2 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Prazo desejado</label><input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Observações</label><input value={obs} onChange={e => setObs(e.target.value)} className={inputCls} placeholder="Elementos críticos, acessos, restrições..." /></div>
        </div>
      </div>

      <div className="bg-white border border-border-subtle rounded-2xl p-4 shadow-xs space-y-3 h-fit">
        <div>
          <label className={labelCls}>Nível de esforço</label>
          <div className="space-y-1.5">
            {ORDEM_NIVEIS.map(n => (
              <label key={n} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${nivelFinal === n ? 'border-action-cyan bg-amber-50' : 'border-border-subtle'}`}>
                <input type="radio" name="nivel" checked={nivelFinal === n} onChange={() => setNivel(n)} />
                <span className="font-bold">{NIVEIS[n].rotulo}</span>
                {rec.nivel === n && <span className="ml-auto text-[9px] font-bold uppercase text-emerald-700">recomendado</span>}
              </label>
            ))}
          </div>
        </div>
        {nivelAbaixo(nivelFinal, rec.nivel) && (
          <p className="text-[11px] text-amber-700 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            A finalidade recomenda no mínimo o nível {NIVEIS[rec.nivel].rotulo}.</p>
        )}
        {rec.alertas.map(a => <p key={a} className="text-[11px] text-amber-700">{a}</p>)}
        <div className="text-[11px] text-text-secondary space-y-1 border-t border-border-subtle pt-3">
          <p className="text-text-primary">{perfil.descricao}</p>
          <p><b>Rodadas:</b> {perfil.rodadas_lapidacao} · <b>Precisão:</b> {perfil.precisao_estimada}</p>
          <p><b>Entrega:</b> .skp (SketchUp 2026) com {perfil.cenas.length} tipos de cena, DWG, Rhino, OBJ, planta e vistas PNG.</p>
          {area && area > AREA_ALERTA_M2 && <p className="text-amber-700">Área grande: avalie dividir em trechos.</p>}
        </div>
        {erro && <p className="text-[11px] text-red-600">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="flex-1 px-3 py-2 rounded-xl border border-border-subtle text-xs font-bold cursor-pointer">Cancelar</button>
          <button type="submit" disabled={salvando}
            className="flex-1 px-3 py-2 rounded-xl bg-action-cyan text-black text-xs font-bold cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1">
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enviar pedido
          </button>
        </div>
      </div>
    </form>
  );
}

function DetalhePedido({ pedido, rodadas, operador, usuarioId, onFechar, onStatus, onRodada }: {
  pedido: PedidoBase3D; rodadas: RodadaBase3D[]; operador: boolean; usuarioId?: string;
  onFechar: () => void; onStatus: (s: StatusBase3D) => Promise<unknown>; onRodada: (r: RodadaBase3D) => Promise<void>;
}) {
  const perfil = NIVEIS[pedido.nivel];
  const proxRevisao = `R${String(rodadas.length + 1).padStart(2, '0')}`;
  const [pacote, setPacote] = useState('');
  const [verificacao, setVerificacao] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const limiteRodadas = perfil.rodadas_lapidacao + 1;

  const registrar = async () => {
    setErro('');
    let rel: Record<string, any> | null = null;
    if (verificacao.trim()) {
      try { rel = JSON.parse(verificacao); } catch { return setErro('O conteúdo colado não é um JSON válido (VERIFICACAO_Rnn.json).'); }
    }
    setOcupado(true);
    try {
      await onRodada({
        id: novoId(), pedido_id: pedido.id, revisao: proxRevisao, tipo: rodadas.length ? 'lapidacao' : 'geracao',
        pacote_url: pacote || null, verificacao: rel, pendencias: (rel?.pendencias as string[]) ?? [],
        entrega_completa: (rel?.pedido?.entrega_completa as boolean | undefined) ?? null, observacoes: obs || null,
        created_by: usuarioId ?? null, created_at: new Date().toISOString(),
      });
      if (pedido.status === 'em_processamento' && !rodadas.length) await onStatus('base_gerada');
      else if (pedido.status === 'em_lapidacao') await onStatus('em_revisao');
      setPacote(''); setVerificacao(''); setObs('');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const lapidacoes = rodadas.slice(1).map(r => `lapidacao_${r.revisao}.geojson`);
  return (
    <div className="bg-white border border-border-subtle rounded-2xl p-4 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono text-text-muted">{pedido.job_code || 'sem job'} · {pedido.id.slice(0, 8)}</p>
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5"><MapPin className="w-4 h-4" />{pedido.nome_local}</h3>
          <p className="text-xs text-text-secondary">
            {FINALIDADES[pedido.finalidade]?.rotulo} · Nível {perfil.rotulo}
            {pedido.nivel_recomendado && pedido.nivel_recomendado !== pedido.nivel && ` (recomendado: ${NIVEIS[pedido.nivel_recomendado].rotulo})`}
          </p>
        </div>
        <button onClick={onFechar} className="cursor-pointer"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-[11px]">
        <div className="space-y-1">
          <p className={labelCls}>Polígono</p>
          <p>{pedido.origem_poligono === 'kml' ? `KML: ${pedido.kml_nome}` : 'Coordenadas + área (aproximado)'}</p>
          <p>Área: {pedido.area_m2 ? `${formatarNumero(Number(pedido.area_m2))} m²` : '—'}{pedido.perimetro_m ? ` · Perímetro: ${formatarNumero(Number(pedido.perimetro_m))} m` : ''}</p>
          <p>Centro: {pedido.centro_lat?.toFixed(6)}, {pedido.centro_lon?.toFixed(6)}</p>
          {pedido.inclui_pista && <p className="text-amber-700">Inclui faixa de rolamento (intencional)</p>}
          {pedido.link_google_earth && <a href={pedido.link_google_earth} target="_blank" rel="noreferrer" className="underline">Abrir no Google Earth</a>}
        </div>
        <div className="space-y-1">
          <p className={labelCls}>Entrega prevista</p>
          <p>{perfil.rodadas_lapidacao} rodada(s) de lapidação · {perfil.precisao_estimada}</p>
          <p>Cenas: {perfil.cenas.map(c => CENA_LABEL[c] ?? c).join(', ')}</p>
          {pedido.pontos_de_vista.length > 0 && <p>Pontos de vista: {pedido.pontos_de_vista.map(p => p.nome).join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <p className={labelCls}>Arquivos para o motor</p>
          <button onClick={() => baixarArquivo('pedido.json', JSON.stringify(pedidoParaMotor(pedido, lapidacoes), null, 2))}
            className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"><Download className="w-3.5 h-3.5" /> pedido.json</button>
          {pedido.kml_conteudo && (
            <button onClick={() => baixarArquivo(nomeArquivoKml(pedido), pedido.kml_conteudo!, 'application/vnd.google-earth.kml+xml')}
              className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"><Download className="w-3.5 h-3.5" /> {nomeArquivoKml(pedido)}</button>
          )}
          <p className="text-text-muted">Rodar: <code>python -m base3d gerar pedido.json</code></p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <span className={`inline-flex px-2 py-0.5 rounded font-bold text-[10px] ${STATUS_COR[pedido.status]}`}>{STATUS_LABEL[pedido.status]}</span>
        {operador && PROXIMOS_STATUS[pedido.status].map(s => (
          <button key={s} onClick={() => onStatus(s)}
            className="px-2.5 py-1 rounded-lg border border-border-subtle text-[11px] font-bold cursor-pointer hover:bg-slate-50">→ {STATUS_LABEL[s]}</button>
        ))}
      </div>

      <div>
        <p className={labelCls}>Rodadas</p>
        {rodadas.length === 0 && <p className="text-[11px] text-text-muted">Nenhuma rodada registrada.</p>}
        <div className="space-y-2">
          {rodadas.map(r => (
            <div key={r.id} className="border border-border-subtle rounded-xl p-3 text-[11px]">
              <div className="flex items-center gap-2">
                <b>{r.revisao}</b><span className="text-text-secondary">{r.tipo === 'geracao' ? 'Geração automática' : 'Lapidação'}</span>
                <span className="text-text-muted">{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                {r.entrega_completa !== null && (
                  <span className={`ml-auto font-bold ${r.entrega_completa ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {r.entrega_completa ? 'Completa' : 'Parcial'}
                  </span>
                )}
              </div>
              {r.pacote_url && <a href={r.pacote_url} target="_blank" rel="noreferrer" className="underline">Pacote da entrega</a>}
              {r.pendencias.length > 0 && (
                <ul className="list-disc pl-4 mt-1 text-text-secondary">{r.pendencias.map(p => <li key={p}>{p}</li>)}</ul>
              )}
              {r.observacoes && <p className="mt-1">{r.observacoes}</p>}
            </div>
          ))}
        </div>
      </div>

      {operador && rodadas.length < limiteRodadas && pedido.status !== 'cancelado' && pedido.status !== 'entregue' && (
        <div className="border-t border-border-subtle pt-3 space-y-2">
          <p className={labelCls}>Registrar rodada {proxRevisao}</p>
          <input className={inputCls} placeholder="Link do pacote ZIP (Drive, Storage...)" value={pacote} onChange={e => setPacote(e.target.value)} />
          <textarea className={`${inputCls} font-mono h-24`} placeholder={`Cole aqui o conteúdo de VERIFICACAO_${proxRevisao}.json`}
            value={verificacao} onChange={e => setVerificacao(e.target.value)} />
          <input className={inputCls} placeholder="Observações da rodada" value={obs} onChange={e => setObs(e.target.value)} />
          {erro && <p className="text-[11px] text-red-600">{erro}</p>}
          <button onClick={registrar} disabled={ocupado}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-action-cyan text-black text-xs font-bold cursor-pointer disabled:opacity-60">
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Registrar {proxRevisao}
          </button>
        </div>
      )}
    </div>
  );
}
