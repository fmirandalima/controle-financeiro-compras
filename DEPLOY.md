# Checklist de publicação — SIGCF 1.3.0

## Supabase
- [ ] Migrations anteriores aplicadas.
- [ ] `006_compras_ml.sql` (ou equivalente atual do banco) aplicado.
- [ ] `007_permissions_v2_20260923.sql` aplicado com sucesso.
- [ ] ADMIN confirmado em `public.perfis`.
- [ ] RLS habilitado.
- [ ] Nenhum segredo/service_role no frontend.

## Permissões
- [ ] Grupo ADMIN consegue abrir Administração.
- [ ] Grupo sem visualizar não vê a respectiva tela.
- [ ] Grupo sem editar não consegue editar.
- [ ] Grupo sem importar não consegue importar.
- [ ] Grupo com importar, mas sem editar, consegue executar a importação sem ganhar edição manual.
- [ ] Exclusão permanece bloqueada quando a ação excluir não estiver autorizada.

## Vercel/GitHub
- [ ] Commit da versão 1.3.0 criado.
- [ ] Deploy concluído.
- [ ] `VITE_SUPABASE_URL` configurada.
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` configurada.
- [ ] Login validado.

## Regressão
- [ ] Consulta.
- [ ] Importação Conta Simples.
- [ ] Auditoria.
- [ ] Compras Mercado Livre.
- [ ] Edição de compra com cartão usando ADMIN.
- [ ] Teste por grupo/permissão conforme `docs/TESTE_PERMISSOES_1.3.0.md`.
