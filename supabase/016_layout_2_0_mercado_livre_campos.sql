-- Layout 2.0 / Mercado Livre:
-- amplia observação manual e prepara campos tipados para os retornos relevantes da Order API.
-- Inclui resumo de conciliação para consulta sem depender de cálculo no frontend.

begin;

drop view public.vw_acompanhamento_compras;

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
  add column if not exists ml_resumo_financeiro varchar(100);

create view public.vw_acompanhamento_compras as
select
  c.id,
  c.empresa_id,
  c.nro_requisicao,
  c.nro_oc,
  c.data_compra,
  c.data_cartao,
  c.data_estorno,
  c.ml_order_id,
  c.ml_pack_id,
  c.valor_operacao_cartao,
  c.valor_nf_total,
  c.valor_frete,
  c.valor_desconto,
  c.valor_outras_despesas,
  c.valor_ipi,
  c.diferenca_cartao_nf,
  c.tem_divergencia,
  c.mercado_entregue,
  c.palavra_chave,
  c.ultimos_digitos_cartao,
  c.conta_simples_transaction_id,
  c.conta_simples_attachment_count,
  c.conta_simples_comprovante,
  c.status_conferencia,
  c.observacao_divergencia,
  case
    when c.valor_nf_total < c.valor_operacao_cartao - 0.01 then
      'Soma das notas/itens é menor que o valor pago no cartão em R$ ' || to_char(c.valor_operacao_cartao - c.valor_nf_total, 'FM999999990D00')
    when c.valor_nf_total > c.valor_operacao_cartao + 0.01 then
      'Soma das notas é maior que o valor pago no cartão em R$ ' || to_char(c.valor_nf_total - c.valor_operacao_cartao, 'FM999999990D00')
    when c.valor_nf_total > 0 and c.valor_operacao_cartao > 0 then
      'Notas conciliadas com o valor pago no cartão'
    else null
  end as resumo_conferencia,
  count(distinct n.id) as quantidade_notas,
  count(distinct i.id) as quantidade_itens,
  c.created_at,
  c.updated_at,
  c.status_erp,
  c.observacao,
  c.cartao,
  c.status_entrega,
  c.oc_cancelada,
  c.cidade_uf_destino,
  c.ml_status,
  c.ml_status_detail,
  c.ml_buying_mode,
  c.ml_currency_id,
  c.ml_buyer_id,
  c.ml_seller_id,
  c.ml_shipping_id,
  c.ml_tags,
  c.ml_paid_amount,
  c.ml_date_closed,
  c.ml_last_updated,
  c.ml_resumo_financeiro,
  e.apelido as empresa_apelido,
  e.nome as empresa_nome,
  e.cnpj as empresa_cnpj,
  e.cidade_uf as empresa_cidade_uf,
  string_agg(distinct nullif(trim(both from n.numero_nf), ''::text), ', '::text order by nullif(trim(both from n.numero_nf), ''::text)) as numeros_nf
from public.compras_ml c
left join public.compras_ml_notas n on n.compra_id = c.id
left join public.compras_ml_nf_itens i on i.nota_fiscal_id = n.id
left join public.empresas e on e.id = c.empresa_id
group by c.id, e.apelido, e.nome, e.cnpj, e.cidade_uf;

grant all on table public.vw_acompanhamento_compras to anon;
grant all on table public.vw_acompanhamento_compras to authenticated;
grant all on table public.vw_acompanhamento_compras to service_role;

do $
declare
  r record;
  ddl text;
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('criar_lancamento_compra','atualizar_lancamento_compra')
      and pg_get_functiondef(p.oid) ~* 'length\\(p_observacao\\)\\s*>\\s*10'
  loop
    ddl := regexp_replace(r.definition, 'length\\(p_observacao\\)\\s*>\\s*10', 'length(p_observacao) > 120', 'g');
    ddl := replace(ddl, 'Observação deve ter no máximo 10 caracteres.', 'Observação deve ter no máximo 120 caracteres.');
    execute ddl;
  end loop;
end $;

commit;
