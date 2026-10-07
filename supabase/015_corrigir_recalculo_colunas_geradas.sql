-- Corrige a reconciliação NF x cartão para não gravar colunas geradas
-- e mantém a mensagem de pendência quando as notas ficam abaixo do cartão.

create or replace function public.recalcular_conferencia_compra(p_compra_id uuid)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
declare
  v_cartao numeric := 0;
  v_nf numeric := 0;
  v_qtd integer := 0;
  v_nfs text;
  v_obs text;
  v_diff numeric := 0;
begin
  if p_compra_id is null then return; end if;

  select coalesce(valor_operacao_cartao,0)
    into v_cartao
  from public.compras_ml
  where id = p_compra_id;

  if not found then return; end if;

  select
    coalesce(sum(coalesce(valor_total,0)),0),
    count(*)::integer,
    string_agg(distinct nullif(trim(numero_nf),''), ', ' order by nullif(trim(numero_nf),''))
  into v_nf, v_qtd, v_nfs
  from public.compras_ml_notas
  where compra_id = p_compra_id;

  v_diff := round(v_nf - v_cartao, 2);

  if v_diff > 0.01 then
    v_obs := 'ALERTA FINANCEIRO: valor das notas é maior que o valor pago no cartão em R$ ' ||
      to_char(v_diff,'FM999999990D00') ||
      '. Financeiro averiguar; Faturamento solicitar correção da(s) nota(s).';
  elsif v_diff < -0.01 then
    v_obs := 'PENDÊNCIA DE NOTAS: faltam R$ ' ||
      to_char(abs(v_diff),'FM999999990D00') ||
      ' em NF(s) para atingir o valor pago no cartão.';
  else
    v_obs := null;
  end if;

  update public.compras_ml
  set valor_nf_total = v_nf,
      observacao_divergencia = v_obs,
      status_conferencia = case
        when v_diff > 0.01 then 'DIVERGENCIA'
        when v_nf >= v_cartao and v_nf > 0 then 'CONCILIADO'
        when v_nf > 0 then 'AGUARDANDO_NF'
        else 'AGUARDANDO'
      end,
      updated_at = now()
  where id = p_compra_id;

  update public.transacoes
  set numero_nf = v_nfs,
      nf_aplicada = (v_qtd > 0),
      qtd_recibos_notas = v_qtd,
      valor_nota_fiscal = v_nf,
      conferencia_obs = v_obs,
      updated_at = now()
  where compra_id = p_compra_id;
end
$function$;
