# Validação da Parte 3 — 22/10/2026

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| `npm test` | **40 testes aprovados**: 26 das Partes 1/2 e 14 de planejamento |
| `npm run typecheck` | API, painel e aplicativo aprovados |
| `npm run build` | Backend e painel compilados, incluindo identificação do cadastro para homônimos |
| Aplicativo Expo | Checagem de tipos aprovada e bundle Android gerado com 620 módulos (`--max-workers 2`) |
| Migração e seed | Executados no PostgreSQL 16 local, preservando os dados anteriores |
| `/health` | `status: ok`, `stage: 3`, com acesso ao PostgreSQL |
| Navegador Edge / Playwright | Rotina semanal salva/recarregada, ida e volta independentes, solicitação tardia, aceite pelo motorista e atualização visível na escola |
| Reexecução no PostgreSQL local | Duas gerações concorrentes retornaram zero linhas novas e preservaram IDs, versões, estados e prazos existentes; código do cadastro confirmado na resposta dos cartões |
| Tela de 390 px | Sem transbordamento horizontal nem erros JavaScript capturados; capturas inspecionadas em `.local/parte3-*.png` |

## Cobertura dos testes de planejamento

- Datas no fuso da operação e conversão do prazo para UTC.
- Edição exclusiva de rotina por responsável verificado e restrição por vínculo/ID.
- Revisão de rotina impede sobrescrita com dados desatualizados.
- Geração idempotente, inclusive reenvios simultâneos, e ausência de prazo inventado quando não há configuração.
- Confirmação de ida sem confirmar a volta e resposta expressa de não uso.
- Preservação de previsões, versões de rotina e prazos após mudanças de configuração.
- Sem previsão distinguido de cancelamento e confirmação como exceção por data.
- Motivo obrigatório no instante do limite; pedido mantém estado vigente até a decisão.
- Aceite exclusivo do transporte vinculado; escola não decide em seu nome.
- Recusa e retirada preservam a situação anterior; reenvio não duplica pedidos pendentes.
- Bloqueio de alteração/aceite para previsão bloqueada, como contrato da futura integração com viagens.
- Revogação do vínculo familiar impede consulta e aceite de pedido do solicitante revogado.
- Datas passadas somente para consulta; falta de resposta não vira cancelamento após o prazo.

Os testes usam relógio controlado para os limites, sem depender do horário em que são executados. A concorrência HTTP é exercitada sobre o PGlite que serializa suas transações; a integração real do fluxo também foi executada com o PostgreSQL do Compose. O bloqueio foi validado por preparação da previsão no teste, pois ainda não existem viagens/embarques reais no código.

## Dados deixados pelo teste da interface

Em 22/10/2026, a ida de Sofia ficou com uso confirmado após pedido tardio aceito pelo motorista; a volta permaneceu pendente e independente. Para 23/10/2026, as duas previsões foram geradas sem resposta, para facilitar o teste manual. A alteração temporária do domingo na rotina foi restaurada. Nenhum envio externo foi realizado.

## Aceite ainda necessário

Execute `teste-parte-3.md`. As propostas D-01/D-02/D-12 permanecem descritas em `parte-3.md`; não foram convertidas em decisões operacionais aprovadas. O teste em celular físico/iOS continua pendente. Viagens e bloqueio integrado a embarque dependem das Partes 4/5; não houve antecipação dessas etapas.

## Ajuste visual da agenda — 22/10/2026

Calendário mensal e cartões compactos aplicados ao painel e ao aplicativo, seguindo a referência enviada. Os detalhes e ações de cada trecho abrem ao tocar no cartão. As regras do backend permanecem as mesmas.

- TypeScript do painel e do aplicativo: aprovado.
- Build de produção Next.js: aprovado.
- Exportação Android pelo Expo: aprovada, 621 módulos.
- Edge/Playwright: navegação entre meses, fevereiro de 2028 com 29 dias, seleção de dias adjacentes, retorno a Hoje, abertura dos detalhes e ações, opções de planejamento e resumo diário aprovados.
- Nova geração da data existente preservou os IDs dos dois trechos, sem duplicação.
- Layout conferido em 1440 px e 390 px; ausência de rolagem horizontal também verificada em 320 px. Nenhum erro JavaScript capturado. Capturas em `.local/agenda-*.png`.
- A validação visual do aplicativo em aparelho físico continua pendente.
