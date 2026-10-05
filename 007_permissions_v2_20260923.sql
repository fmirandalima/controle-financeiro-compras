-- SIGCF / Controle Financeiro
-- Versão: 2026-09-23
-- Objetivo:
-- 1) corrigir ADMIN no trigger de transacoes;
-- 2) criar autorização por TELA + AÇÃO;
-- 3) manter regras de negócio existentes no banco;
-- 4) permitir bloquear IMPORTAÇÃO independentemente de EDITAR.
--
-- IMPORTANTE: esta migration foi preparada a partir do código/schema que foi possível
-- validar no projeto. Ela NÃO foi executada neste ambiente.

begin;

-- ============================================================
-- 1. Corrige o problema já confirmado: ADMIN era barrado pelo trigger.
-- ============================================================
create or replace function public.enforce_transacoes_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  v_role := public.current_app_role();

  if v_role is null then
    raise exception 'Perfil do usuário não encontrado';
  end if;

  -- ADMIN é administrador do sistema e não deve cair no fallback de negação.
  if v_role = 'ADMIN'::public.app_role then
    return new;
  end if;

  if v_role = 'GESTOR'::public.app_role then
    raise exception 'GESTOR possui acesso somente para consulta';
  end if;

  if v_role = 'FINANCEIRO'::public.app_role then
    if
      new.empresa_id is distinct from old.empresa_id
      or new.data is distinct from old.data
      or new.movimentacao is distinct from old.movimentacao
      or new.descricao is distinct from old.descricao
      or new.valor is distinct from old.valor
      or new.meio_pagamento is distinct from old.meio_pagamento
      or new.ultimos_digitos_cartao is distinct from old.ultimos_digitos_cartao
      or new.titular_cartao is distinct from old.titular_cartao
      or new.categoria is distinct from old.categoria
      or new.qtd_recibos_notas is distinct from old.qtd_recibos_notas
      or new.valor_nota_fiscal is distinct from old.valor_nota_fiscal
      or new.valor_pago_cartao is distinct from old.valor_pago_cartao
      or new.comprovante_conta_simples is distinct from old.comprovante_conta_simples
      or new.lancado_sankhya is distinct from old.lancado_sankhya
      or new.fingerprint is distinct from old.fingerprint
      or new.conta_simples_transaction_id is distinct from old.conta_simples_transaction_id
      or new.conta_simples_attachment_count is distinct from old.conta_simples_attachment_count
      or new.conta_simples_synced_at is distinct from old.conta_simples_synced_at
    then
      raise exception 'FINANCEIRO pode alterar somente a confirmação financeira';
    end if;
    return new;
  end if;

  if v_role = 'COMPRAS'::public.app_role then
    if
      new.empresa_id is distinct from old.empresa_id
      or new.data is distinct from old.data
      or new.movimentacao is distinct from old.movimentacao
      or new.descricao is distinct from old.descricao
      or new.valor is distinct from old.valor
      or new.meio_pagamento is distinct from old.meio_pagamento
      or new.ultimos_digitos_cartao is distinct from old.ultimos_digitos_cartao
      or new.titular_cartao is distinct from old.titular_cartao
      or new.categoria is distinct from old.categoria
      or new.valor_pago_cartao is distinct from old.valor_pago_cartao
      or new.lancado_sankhya is distinct from old.lancado_sankhya
      or new.sankhya_ok is distinct from old.sankhya_ok
      or new.conferencia_obs is distinct from old.conferencia_obs
      or new.fingerprint is distinct from old.fingerprint
      or new.conta_simples_transaction_id is distinct from old.conta_simples_transaction_id
      or new.conta_simples_attachment_count is distinct from old.conta_simples_attachment_count
      or new.conta_simples_synced_at is distinct from old.conta_simples_synced_at
    then
      raise exception 'COMPRAS pode alterar somente dados relacionados à NF nesta tabela';
    end if;
    return new;
  end if;

  if v_role = 'FATURAMENTO'::public.app_role then
    return new;
  end if;

  raise exception 'Usuário sem permissão para alterar transações';
end;
$function$;

-- ============================================================
-- 2. Modelo genérico de grupos/telas/permissões.
-- Não depende de alterar a tabela perfis: o vínculo é por perfil_id.
-- ============================================================
create table if not exists public.app_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_grupo_membros (
  grupo_id uuid not null references public.app_grupos(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);

create table if not exists public.app_telas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permissoes_grupo (
  grupo_id uuid not null references public.app_grupos(id) on delete cascade,
  tela_id uuid not null references public.app_telas(id) on delete cascade,
  visualizar boolean not null default false,
  criar boolean not null default false,
  editar boolean not null default false,
  excluir boolean not null default false,
  importar boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (grupo_id, tela_id)
);

create index if not exists idx_app_grupo_membros_perfil on public.app_grupo_membros(perfil_id);
create index if not exists idx_app_permissoes_tela on public.app_permissoes_grupo(tela_id);

-- ============================================================
-- 3. Catálogo de telas. Pode receber outras telas sem alterar o modelo.
-- ============================================================
insert into public.app_telas (chave, nome, ordem) values
  ('CONSULTA', 'Consulta', 10),
  ('COMPRAS', 'Compras', 20),
  ('CARTAO', 'Cartão', 30),
  ('IMPORTACAO', 'Importação', 40),
  ('AUDITORIA', 'Auditoria', 50),
  ('ADMINISTRACAO', 'Administração', 90)
on conflict (chave) do update set nome = excluded.nome, ordem = excluded.ordem, ativo = true;

-- ============================================================
-- 4. Grupos iniciais correspondentes aos papéis atuais.
-- ============================================================
insert into public.app_grupos (nome) values
  ('ADMIN'), ('FATURAMENTO'), ('FINANCEIRO'), ('GESTOR'), ('COMPRAS')
on conflict (nome) do nothing;

-- Vincula cada perfil ao grupo de seu role sem remover grupos adicionais
-- que tenham sido criados posteriormente pelo administrador.
insert into public.app_grupo_membros (grupo_id, perfil_id)
select g.id, p.id
from public.perfis p
join public.app_grupos g
  on g.nome = case when coalesce(p.is_admin,false) then 'ADMIN' else p.role::text end
on conflict do nothing;

-- ============================================================
-- 5. Matriz inicial. É deliberadamente conservadora.
-- ADMIN: tudo.
-- FATURAMENTO: Compras visualizar/criar/editar; Importação visualizar/importar.
-- COMPRAS: Compras visualizar/criar/editar; Importação visualizar/importar.
-- FINANCEIRO: Consulta/Auditoria/Compras visualizar; Cartão visualizar/editar.
-- GESTOR: Consulta/Auditoria/Compras/Cartão visualizar.
-- Nenhum grupo recebe excluir por padrão.
-- ============================================================
insert into public.app_permissoes_grupo (grupo_id, tela_id, visualizar, criar, editar, excluir, importar)
select g.id, t.id,
  case
    when g.nome = 'ADMIN' then true
    when g.nome in ('FATURAMENTO','COMPRAS') and t.chave in ('COMPRAS','IMPORTACAO','CONSULTA','AUDITORIA') then true
    when g.nome = 'FINANCEIRO' and t.chave in ('COMPRAS','CARTAO','CONSULTA','AUDITORIA') then true
    when g.nome = 'GESTOR' and t.chave in ('COMPRAS','CARTAO','CONSULTA','AUDITORIA') then true
    else false
  end,
  case when g.nome = 'ADMIN' then true when g.nome in ('FATURAMENTO','COMPRAS') and t.chave = 'COMPRAS' then true else false end,
  case
    when g.nome = 'ADMIN' then true
    when g.nome in ('FATURAMENTO','COMPRAS') and t.chave = 'COMPRAS' then true
    when g.nome = 'FINANCEIRO' and t.chave = 'CARTAO' then true
    else false
  end,
  case when g.nome = 'ADMIN' then true else false end,
  case when g.nome = 'ADMIN' then true when g.nome in ('FATURAMENTO','COMPRAS') and t.chave = 'IMPORTACAO' then true else false end
from public.app_grupos g cross join public.app_telas t
on conflict (grupo_id,tela_id) do nothing;

-- ============================================================
-- 6. Função central de autorização.
-- SECURITY DEFINER somente para leitura da matriz, sem escrita.
-- ============================================================
create or replace function public.tem_permissao_tela(
  p_tela text,
  p_acao text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid;
  v_role public.app_role;
  v_ok boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then return false; end if;

  select p.role into v_role from public.perfis p where p.id = v_uid;
  if v_role is null then return false; end if;

  if exists (select 1 from public.perfis p where p.id=v_uid and coalesce(p.is_admin,false)) then
    return true;
  end if;

  select coalesce(bool_or(case lower(p_acao)
    when 'visualizar' then pg.visualizar
    when 'criar' then pg.criar
    when 'editar' then pg.editar
    when 'excluir' then pg.excluir
    when 'importar' then pg.importar
    else false
  end), false)
  into v_ok
  from public.app_grupo_membros gm
  join public.app_permissoes_grupo pg on pg.grupo_id=gm.grupo_id
  join public.app_telas t on t.id=pg.tela_id
  where gm.perfil_id=v_uid
    and upper(t.chave)=upper(p_tela)
    and t.ativo=true;

  return coalesce(v_ok,false);
end;
$function$;

revoke all on function public.tem_permissao_tela(text,text) from public;
grant execute on function public.tem_permissao_tela(text,text) to authenticated;

-- Privilégios de tabela necessários ao PostgREST. RLS continua sendo a segunda camada.
grant select on public.app_grupos, public.app_grupo_membros, public.app_telas, public.app_permissoes_grupo to authenticated;
grant insert, update, delete on public.app_grupos, public.app_grupo_membros, public.app_telas, public.app_permissoes_grupo to authenticated;

-- ============================================================
-- 7. Proteção de mutações de Compras no banco.
-- O React controla a interface, mas o banco continua sendo a autoridade.
-- INSERT/UPDATE/DELETE são protegidos pelo trigger abaixo.
-- A importação usa o wrapper já consumido pelo front, marcando a operação
-- com um GUC local para o trigger distinguir IMPORTAÇÃO de EDIÇÃO.
-- ============================================================
create or replace function public.enforce_compras_ml_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.sigcf_importacao', true), '0') = '1' then
      if not public.tem_permissao_tela('IMPORTACAO', 'importar') then
        raise exception 'Usuário sem permissão para importar na tela IMPORTAÇÃO';
      end if;
    elsif not public.tem_permissao_tela('COMPRAS', 'criar') then
      raise exception 'Usuário sem permissão para criar lançamentos de COMPRAS';
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(current_setting('app.sigcf_importacao', true), '0') = '1' then
      if not public.tem_permissao_tela('IMPORTACAO', 'importar') then
        raise exception 'Usuário sem permissão para importar na tela IMPORTAÇÃO';
      end if;
    elsif not public.tem_permissao_tela('COMPRAS', 'editar') then
      raise exception 'Usuário sem permissão para editar lançamentos de COMPRAS';
    end if;
  elsif tg_op = 'DELETE' then
    if not public.tem_permissao_tela('COMPRAS', 'excluir') then
      raise exception 'Usuário sem permissão para excluir lançamentos de COMPRAS';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

revoke all on function public.enforce_compras_ml_permissions() from public;
grant execute on function public.enforce_compras_ml_permissions() to authenticated;

DROP TRIGGER IF EXISTS trg_compras_ml_permissions ON public.compras_ml;
CREATE TRIGGER trg_compras_ml_permissions
BEFORE INSERT OR UPDATE OR DELETE ON public.compras_ml
FOR EACH ROW EXECUTE FUNCTION public.enforce_compras_ml_permissions();

-- O front atual chama esta assinatura de importação. Não recriamos a rotina
-- principal de criação/edição aqui porque ela já existe no banco e possui
-- regras de negócio próprias. O wrapper somente autoriza a ação IMPORTAR e
-- encaminha a chamada para a função de criação existente.
create or replace function public.importar_lancamento_compra(
  p_empresa_id bigint,
  p_nro_requisicao integer,
  p_data_compra timestamptz,
  p_ml_order_id text,
  p_valor_operacao_cartao numeric,
  p_nro_oc integer,
  p_ultimos_digitos_cartao varchar,
  p_observacao text,
  p_status_erp boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
begin
  if not public.tem_permissao_tela('IMPORTACAO', 'importar') then
    raise exception 'Usuário sem permissão para importar na tela IMPORTAÇÃO';
  end if;

  perform set_config('app.sigcf_importacao', '1', true);

  -- O projeto atual possui a rotina de criação com os 9 parâmetros usados
  -- pelo front. A chamada dinâmica evita erro de compilação da migration se
  -- houver sobrecarga histórica; a execução falha de forma explícita se a
  -- assinatura esperada não existir.
  if to_regprocedure('public.criar_lancamento_compra(bigint,integer,timestamptz,text,numeric,integer,character varying,text,boolean)') is null then
    raise exception 'Função criar_lancamento_compra com 9 parâmetros não encontrada. Execute a versão correta das rotinas de Compras antes desta migration.';
  end if;

  execute 'select public.criar_lancamento_compra($1,$2,$3,$4,$5,$6,$7,$8,$9)'
    into v_id
    using p_empresa_id, p_nro_requisicao, p_data_compra, p_ml_order_id,
          p_valor_operacao_cartao, p_nro_oc, p_ultimos_digitos_cartao,
          p_observacao, p_status_erp;

  return v_id;
end;
$function$;

revoke all on function public.importar_lancamento_compra(bigint,integer,timestamptz,text,numeric,integer,varchar,text,boolean) from public;
grant execute on function public.importar_lancamento_compra(bigint,integer,timestamptz,text,numeric,integer,varchar,text,boolean) to authenticated;

-- ============================================================
-- 8. RLS: usuário autenticado pode consultar sua própria autorização;
-- somente ADMIN deve administrar matriz. A UI não substitui isso.
-- ============================================================
alter table public.app_grupos enable row level security;
alter table public.app_grupo_membros enable row level security;
alter table public.app_telas enable row level security;
alter table public.app_permissoes_grupo enable row level security;

-- Policies idempotentes: remove apenas as políticas deste módulo.
drop policy if exists app_grupos_select on public.app_grupos;
drop policy if exists app_grupos_admin_write on public.app_grupos;
drop policy if exists app_membros_select on public.app_grupo_membros;
drop policy if exists app_membros_admin_write on public.app_grupo_membros;
drop policy if exists app_telas_select on public.app_telas;
drop policy if exists app_telas_admin_write on public.app_telas;
drop policy if exists app_permissoes_select on public.app_permissoes_grupo;
drop policy if exists app_permissoes_admin_write on public.app_permissoes_grupo;

create policy app_grupos_select on public.app_grupos
for select to authenticated using (true);
create policy app_grupos_admin_write on public.app_grupos
for all to authenticated
using (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)))
with check (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)));

create policy app_membros_select on public.app_grupo_membros
for select to authenticated
using (perfil_id=auth.uid() or exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)));
create policy app_membros_admin_write on public.app_grupo_membros
for all to authenticated
using (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)))
with check (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)));

create policy app_telas_select on public.app_telas
for select to authenticated using (true);
create policy app_telas_admin_write on public.app_telas
for all to authenticated
using (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)))
with check (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)));

create policy app_permissoes_select on public.app_permissoes_grupo
for select to authenticated
using (
  exists(select 1 from public.app_grupo_membros gm where gm.grupo_id=app_permissoes_grupo.grupo_id and gm.perfil_id=auth.uid())
  or exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false))
);
create policy app_permissoes_admin_write on public.app_permissoes_grupo
for all to authenticated
using (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)))
with check (exists(select 1 from public.perfis p where p.id=auth.uid() and coalesce(p.is_admin,false)));

commit;

-- Pós-migration:
-- 1) testar ADMIN alterando uma compra com cartão;
-- 2) testar cada grupo na tela de Administração;
-- 3) testar Importação separadamente de Editar;
-- 4) Compras já possui proteção de INSERT/UPDATE/DELETE por trigger e wrapper de importação.
-- 5) Demais RPCs de outros módulos devem receber a mesma proteção quando existirem.
--
-- Importante: os INSERTs de permissões usam DO NOTHING para não sobrescrever
-- ajustes manuais feitos pelo administrador em uma execução posterior.
