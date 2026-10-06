-- Base 3D: automação entre o Freela Hub e o motor (tools/base3d/base3d/processador.py).
-- O processador roda na máquina Windows de produção com a chave de serviço, reserva pedidos,
-- gera o pacote, envia o ZIP ao Storage e registra a rodada. Complementa 20261005000000.

ALTER TABLE public.base3d_pedidos
    ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'rio_ipp',
    ADD COLUMN IF NOT EXISTS lapidacoes jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{revisao, nome, conteudo, enviado_por, enviado_em}]
    ADD COLUMN IF NOT EXISTS erro_processamento text,
    ADD COLUMN IF NOT EXISTS processador text,
    ADD COLUMN IF NOT EXISTS processado_em timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'base3d_pedidos_fonte_check') THEN
        ALTER TABLE public.base3d_pedidos
            ADD CONSTRAINT base3d_pedidos_fonte_check CHECK (fonte IN ('rio_ipp', 'osm'));
    END IF;
END $$;

-- Novo status 'erro' (processamento falhou; a mensagem fica em erro_processamento).
ALTER TABLE public.base3d_pedidos DROP CONSTRAINT IF EXISTS base3d_pedidos_status_check;
ALTER TABLE public.base3d_pedidos ADD CONSTRAINT base3d_pedidos_status_check CHECK (status IN (
    'solicitado', 'em_processamento', 'base_gerada', 'em_lapidacao', 'em_revisao', 'entregue', 'cancelado', 'erro'));

-- Reserva atômica: dois processadores nunca pegam o mesmo pedido.
CREATE OR REPLACE FUNCTION public.base3d_reservar_pedido(p_processador text)
RETURNS SETOF public.base3d_pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.base3d_pedidos p
       SET status = 'em_processamento', processador = p_processador, erro_processamento = NULL
     WHERE p.id = (
        SELECT id FROM public.base3d_pedidos
         WHERE status IN ('solicitado', 'em_lapidacao')
         ORDER BY prazo NULLS LAST, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
    RETURNING p.*;
END;
$$;

REVOKE ALL ON FUNCTION public.base3d_reservar_pedido(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.base3d_reservar_pedido(text) TO service_role;

-- Bucket privado para os pacotes; usuários autenticados leem por link assinado.
INSERT INTO storage.buckets (id, name, public)
VALUES ('base3d', 'base3d', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_base3d_pacotes') THEN
        CREATE POLICY "authenticated_read_base3d_pacotes" ON storage.objects
            FOR SELECT TO authenticated USING (bucket_id = 'base3d');
    END IF;
END $$;
