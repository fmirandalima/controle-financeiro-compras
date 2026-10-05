-- MÓDULO COMPRAS / MERCADO LIVRE
-- Executar DEPOIS das migrations existentes do projeto.
-- Não altera nem remove dados de transacoes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND t.typnamespace = 'public'::regnamespace AND e.enumlabel = 'COMPRAS'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'COMPRAS';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.compras_ml (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id bigint NOT NULL REFERENCES public.empresas(id),
  nro_requisicao integer NOT NULL CHECK (nro_requisicao BETWEEN 0 AND 9999999),
  nro_oc integer NULL CHECK (nro_oc IS NULL OR nro_oc BETWEEN 0 AND 9999999),
  data_compra timestamptz NOT NULL,
  ml_order_id text,
  ml_pack_id text,
  data_cartao timestamptz,
  valor_operacao_cartao numeric(15,2) NOT NULL CHECK (valor_operacao_cartao >= 0),
  ultimos_digitos_cartao varchar(4) CHECK (ultimos_digitos_cartao IS NULL OR ultimos_digitos_cartao ~ '^[0-9]{4}$'),
  conta_simples_transaction_id text,
  conta_simples_attachment_count integer NOT NULL DEFAULT 0,
  conta_simples_comprovante boolean NOT NULL DEFAULT false,
  conta_simples_synced_at timestamptz,
  data_estorno timestamptz,
  mercado_entregue boolean,
  palavra_chave text,
  valor_nf_total numeric(15,2) NOT NULL DEFAULT 0,
  valor_frete numeric(15,2) NOT NULL DEFAULT 0,
  valor_desconto numeric(15,2) NOT NULL DEFAULT 0,
  valor_outras_despesas numeric(15,2) NOT NULL DEFAULT 0,
  valor_ipi numeric(15,2) NOT NULL DEFAULT 0,
  diferenca_cartao_nf numeric(15,2) GENERATED ALWAYS AS (valor_operacao_cartao - valor_nf_total) STORED,
  tem_divergencia boolean GENERATED ALWAYS AS (abs(valor_operacao_cartao - valor_nf_total) > 0.01) STORED,
  observacao_divergencia text,
  status_conferencia text NOT NULL DEFAULT 'AGUARDANDO' CHECK (status_conferencia IN ('AGUARDANDO','AGUARDANDO_NF','CONCILIADO','DIVERGENCIA','ESTORNADO','ENTREGUE','PENDENCIA')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compras_ml_empresa_order ON public.compras_ml(empresa_id, ml_order_id) WHERE ml_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compras_ml_empresa ON public.compras_ml(empresa_id);
CREATE INDEX IF NOT EXISTS idx_compras_ml_requisicao ON public.compras_ml(nro_requisicao);
CREATE INDEX IF NOT EXISTS idx_compras_ml_data ON public.compras_ml(data_compra DESC);
CREATE INDEX IF NOT EXISTS idx_compras_ml_card ON public.compras_ml(ultimos_digitos_cartao);
CREATE INDEX IF NOT EXISTS idx_compras_ml_cs ON public.compras_ml(conta_simples_transaction_id);
CREATE INDEX IF NOT EXISTS idx_compras_ml_status ON public.compras_ml(status_conferencia);

CREATE TABLE IF NOT EXISTS public.compras_ml_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras_ml(id) ON DELETE CASCADE,
  numero_nf varchar(20),
  serie_nf varchar(10),
  chave_acesso varchar(44),
  data_emissao timestamptz,
  cnpj_emitente varchar(14),
  razao_social_emitente text,
  valor_produtos numeric(15,2) NOT NULL DEFAULT 0,
  valor_frete numeric(15,2) NOT NULL DEFAULT 0,
  valor_desconto numeric(15,2) NOT NULL DEFAULT 0,
  valor_ipi numeric(15,2) NOT NULL DEFAULT 0,
  valor_outras_despesas numeric(15,2) NOT NULL DEFAULT 0,
  valor_total numeric(15,2) NOT NULL DEFAULT 0,
  ml_invoice_id text,
  ml_document_url text,
  status_nf text NOT NULL DEFAULT 'PENDENTE' CHECK (status_nf IN ('PENDENTE','LOCALIZADA','VALIDADA','DIVERGENCIA','CANCELADA')),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compras_ml_notas ON public.compras_ml_notas(compra_id, numero_nf, serie_nf) WHERE numero_nf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compras_ml_notas_compra ON public.compras_ml_notas(compra_id);

CREATE TABLE IF NOT EXISTS public.compras_ml_nf_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id uuid NOT NULL REFERENCES public.compras_ml_notas(id) ON DELETE CASCADE,
  numero_item integer,
  codigo_produto text,
  descricao text NOT NULL,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  unidade text,
  valor_unitario numeric(15,4) NOT NULL DEFAULT 0,
  valor_produtos numeric(15,2) NOT NULL DEFAULT 0,
  valor_frete numeric(15,2) NOT NULL DEFAULT 0,
  valor_desconto numeric(15,2) NOT NULL DEFAULT 0,
  valor_ipi numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compras_ml_itens_nf ON public.compras_ml_nf_itens(nota_fiscal_id);

CREATE TABLE IF NOT EXISTS public.compras_ml_cs_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras_ml(id) ON DELETE CASCADE,
  conta_simples_attachment_id text NOT NULL,
  nome_arquivo text,
  tipo_arquivo text,
  url_conteudo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(compra_id, conta_simples_attachment_id)
);

CREATE TABLE IF NOT EXISTS public.integracoes_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao text NOT NULL CHECK (integracao IN ('CONTA_SIMPLES','MERCADO_LIVRE','SANKHYA')),
  inicio timestamptz NOT NULL DEFAULT now(), fim timestamptz,
  status text NOT NULL DEFAULT 'EXECUTANDO' CHECK (status IN ('EXECUTANDO','SUCESSO','SUCESSO_COM_ERROS','ERRO')),
  registros_consultados integer NOT NULL DEFAULT 0,
  registros_novos integer NOT NULL DEFAULT 0,
  registros_atualizados integer NOT NULL DEFAULT 0,
  registros_duplicados integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  mensagem text,
  executado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.compras_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_compras_ml_updated_at ON public.compras_ml;
CREATE TRIGGER trg_compras_ml_updated_at BEFORE UPDATE ON public.compras_ml FOR EACH ROW EXECUTE FUNCTION public.compras_set_updated_at();
DROP TRIGGER IF EXISTS trg_compras_ml_notas_updated_at ON public.compras_ml_notas;
CREATE TRIGGER trg_compras_ml_notas_updated_at BEFORE UPDATE ON public.compras_ml_notas FOR EACH ROW EXECUTE FUNCTION public.compras_set_updated_at();

CREATE OR REPLACE FUNCTION public.criar_lancamento_compra(
  p_empresa_id bigint,
  p_nro_requisicao integer,
  p_data_compra timestamptz,
  p_ml_order_id text,
  p_valor_operacao_cartao numeric,
  p_nro_oc integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF public.current_app_role() NOT IN ('COMPRAS'::public.app_role, 'FATURAMENTO'::public.app_role) THEN
    RAISE EXCEPTION 'Perfil sem permissão para lançar compras';
  END IF;
  IF p_nro_requisicao IS NULL OR p_nro_requisicao < 0 OR p_nro_requisicao > 9999999 THEN RAISE EXCEPTION 'Nº Requisição inválido'; END IF;
  IF p_nro_oc IS NOT NULL AND (p_nro_oc < 0 OR p_nro_oc > 9999999) THEN RAISE EXCEPTION 'Nº OC inválido'; END IF;
  IF p_valor_operacao_cartao IS NULL OR p_valor_operacao_cartao < 0 THEN RAISE EXCEPTION 'Valor do cartão inválido'; END IF;

  IF p_ml_order_id IS NOT NULL AND btrim(p_ml_order_id) <> '' THEN
    SELECT id INTO v_id FROM public.compras_ml WHERE empresa_id = p_empresa_id AND ml_order_id = btrim(p_ml_order_id) LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.compras_ml(empresa_id,nro_requisicao,nro_oc,data_compra,ml_order_id,valor_operacao_cartao,created_by,updated_by)
    VALUES(p_empresa_id,p_nro_requisicao,p_data_compra,p_nro_oc,NULLIF(btrim(p_ml_order_id),''),p_valor_operacao_cartao,auth.uid(),auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.compras_ml
       SET nro_requisicao=p_nro_requisicao,
           data_compra=p_data_compra,
           valor_operacao_cartao=p_valor_operacao_cartao,
           nro_oc=COALESCE(p_nro_oc,nro_oc),
           updated_by=auth.uid()
     WHERE id=v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.atualizar_nro_oc_compra(p_compra_id uuid, p_nro_oc integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.current_app_role() NOT IN ('COMPRAS'::public.app_role, 'FATURAMENTO'::public.app_role) THEN RAISE EXCEPTION 'Perfil sem permissão'; END IF;
  IF p_nro_oc IS NOT NULL AND (p_nro_oc < 0 OR p_nro_oc > 9999999) THEN RAISE EXCEPTION 'Nº OC inválido'; END IF;
  UPDATE public.compras_ml SET nro_oc=p_nro_oc, updated_by=auth.uid() WHERE id=p_compra_id;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.criar_lancamento_compra(bigint,integer,timestamptz,text,numeric,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_lancamento_compra(bigint,integer,timestamptz,text,numeric,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.atualizar_nro_oc_compra(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_nro_oc_compra(uuid,integer) TO authenticated;

ALTER TABLE public.compras_ml ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_ml_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_ml_nf_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_ml_cs_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracoes_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras_ml, public.compras_ml_notas, public.compras_ml_nf_itens, public.compras_ml_cs_anexos, public.integracoes_sync_log FROM anon, authenticated;
GRANT SELECT ON public.compras_ml, public.compras_ml_notas, public.compras_ml_nf_itens, public.compras_ml_cs_anexos, public.integracoes_sync_log TO authenticated;

DROP POLICY IF EXISTS compras_ml_select_authenticated ON public.compras_ml;
CREATE POLICY compras_ml_select_authenticated ON public.compras_ml FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS compras_ml_notas_select_authenticated ON public.compras_ml_notas;
CREATE POLICY compras_ml_notas_select_authenticated ON public.compras_ml_notas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS compras_ml_itens_select_authenticated ON public.compras_ml_nf_itens;
CREATE POLICY compras_ml_itens_select_authenticated ON public.compras_ml_nf_itens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS compras_ml_anexos_select_authenticated ON public.compras_ml_cs_anexos;
CREATE POLICY compras_ml_anexos_select_authenticated ON public.compras_ml_cs_anexos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS integracoes_sync_log_select_authenticated ON public.integracoes_sync_log;
CREATE POLICY integracoes_sync_log_select_authenticated ON public.integracoes_sync_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.vw_acompanhamento_compras
WITH (security_invoker = true) AS
SELECT c.id,c.empresa_id,c.nro_requisicao,c.nro_oc,c.data_compra,c.ml_order_id,c.ml_pack_id,c.data_cartao,
       c.valor_operacao_cartao,c.ultimos_digitos_cartao,c.conta_simples_transaction_id,c.data_estorno,c.mercado_entregue,
       c.palavra_chave,c.valor_nf_total,c.valor_frete,c.valor_desconto,c.valor_outras_despesas,c.valor_ipi,
       c.diferenca_cartao_nf,c.tem_divergencia,c.observacao_divergencia,c.status_conferencia,c.created_at,c.updated_at,
       count(distinct n.id)::integer AS notas_count,
       count(i.id)::integer AS itens_count
FROM public.compras_ml c
LEFT JOIN public.compras_ml_notas n ON n.compra_id=c.id
LEFT JOIN public.compras_ml_nf_itens i ON i.nota_fiscal_id=n.id
GROUP BY c.id;
GRANT SELECT ON public.vw_acompanhamento_compras TO authenticated;

NOTIFY pgrst, 'reload schema';
