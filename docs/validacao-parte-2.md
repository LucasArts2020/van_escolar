# Validação da Parte 2 — 22/10/2026

## Executado

- `npm test`: **26 testes aprovados** (12 da Parte 1 e 14 da Parte 2), via HTTP no NestJS com PostgreSQL no PGlite isolado.
- `npm run typecheck`: API, painel e aplicativo aprovados.
- `npm run build`: backend e painel compilados com sucesso.
- `npx expo export --platform android --max-workers 2`: bundle Android atualizado gerado com sucesso, 619 módulos. A checagem de tipos do aplicativo também foi repetida após o ajuste final de tela pequena e atualização do detalhe.
- Migração e seed incrementais executados no PostgreSQL 16 do Docker Compose, preservando contas, sessões e dados anteriores.
- `GET /health`: `status: ok`, `stage: 2`, com consulta ao PostgreSQL local.
- Navegador Edge via Playwright: cadastro de aluno pela escola, solicitação ao transporte, bloqueio da lista antes do aceite, aceite pelo motorista, consulta após aceite, cadastro de veículo, inativação com motivo e retirada do aluno da lista do destinatário.
- Visão de responsável: somente Sofia autorizada, sem acesso ao aluno criado no teste; detalhe e logout conferidos em largura 390 px, sem transbordamento horizontal nem erros JavaScript capturados. Capturas locais inspecionadas em `.local/parte2-*.png`.

O teste de interface acrescentou `Aluno teste UI 651664` ao cadastro da Horizonte e `Van teste UI 651664`, placa `TST2Q64`, à operação Boa Viagem. A associação desse aluno foi inativada no fim do teste; os registros e a autoria foram mantidos para revisão. São dados fictícios.

## Cobertura específica

Os testes da Parte 2 verificam autorização por criança e perfil; fluxo de associação iniciado pelos dois lados; pendência sem acesso ao detalhe; rejeição de IDs fora do escopo; inativação preservando dados; recusa/reenvio sem duplicação de vínculo; revisão local de homônimos; convite familiar sem liberação antes de conferência; permissão do verificador; revogação individual do responsável; escopo de veículos; contexto novo vazio; convite de motorista; preservação de senha/nome em conta existente; cancelamento e expiração de convites.

## Pendências de aceite

O usuário deve executar `teste-parte-2.md` e validar os procedimentos propostos em `parte-2.md`. Não houve teste em celular físico nem build iOS. D-08/D-12 continuam pendentes; recebedores alternativos não foram presumidos. Rotina semanal e planejamento aguardam autorização para a Parte 3.
