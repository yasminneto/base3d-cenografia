// Regras do módulo Base 3D / Cenografia.
// Os níveis e finalidades vêm do mesmo arquivo usado pelo motor Python (tools/base3d),
// para que formulário e processamento nunca divirjam.
import niveisData from '@/tools/base3d/base3d/data/niveis.json';

export type NivelBase3D = 'basico' | 'intermediario' | 'detalhado';
export type StatusBase3D =
  | 'solicitado' | 'em_processamento' | 'base_gerada' | 'em_lapidacao' | 'em_revisao' | 'entregue' | 'cancelado';

export interface PerfilNivel {
  rotulo: string;
  descricao: string;
  rodadas_lapidacao: number;
  entorno_m: number;
  meio_fio: boolean;
  materiais: string;
  cenas: string[];
  vistas_png: string[];
  renders: boolean;
  precisao_estimada: string;
}

export interface Finalidade {
  rotulo: string;
  nivel_minimo: NivelBase3D;
  prioridades: string[];
}

export interface PontoDeVista {
  nome: string;
  lat: number;
  lon: number;
  altura_olho_m?: number;
}

export interface PedidoBase3D {
  id: string;
  job_id: string | null;
  job_code: string | null;
  nome_local: string;
  finalidade: string;
  nivel: NivelBase3D;
  nivel_recomendado: NivelBase3D | null;
  origem_poligono: 'kml' | 'coordenadas';
  kml_nome: string | null;
  kml_conteudo: string | null;
  centro_lat: number | null;
  centro_lon: number | null;
  area_m2: number | null;
  perimetro_m: number | null;
  link_google_earth: string | null;
  inclui_pista: boolean;
  pontos_de_vista: PontoDeVista[];
  prazo: string | null;
  observacoes: string | null;
  status: StatusBase3D;
  nucleo_id: string | null;
  solicitante_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RodadaBase3D {
  id: string;
  pedido_id: string;
  revisao: string;
  tipo: 'geracao' | 'lapidacao';
  pacote_url: string | null;
  verificacao: Record<string, unknown> | null;
  pendencias: string[];
  entrega_completa: boolean | null;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
}

export const NIVEIS = niveisData.niveis as Record<NivelBase3D, PerfilNivel>;
export const FINALIDADES = niveisData.finalidades as Record<string, Finalidade>;
export const ORDEM_NIVEIS: NivelBase3D[] = ['basico', 'intermediario', 'detalhado'];
export const AREA_ALERTA_M2: number = niveisData.area_alerta_m2;

export const STATUS_LABEL: Record<StatusBase3D, string> = {
  solicitado: 'Solicitado',
  em_processamento: 'Em processamento',
  base_gerada: 'Base gerada (R01)',
  em_lapidacao: 'Em lapidação',
  em_revisao: 'Em revisão',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

// Próximos passos permitidos a partir de cada status.
export const PROXIMOS_STATUS: Record<StatusBase3D, StatusBase3D[]> = {
  solicitado: ['em_processamento', 'cancelado'],
  em_processamento: ['base_gerada', 'cancelado'],
  base_gerada: ['em_lapidacao', 'em_revisao', 'entregue'],
  em_lapidacao: ['em_revisao', 'cancelado'],
  em_revisao: ['em_lapidacao', 'entregue'],
  entregue: [],
  cancelado: [],
};

export const CENA_LABEL: Record<string, string> = {
  vista_geral: 'Vista geral axonométrica',
  planta: 'Planta (topo)',
  area_evento: 'Área do evento (oblíqua)',
  pedestre: 'Pedestre no centro do polígono',
  pedestre_extremos: 'Pedestre nas extremidades',
  aerea_evento: 'Aérea tipo drone',
  pontos_de_vista: 'Pontos de vista do evento',
};

/** Mesma regra do motor (config.recomendar_nivel): a finalidade define o nível mínimo. */
export function recomendarNivel(finalidade: string | null | undefined, areaM2?: number | null) {
  const fin = finalidade ? FINALIDADES[finalidade] : undefined;
  const nivel: NivelBase3D = fin ? fin.nivel_minimo : 'basico';
  const alertas: string[] = [];
  if (areaM2 && areaM2 > AREA_ALERTA_M2) {
    alertas.push(
      `Área de ${formatarNumero(areaM2, 0)} m² acima de ${formatarNumero(AREA_ALERTA_M2, 0)} m²: ` +
      'processamento e lapidação mais longos; considere dividir em trechos.'
    );
  }
  return { nivel, prioridades: fin?.prioridades ?? [], alertas };
}

export function nivelAbaixo(escolhido: NivelBase3D, recomendado: NivelBase3D) {
  return ORDEM_NIVEIS.indexOf(escolhido) < ORDEM_NIVEIS.indexOf(recomendado);
}

export function formatarNumero(v: number, casas = 2) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Lê o primeiro polígono de um KML (texto). KMZ é guardado e processado pelo motor. */
export function lerPoligonoKml(texto: string): { nome: string; coords: [number, number][] } | null {
  if (typeof window === 'undefined') return null;
  const xml = new DOMParser().parseFromString(texto, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) return null;
  const poly = xml.getElementsByTagName('Polygon')[0];
  if (!poly) return null;
  const outer = poly.getElementsByTagName('outerBoundaryIs')[0] ?? poly;
  const txt = outer.getElementsByTagName('coordinates')[0]?.textContent ?? '';
  const coords = txt.trim().split(/\s+/).map(c => c.split(',').map(Number))
    .filter(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => [p[0], p[1]] as [number, number]);
  if (coords.length < 3) return null;
  const pm = poly.closest('Placemark');
  const nome = pm?.getElementsByTagName('name')[0]?.textContent ?? '';
  return { nome, coords };
}

/**
 * Área, perímetro e centro aproximados (projeção local equiretangular).
 * Para a escala de um evento (até alguns km) o erro fica abaixo de 0,5%;
 * o valor oficial é o calculado pelo motor em SIRGAS 2000 / UTM.
 */
export function medirPoligono(coords: [number, number][]) {
  const R = 6371008.8;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = coords.map(([lon, lat]) => [
    ((lon - lon0) * Math.PI / 180) * R * k,
    ((lat - lat0) * Math.PI / 180) * R,
  ]);
  if (xy.length && (xy[0][0] !== xy[xy.length - 1][0] || xy[0][1] !== xy[xy.length - 1][1])) xy.push(xy[0]);
  let area = 0;
  let perimetro = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    area += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
    perimetro += Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]);
  }
  return { area: Math.abs(area) / 2, perimetro, centro: { lat: lat0, lon: lon0 }, vertices: xy.length - 1 };
}

/** Lê o centro de um link do Google Earth Web (…/@lat,lon,…). */
export function centroDoLinkEarth(link: string): { lat: number; lon: number } | null {
  const m = link.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

function slug(txt: string) {
  return txt.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Base';
}

/** Monta o pedido.json lido por `python -m base3d gerar`. */
export function pedidoParaMotor(p: PedidoBase3D, lapidacoes: string[] = []) {
  const base = {
    codigo: p.job_code || p.id.slice(0, 8),
    nome: p.nome_local,
    nivel: p.nivel,
    finalidade: p.finalidade,
    inclui_pista: p.inclui_pista,
    fonte: 'rio_ipp',
    lapidacoes,
    pontos_de_vista: p.pontos_de_vista,
    saida: 'saida',
    observacoes: p.observacoes ?? '',
  };
  return p.origem_poligono === 'kml'
    ? { ...base, kml: p.kml_nome || `${slug(p.nome_local)}.kml` }
    : { ...base, centro: [p.centro_lat, p.centro_lon], area_m2: p.area_m2 };
}

export function baixarArquivo(nome: string, conteudo: string, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export const nomeArquivoKml = (p: PedidoBase3D) => p.kml_nome || `${slug(p.nome_local)}.kml`;
