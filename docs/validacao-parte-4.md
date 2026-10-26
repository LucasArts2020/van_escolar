# Validação — Parte 4

Executada em 22/10/2026, mantendo a entrega limitada a viagens e passageiros.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 52 testes HTTP/SQL aprovados: 40 das etapas anteriores e 12 de viagens |
| `npm run typecheck` | API, painel e aplicativo aprovados |
| `npm run build` | NestJS e Next.js aprovados |
| `expo export --platform android --max-workers 2` | Bundle Expo/Hermes gerado, 623 módulos; sem instalação de novas dependências |
| Migração PostgreSQL do Compose | Tabelas acrescentadas sem remover dados anteriores |
| `/health` | `status: ok`, `stage: 4` |
| Concorrência HTTP no PostgreSQL local | Reenvios com a mesma chave retornaram 201/201 e uma participação; duas chaves concorrentes para o mesmo trecho retornaram 201/409 |
| Cancelamento no PostgreSQL local | Reserva liberada; estado e prazo originais da previsão preservados |
| Edge / Playwright | Preparação, inclusão excepcional inicial, ausência/reinclusão, substituição e histórico, cancelamento, leitura pela escola e pela família aprovados |
| Layout | Captura desktop em 1440 px e celular em 390 px inspecionadas; sem rolagem horizontal em 390/320 px e sem erros JavaScript capturados |

A primeira execução completa da suíte encontrou falta de memória durante a compilação WebAssembly do PGlite. O comando de testes passou a limitar o pool V8 e as tarefas de compilação WebAssembly a uma, mantendo os arquivos de teste em sequência. A suíte completa passou após o ajuste. Os testes usam banco isolado; não fabricam movimentações no banco de demonstração.

## Cobertura dos testes de viagens

- Escola e responsável sem acesso a preparação/alteração; IDs de outro contexto não abrem dados.
- Reserva idempotente, versão da viagem e proteção contra duas reservas do mesmo trecho.
- Previsão sem resposta exige decisão explícita; a decisão não fabrica confirmação familiar.
- Bloqueio real do planejamento na preparação; respostas da Parte 3 são rejeitadas enquanto reservado.
- Início na data certa, somente pelo motorista designado, depois da revisão; nenhum embarque automático.
- Capacidade do veículo, incluindo passageiros em revisão; falha desfaz a transação inteira.
- Passageiros e totais filtrados em viagem com duas escolas e alunos homônimos distintos.
- Não uso expresso como Não transportada; cancelamento preserva linhas e libera outra reserva.
- Ausência proibida após embarque informado; integração exercitada preparando o estado no banco de teste, sem endpoint público de embarque.
- Substituição de veículo e motorista com histórico e autoria preservados.
- Motorista/veículo impedidos de iniciar outra viagem enquanto ocupados; motorista anterior não atua pelo substituto.
- Inclusões excepcionais posteriores e na primeira viagem, com motivo e vínculo ativo, preservando o planejamento original.
- Pedido de planejamento em análise impede reserva; motorista fora do perfil exigido e veículo indisponível não autorizam preparação.
- Vínculos diferentes da mesma criança não duplicam a reserva da mesma data/trecho.
- Inativação operacional/familiar revoga os acessos correspondentes; dados persistidos permanecem.
- Datas passadas somente para consulta; não existe endpoint de conclusão que ignore a conferência final.

## Dados deixados no ambiente local

- A **volta de 22/10/2026** foi deixada **Planejada**, com Sofia em **Definir destinação**, para o teste manual do motorista.
- O planejamento original da volta continua PENDING, sem resposta fabricada, reservado pela viagem preparada. A ida permanece independente.
- A van reserva fictícia **QAQ4A04**, com dez lugares, foi acrescentada para testar substituição.
- Viagens usadas na verificação de concorrência, inclusão e substituição foram canceladas antes do início e continuam identificadas como Canceladas, com motivos de teste e histórico preservado.
- O teste do navegador não iniciou nenhuma viagem e não registrou embarques ou entregas reais. O início e suas proteções foram exercitados na suíte HTTP/SQL isolada.
- Capturas em `.local/parte4-*.png`, resultados resumidos em `.local/parte4-qa.json` e `.local/trips-postgres-qa.json`.

## Teste do usuário

Execute `teste-parte-4.md`. O aplicativo foi verificado por TypeScript e exportação Android; o teste em aparelho físico/iOS continua pendente. D-02/D-09 continuam propostas descritas em `parte-4.md`. Movimentações, notificações, ocorrências e encerramento permanecem nas próximas etapas.
