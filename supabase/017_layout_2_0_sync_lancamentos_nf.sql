-- Mantém os lançamentos fiscais fracionados sincronizados quando o valor do cartão do pedido muda.
create or replace function public.trg_sincronizar_lancamentos_nf_compra_card()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
begin
  perform public.sincronizar_lancamentos_nf_compra(new.id);
  return new;
end
$function$;

drop trigger if exists trg_sincronizar_lancamentos_nf_compra_card on public.compras_ml;
create trigger trg_sincronizar_lancamentos_nf_compra_card
after update of valor_operacao_cartao on public.compras_ml
for each row execute function public.trg_sincronizar_lancamentos_nf_compra_card();
