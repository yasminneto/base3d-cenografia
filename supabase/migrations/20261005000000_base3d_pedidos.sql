-- Base 3D / Cenografia: pedidos de base 2D/3D de locais de evento e suas rodadas.
-- O processamento roda no motor tools/base3d (Python, máquina Windows com SketchUp SDK);
-- estas tabelas guardam o pedido, o nível de esforço, o andamento e o resultado de cada rodada.

CREATE TABLE IF NOT EXISTS public.base3d_pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
    job_code text,
    nome_local text NOT NULL,
    finalidade text NOT NULL,
    nivel text NOT NULL CHECK (nivel IN ('basico', 'intermediario', 'detalhado')),
    nivel_recomendado text CHECK (nivel_recomendado IN ('basico', 'intermediario', 'detalhado')),
    origem_poligono text NOT NULL CHECK (origem_poligono IN ('kml', 'coordenadas')),
    kml_nome text,
    kml_conteudo text,
    centro_lat double precision,
    centro_lon double precision,
    area_m2 numeric(14, 2),
    perimetro_m numeric(14, 2),
    link_google_earth text,
    inclui_pista boolean NOT NULL DEFAULT false,
    pontos_de_vista jsonb NOT NULL DEFAULT '[]'::jsonb,
    prazo date,
    observacoes text,
    status text NOT NULL DEFAULT 'solicitado' CHECK (status IN (
        'solicitado', 'em_processamento', 'base_gerada', 'em_lapidacao', 'em_revisao', 'entregue', 'cancelado')),
    nucleo_id text,
    solicitante_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT base3d_poligono_informado CHECK (
        (origem_poligono = 'kml' AND kml_conteudo IS NOT NULL) OR
        (origem_poligono = 'coordenadas' AND centro_lat IS NOT NULL AND centro_lon IS NOT NULL AND area_m2 > 0))
);

CREATE TABLE IF NOT EXISTS public.base3d_rodadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES public.base3d_pedidos(id) ON DELETE CASCADE,
    revisao text NOT NULL,                       -- R01 (geração), R02 (1ª lapidação), R03 (2ª lapidação)
    tipo text NOT NULL CHECK (tipo IN ('geracao', 'lapidacao')),
    pacote_url text,                             -- link do ZIP entregue (Drive, Storage etc.)
    verificacao jsonb,                           -- conteúdo de VERIFICACAO_Rnn.json gerado pelo motor
    pendencias text[] NOT NULL DEFAULT '{}',
    entrega_completa boolean,
    observacoes text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pedido_id, revisao)
);

CREATE INDEX IF NOT EXISTS base3d_pedidos_status_idx ON public.base3d_pedidos (status);
CREATE INDEX IF NOT EXISTS base3d_pedidos_job_idx ON public.base3d_pedidos (job_id);
CREATE INDEX IF NOT EXISTS base3d_rodadas_pedido_idx ON public.base3d_rodadas (pedido_id);

CREATE OR REPLACE FUNCTION public.base3d_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS base3d_pedidos_updated_at ON public.base3d_pedidos;
CREATE TRIGGER base3d_pedidos_updated_at BEFORE UPDATE ON public.base3d_pedidos
    FOR EACH ROW EXECUTE FUNCTION public.base3d_touch_updated_at();

ALTER TABLE public.base3d_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base3d_rodadas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_view_base3d_pedidos') THEN
        CREATE POLICY "authenticated_view_base3d_pedidos" ON public.base3d_pedidos
            FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_insert_base3d_pedidos') THEN
        CREATE POLICY "authenticated_insert_base3d_pedidos" ON public.base3d_pedidos
            FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_update_base3d_pedidos') THEN
        CREATE POLICY "authenticated_update_base3d_pedidos" ON public.base3d_pedidos
            FOR UPDATE TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_view_base3d_rodadas') THEN
        CREATE POLICY "authenticated_view_base3d_rodadas" ON public.base3d_rodadas
            FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_insert_base3d_rodadas') THEN
        CREATE POLICY "authenticated_insert_base3d_rodadas" ON public.base3d_rodadas
            FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
END $$;
