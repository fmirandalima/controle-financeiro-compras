-- 009 — códigos de empresa e configuração por empresa das integrações
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo_empresa varchar(3);
UPDATE public.empresas SET codigo_empresa = lpad(trim(apelido), 3, '0') WHERE apelido ~ '^\d{1,3}$' AND codigo_empresa IS NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_codigo_empresa ON public.empresas(codigo_empresa);
CREATE TABLE IF NOT EXISTS public.integracoes_empresa (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), integracao text NOT NULL CHECK (integracao IN ('MERCADO_LIVRE','CONTA_SIMPLES')), codigo_empresa varchar(3) NOT NULL, empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'NAO_CONFIGURADO' CHECK (status IN ('NAO_CONFIGURADO','CONFIGURADO','CONECTADO','ERRO','TOKEN_EXPIRADO')), mensagem text, ultima_sincronizacao timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(integracao,codigo_empresa));
ALTER TABLE public.integracoes_empresa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracoes_empresa FROM anon;
GRANT SELECT ON public.integracoes_empresa TO authenticated;
DROP POLICY IF EXISTS integracoes_empresa_select_authenticated ON public.integracoes_empresa;
CREATE POLICY integracoes_empresa_select_authenticated ON public.integracoes_empresa FOR SELECT TO authenticated USING (true);
CREATE OR REPLACE FUNCTION public.integracoes_empresa_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_integracoes_empresa_updated_at ON public.integracoes_empresa;
CREATE TRIGGER trg_integracoes_empresa_updated_at BEFORE UPDATE ON public.integracoes_empresa FOR EACH ROW EXECUTE FUNCTION public.integracoes_empresa_updated_at();
INSERT INTO public.integracoes_empresa(integracao,codigo_empresa,empresa_id,status,mensagem,ultima_sincronizacao)
SELECT 'MERCADO_LIVRE','104',e.id,CASE WHEN t.expires_at > now() THEN 'CONECTADO' ELSE 'TOKEN_EXPIRADO' END,CASE WHEN t.expires_at > now() THEN 'Token Mercado Livre válido no momento da configuração.' ELSE 'Token Mercado Livre expirado.' END,t.updated_at FROM public.empresas e LEFT JOIN public.integracoes_ml_tokens t ON t.empresa_id=e.id WHERE e.codigo_empresa='104' ON CONFLICT (integracao,codigo_empresa) DO UPDATE SET empresa_id=excluded.empresa_id,status=excluded.status,mensagem=excluded.mensagem,ultima_sincronizacao=excluded.ultima_sincronizacao;
INSERT INTO public.integracoes_empresa(integracao,codigo_empresa,empresa_id,status)
SELECT 'MERCADO_LIVRE','001',e.id,'NAO_CONFIGURADO' FROM public.empresas e WHERE e.codigo_empresa='001' LIMIT 1 ON CONFLICT (integracao,codigo_empresa) DO NOTHING;
INSERT INTO public.integracoes_empresa(integracao,codigo_empresa,empresa_id,status)
SELECT 'CONTA_SIMPLES',c,e.id,'NAO_CONFIGURADO' FROM (VALUES ('104'),('001')) v(c) LEFT JOIN public.empresas e ON e.codigo_empresa=v.c LIMIT 2 ON CONFLICT (integracao,codigo_empresa) DO NOTHING;
NOTIFY pgrst, 'reload schema';