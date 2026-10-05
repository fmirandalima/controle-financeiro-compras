-- SIGCF — Conciliação Cartão x NF sem bloqueio
-- Regra: soma das NFs < cartão = aguardando; = cartão = conciliado; > cartão = divergência com alerta, sem bloqueio.
-- Não comparar empresa da NF com empresa do cartão: a associação é pela compra-pai (compra_id).

create or replace function public.recalcular_conferencia_compra(p_compra_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_nf numeric(15,2); v_cartao numeric(15,2); v_diff numeric(15,2);
begin
  select coalesce(sum(n.valor_total),0), c.valor_operacao_cartao into v_nf,v_cartao
  from public.compras_ml c left join public.compras_ml_notas n on n.compra_id=c.id
  where c.id=p_compra_id group by c.id;
  v_diff:=v_nf-coalesce(v_cartao,0);
  update public.compras_ml set valor_nf_total=v_nf,
    observacao_divergencia=case when v_diff>0.01 then 'ALERTA FINANCEIRO: valor das notas é maior que o valor do cartão em R$ '||to_char(v_diff,'FM999999990.00')||'. Financeiro averiguar; Faturamento solicitar correção da(s) nota(s).' else null end,
    status_conferencia=case when v_diff>0.01 then 'DIVERGENCIA' when v_nf>=v_cartao and v_nf>0 then 'CONCILIADO' when v_nf>0 then 'AGUARDANDO_NF' else 'AGUARDANDO' end,
    updated_at=now() where id=p_compra_id;
end $$;

create or replace function public.trg_recalcular_conferencia_compra_nf() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalcular_conferencia_compra(coalesce(new.compra_id,old.compra_id)); return coalesce(new,old); end $$;

drop trigger if exists trg_recalcular_conferencia_compra_nf on public.compras_ml_notas;
create trigger trg_recalcular_conferencia_compra_nf after insert or update of compra_id,valor_total or delete on public.compras_ml_notas for each row execute function public.trg_recalcular_conferencia_compra_nf();

create or replace function public.trg_recalcular_conferencia_compra_card() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalcular_conferencia_compra(new.id); return new; end $$;

drop trigger if exists trg_recalcular_conferencia_compra_card on public.compras_ml;
create trigger trg_recalcular_conferencia_compra_card after insert or update of valor_operacao_cartao on public.compras_ml for each row execute function public.trg_recalcular_conferencia_compra_card();
