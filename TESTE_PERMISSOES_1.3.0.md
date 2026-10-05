# Roteiro de teste — SIGCF 1.3.0

## Antes do teste

- Aplicar `supabase/007_permissions_v2_20260923.sql` no projeto correto.
- Publicar a versão do front.
- Não executar a migration duas vezes em paralelo.

## Cenário A — ADMIN

1. Entrar com usuário administrador.
2. Abrir **Administração**.
3. Selecionar o grupo `FATURAMENTO`.
4. Alterar uma permissão e clicar em atualizar/recarregar.
5. Abrir **Compras**.
6. Editar uma compra que tenha cartão.
7. Salvar.
8. Resultado esperado: não ocorrer `P0001 / Usuário sem permissão para alterar transações`.

## Cenário B — bloquear Importação

1. Em Administração, selecionar um grupo de teste.
2. Manter `Importação > Visualizar` marcado.
3. Desmarcar `Importação > Importar`.
4. Entrar com um usuário desse grupo.
5. Abrir Importação.
6. Resultado esperado: a tela informa que a ação Importar está bloqueada e o processamento não é permitido.

## Cenário C — permitir Importação sem Editar Compras

1. Para um grupo de teste, marcar `Importação > Visualizar` e `Importação > Importar`.
2. Deixar `Compras > Editar` desmarcado.
3. Entrar com esse usuário.
4. Importar um arquivo de teste.
5. Resultado esperado: a importação pode gravar, mas a edição manual de Compras continua bloqueada.

## Cenário D — somente consulta

1. Marcar somente `Consulta > Visualizar` para um grupo.
2. Entrar com usuário desse grupo.
3. Resultado esperado: somente Consulta aparece no menu, salvo outras telas explicitamente autorizadas.

## Cenário E — GESTOR

- Consulta: visualizar.
- Compras: visualizar.
- Auditoria: visualizar.
- Importação: sem acesso.
- Não deve conseguir alterar dados protegidos pelas regras de negócio.

## Cenário F — FINANCEIRO

- Consulta: visualizar.
- Compras: visualizar.
- Cartão: visualizar/editar conforme matriz.
- Importação: sem acesso.
- Alterações fora das colunas financeiras devem continuar recusadas pelo banco.

## Cenário G — regressão da importação CSV

1. Abrir Importação com FATURAMENTO autorizado.
2. Carregar o CSV da Conta Simples.
3. Validar e visualizar.
4. Confirmar importação.
5. Conferir quantidade inserida/duplicada.
6. Conferir Auditoria.
