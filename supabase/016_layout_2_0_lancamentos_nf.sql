-- SIGCF Layout 2.0: lançamentos fiscais fracionados por NF.
-- Um pedido Mercado Livre continua sendo o cabeçalho (compra/cartão).
-- Cada NF vinculada gera seu próprio lançamento fiscal, sem duplicar o pagamento do cartão.

begin;

alter table public.compras_ml
  alter column observacao type varchar(120),
  add column if not exists ml_status varchar(100),
  add column if not exists ml_status_detail varchar(100),
  add column if not exists ml_buying_mode varchar(100),
  add column if not exists ml_currency_id varchar(100),
  add column if not exists ml_buyer_id varchar(100),
  add column if not exists ml_seller_id varchar(100),
  add column if not exists ml_shipping_id varchar(100),
  add column if not exists ml_tags varchar(100),
  add column if not exists ml_paid_amount numeric,
  add column if not exists ml_date_closed timestamptz,
  add column if not exists ml_last_updated timestamptz,
  add column if not exists ml_resumo_financeiro varchar(100),
  add column if not exists ml_coupon_amount numeric not null default 0,
  add column if not exists ml_discount_amount numeric not null default 0,
  add column if not exists ml_coupon_id varchar(100);

create table if not exists public.compras_ml_lancamentos_nf (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras_ml(id) on delete cascade,
  nota_fiscal_id uuid not null unique references public.compras_ml_notas(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  data_lancamento timestamptz not null,
  valor numeric not null check (valor >= 0),
  numero_nf varchar(20),
  serie_nf varchar(10),
  observacao text,
  status_erp boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compras_ml_lancamentos_nf_compra
  on public.compras_ml_lancamentos_nf(compra_id);

create index if not exists idx_compras_ml_lancamentos_nf_empresa_data
  on public.compras_ml_lancamentos_nf(empresa_id,data_lancamento);

alter table public.compras_ml_lancamentos_nf enable row level security;

drop policy if exists "compras_ml_lancamentos_nf_select" on public.compras_ml_lancamentos_nf;
create policy "compras_ml_lancamentos_nf_select"
on public.compras_ml_lancamentos_nf for select to authenticated
using (public.current_user_is_admin() or public.current_app_role() in ('COMPRAS','FATURAMENTO','FINANCEIRO','GESTOR'));

drop policy if exists "compras_ml_lancamentos_nf_insert" on public.compras_ml_lancamentos_nf;
create policy "compras_ml_lancamentos_nf_insert"
on public.compras_ml_lancamentos_nf for insert to authenticated
with check (public.current_user_is_admin() or public.current_app_role() in ('COMPRAS','FATURAMENTO'));

drop policy if exists "compras_ml_lancamentos_nf_update" on public.compras_ml_lancamentos_nf;
create policy "compras_ml_lancamentos_nf_update"
on public.compras_ml_lancamentos_nf for update to authenticated
using (public.current_user_is_admin() or public.current_app_role() in ('COMPRAS','FATURAMENTO'))
with check (public.current_user_is_admin() or public.current_app_role() in ('COMPRAS','FATURAMENTO'));

drop policy if exists "compras_ml_lancamentos_nf_delete" on public.compras_ml_lancamentos_nf;
create policy "compras_ml_lancamentos_nf_delete"
on public.compras_ml_lancamentos_nf for delete to authenticated
using (public.current_user_is_admin() or public.current_app_role() in ('COMPRAS','FATURAMENTO'));

create or replace function public.sincronizar_lancamentos_nf_compra(p_compra_id uuid)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
declare
  v_compra record;
  v_total_nf numeric := 0;
  v_obs text := null;
begin
  select id,empresa_id,valor_operacao_cartao
    into v_compra
  from public.compras_ml
  where id=p_compra_id;

  if not found then return; end if;

  select coalesce(sum(coalesce(valor_total,0)),0)
    into v_total_nf
  from public.compras_ml_notas
  where compra_id=p_compra_id;

  if abs(v_total_nf-coalesce(v_compra.valor_operacao_cartao,0)) > 0.01 then
    if v_total_nf < coalesce(v_compra.valor_operacao_cartao,0) then
      v_obs := 'PENDÊNCIA DE NOTAS: faltam R$ ' ||
        to_char(coalesce(v_compra.valor_operacao_cartao,0)-v_total_nf,'FM999999990D00') ||
        ' em NF(s) para atingir o valor pago no cartão.';
    else
      v_obs := 'ALERTA FINANCEIRO: NF(s) excedem o valor pago no cartão em R$ ' ||
        to_char(v_total_nf-coalesce(v_compra.valor_operacao_cartao,0),'FM999999990D00') ||
        '. Financeiro averiguar.';
    end if;
  end if;

  insert into public.compras_ml_lancamentos_nf(
    compra_id,nota_fiscal_id,empresa_id,data_lancamento,valor,numero_nf,serie_nf,observacao
  )
  select n.compra_id,n.id,v_compra.empresa_id,
         coalesce(n.data_emissao,c.data_compra),
         coalesce(n.valor_total,0),n.numero_nf,n.serie_nf,v_obs
  from public.compras_ml_notas n
  join public.compras_ml c on c.id=n.compra_id
  where n.compra_id=p_compra_id
  on conflict (nota_fiscal_id) do update
    set compra_id=excluded.compra_id,
        empresa_id=excluded.empresa_id,
        data_lancamento=excluded.data_lancamento,
        valor=excluded.valor,
        numero_nf=excluded.numero_nf,
        serie_nf=excluded.serie_nf,
        observacao=excluded.observacao,
        updated_at=now();

  update public.compras_ml_lancamentos_nf
  set observacao=v_obs, updated_at=now()
  where compra_id=p_compra_id;
end
$function$;

create or replace function public.trg_sincronizar_lancamentos_nf_compra()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
begin
  perform public.sincronizar_lancamentos_nf_compra(coalesce(new.compra_id,old.compra_id));
  return coalesce(new,old);
end
$function$;

drop trigger if exists trg_sincronizar_lancamentos_nf_compra on public.compras_ml_notas;
create trigger trg_sincronizar_lancamentos_nf_compra
after insert or update of compra_id,valor_total,numero_nf,serie_nf,data_emissao or delete
on public.compras_ml_notas
for each row execute function public.trg_sincronizar_lancamentos_nf_compra();

create or replace view public.vw_acompanhamento_compras_lancamentos as
select
  l.id as lancamento_id,
  l.compra_id,
  l.nota_fiscal_id,
  l.empresa_id,
  e.apelido as empresa_apelido,
  e.nome as empresa_nome,
  c.nro_requisicao,
  c.nro_oc,
  c.data_compra,
  c.ml_order_id,
  c.ml_pack_id,
  c.valor_operacao_cartao,
  c.valor_nf_total,
  c.diferenca_cartao_nf,
  c.status_conferencia,
  c.cartao,
  c.ultimos_digitos_cartao,
  c.data_estorno,
  c.valor_frete,
  c.valor_desconto,
  c.ml_coupon_amount,
  c.ml_discount_amount,
  c.ml_resumo_financeiro,
  c.observacao as observacao_compra,
  c.ml_status,
  c.ml_status_detail,
  c.ml_tags,
  c.mercado_entregue,
  c.status_entrega,
  l.data_lancamento,
  l.valor as valor_lancamento,
  l.numero_nf,
  l.serie_nf,
  l.observacao as observacao_lancamento,
  l.status_erp
from public.compras_ml_lancamentos_nf l
join public.compras_ml c on c.id=l.compra_id
join public.empresas e on e.id=l.empresa_id;

grant all on table public.compras_ml_lancamentos_nf to anon,authenticated,service_role;
grant all on table public.vw_acompanhamento_compras_lancamentos to anon,authenticated,service_role;

-- Backfill seguro dos lançamentos para as NFs já existentes.
do $$
declare r record;
begin
  for r in select distinct compra_id from public.compras_ml_notas where compra_id is not null loop
    perform public.sincronizar_lancamentos_nf_compra(r.compra_id);
  end loop;
end $$;

commit;
