-- SEGURANÇA / RLS / AUDITORIA
-- Execute depois do 001_schema.sql.

alter table public.empresas enable row level security;
alter table public.perfis enable row level security;
alter table public.transacoes enable row level security;
alter table public.auditoria enable row level security;

revoke all on public.empresas from anon, authenticated;
revoke all on public.perfis from anon, authenticated;
revoke all on public.transacoes from anon, authenticated;
revoke all on public.auditoria from anon, authenticated;

grant select on public.empresas to anon, authenticated;
grant select on public.perfis to authenticated;
grant select, insert, update on public.transacoes to authenticated;
grant select on public.auditoria to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Função de papel. SECURITY DEFINER evita recursão RLS.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.perfis
  where id = (select auth.uid()) and ativo = true
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

-- PERFIS: cada usuário autenticado lê apenas seu próprio perfil.
create policy perfis_select_self on public.perfis
for select to authenticated
using (id = (select auth.uid()));

-- EMPRESAS: leitura pública para filtros.
create policy empresas_select_public on public.empresas
for select to anon, authenticated
using (ativo = true);

-- TRANSAÇÕES: autenticados leem tudo.
create policy transacoes_select_auth on public.transacoes
for select to authenticated
using (true);

-- Somente FATURAMENTO pode inserir.
create policy transacoes_insert_faturamento on public.transacoes
for insert to authenticated
with check ((select public.current_app_role()) = 'FATURAMENTO');

-- Update permitido para autenticados; trigger abaixo restringe COLUNAS por perfil.
create policy transacoes_update_roles on public.transacoes
for update to authenticated
using (true)
with check (true);

-- Nenhum DELETE.
-- Não criar policy de delete = operação negada.

-- Auditoria somente leitura.
create policy auditoria_select_roles on public.auditoria
for select to authenticated
using (true);

-- TRIGGER DE AUTORIZAÇÃO POR COLUNA
create or replace function public.enforce_transaction_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.app_role;
begin
  r := public.current_app_role();

  if r = 'FATURAMENTO' then
    if
      new.empresa_id is distinct from old.empresa_id or
      new.data is distinct from old.data or
      new.movimentacao is distinct from old.movimentacao or
      new.descricao is distinct from old.descricao or
      new.valor is distinct from old.valor or
      new.meio_pagamento is distinct from old.meio_pagamento or
      new.ultimos_digitos_cartao is distinct from old.ultimos_digitos_cartao or
      new.titular_cartao is distinct from old.titular_cartao or
      new.categoria is distinct from old.categoria or
      new.qtd_recibos_notas is distinct from old.qtd_recibos_notas or
      new.sankhya_ok is distinct from old.sankhya_ok or
      new.conferencia_obs is distinct from old.conferencia_obs
    then
      raise exception 'FATURAMENTO só pode alterar dados operacionais e os campos de NF, pagamento, comprovante e lançamento Sankhya';
    end if;
  elsif r = 'FINANCEIRO' then
    if
      new.empresa_id is distinct from old.empresa_id or
      new.data is distinct from old.data or
      new.movimentacao is distinct from old.movimentacao or
      new.descricao is distinct from old.descricao or
      new.valor is distinct from old.valor or
      new.meio_pagamento is distinct from old.meio_pagamento or
      new.ultimos_digitos_cartao is distinct from old.ultimos_digitos_cartao or
      new.titular_cartao is distinct from old.titular_cartao or
      new.categoria is distinct from old.categoria or
      new.qtd_recibos_notas is distinct from old.qtd_recibos_notas or
      new.valor_nota_fiscal is distinct from old.valor_nota_fiscal or
      new.valor_pago_cartao is distinct from old.valor_pago_cartao or
      new.comprovante_conta_simples is distinct from old.comprovante_conta_simples or
      new.lancado_sankhya is distinct from old.lancado_sankhya
    then
      raise exception 'FINANCEIRO só pode alterar Sankhya OK e Conferência/Obs';
    end if;
  else
    raise exception 'Perfil sem permissão';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_transaction_update() from public;

create trigger trg_transaction_update_guard
before update on public.transacoes
for each row execute function public.enforce_transaction_update();

-- AUDITORIA automática.
create or replace function public.audit_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria(usuario_id, transacao_id, acao, dados_novos)
    values (auth.uid(), new.id, 'CRIACAO', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.auditoria(usuario_id, transacao_id, acao, dados_anteriores, dados_novos)
    values (auth.uid(), new.id, 'EDICAO', to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.auditoria(usuario_id, transacao_id, acao, dados_anteriores)
    values (auth.uid(), old.id, 'EXCLUSAO', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_audit_transactions
after insert or update or delete on public.transacoes
for each row execute function public.audit_transaction_change();

-- IMPORTAÇÃO CONTROLADA: evita inserir diretamente sem fingerprint.
create or replace function public.importar_transacao(
  p_empresa_id bigint,
  p_data date,
  p_movimentacao text,
  p_descricao text,
  p_valor numeric,
  p_meio_pagamento text,
  p_ultimos_digitos_cartao varchar,
  p_titular_cartao text,
  p_categoria text,
  p_qtd_recibos_notas integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fp text;
  inserted_id bigint;
begin
  if public.current_app_role() <> 'FATURAMENTO' then
    raise exception 'Somente FATURAMENTO pode importar';
  end if;

  fp := encode(digest(
    concat_ws('|',
      p_empresa_id::text,
      p_data::text,
      upper(trim(coalesce(p_movimentacao,''))),
      upper(trim(coalesce(p_descricao,''))),
      to_char(p_valor, 'FM9999999990.00'),
      upper(trim(coalesce(p_meio_pagamento,''))),
      coalesce(p_ultimos_digitos_cartao,''),
      upper(trim(coalesce(p_titular_cartao,'')))
    )::bytea,
    'sha256'
  ), 'hex');

  insert into public.transacoes(
    empresa_id,data,movimentacao,descricao,valor,meio_pagamento,
    ultimos_digitos_cartao,titular_cartao,categoria,qtd_recibos_notas,
    fingerprint
  )
  values (
    p_empresa_id,p_data,p_movimentacao,p_descricao,p_valor,p_meio_pagamento,
    nullif(regexp_replace(p_ultimos_digitos_cartao,'\D','','g'),''),
    p_titular_cartao,p_categoria,coalesce(p_qtd_recibos_notas,0),fp
  )
  on conflict (fingerprint) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return 'DUPLICADA';
  end if;

  return 'OK';
end;
$$;

revoke all on function public.importar_transacao from public;
grant execute on function public.importar_transacao to authenticated;

-- VIEW PÚBLICA: nunca expõe titular/cartão/fingerprint.
drop view if exists public.consulta_publica;

create view public.consulta_publica
with (security_invoker = false)
as
select
  t.id,
  t.empresa_id,
  t.data,
  t.movimentacao,
  t.descricao,
  t.valor,
  t.meio_pagamento,
  t.categoria,
  t.qtd_recibos_notas,
  t.valor_nota_fiscal,
  t.valor_pago_cartao,
  t.comprovante_conta_simples,
  t.lancado_sankhya,
  t.sankhya_ok,
  t.conferencia_obs
from public.transacoes t;

revoke all on public.consulta_publica from public;
grant select on public.consulta_publica to anon, authenticated;
