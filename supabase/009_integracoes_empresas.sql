-- 009 — códigos de empresa e configuração por empresa das integrações
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo_empresa varchar(3);
CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_codigo_empresa ON public.empresas(codigo_empresa) WHERE codigo_empresa IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.integracoes_empresa (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), integracao text NOT NULL CHECK (integracao IN ('MERCADO_LIVRE','CONTA_SIMPLES')), codigo_empresa varchar(3) NOT NULL, empresa_id bigint REFERENCES public.empresas(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'NAO_CONFIGURADO' CHECK (status IN ('NAO_CONFIGURADO','CONFIGURADO','CONECTADO','ERRO','TOKEN_EXPIRADO')), mensagem text, ultima_sincronizacao timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(integracao,codigo_empresa));
ALTER TABLE public.integracoes_empresa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracoes_empresa FROM anon;
GRANT SELECT ON public.integracoes_empresa TO authenticated;
DROP POLICY IF EXISTS integracoes_empresa_select_authenticated ON public.integracoes_empresa;
CREATE POLICY integracoes_empresa_select_authenticated ON public.integracoes_empresa FOR SELECT TO authenticated USING (true);
CREATE OR REPLACE FUNCTION public.integracoes_empresa_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_integracoes_empresa_updated_at ON public.integracoes_empresa;
CREATE TRIGGER trg_integracoes_empresa_updated_at BEFORE UPDATE ON public.integracoes_empresa FOR EACH ROW EXECUTE FUNCTION public.integracoes_empresa_updated_at();
INSERT INTO public.integracoes_empresa(integracao,codigo_empresa,status) VALUES ('MERCADO_LIVRE','104','NAO_CONFIGURADO'),('MERCADO_LIVRE','001','NAO_CONFIGURADO'),('CONTA_SIMPLES','104','NAO_CONFIGURADO'),('CONTA_SIMPLES','001','NAO_CONFIGURADO') ON CONFLICT (integracao,codigo_empresa) DO NOTHING;
NOTIFY pgrst, 'reload schema';