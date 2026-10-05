-- HARDENING: dados financeiros somente para usuários autenticados.
-- Execute depois das etapas anteriores no projeto Supabase atual.

-- A consulta pública antiga não deve mais existir.
drop view if exists public.consulta_publica;

-- Empresas não precisam ser consultáveis anonimamente.
revoke select on public.empresas from anon;
drop policy if exists empresas_select_public on public.empresas;

-- Garante leitura das empresas somente para autenticados.
create policy empresas_select_authenticated
on public.empresas
for select to authenticated
using (true);

-- Garante que ninguém anônimo tenha acesso à tabela de solicitações.
revoke all on public.solicitacoes_acesso from anon;
