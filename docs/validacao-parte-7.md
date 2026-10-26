# Validação da Parte 7 — 23/10/2026

## Verificações

- **92 testes HTTP/SQL aprovados** em PGlite isolado, incluindo todas as etapas anteriores e os casos de alertas.
- TypeScript dos três aplicativos verificado; build de produção NestJS e Next.js concluído.
- Exportação Android concluída: **702 módulos**, bundle Hermes de aproximadamente **1,9 MB**. Não substitui build nativo e teste em aparelho físico.
- Migração idempotente da Parte 7 aplicada ao PostgreSQL local, preservando dados anteriores.

## Casos automatizados

Foram conferidos: configuração por transporte e revisão, intervalos crescentes, 5/10/15 desde o primeiro registro, independência entre leitura/atendimento e gravidade, reenvio sem reiniciar prazo, preservação da política capturada, deduplicação dos níveis e corrida entre vencimento e confirmação.

Os testes também cobrem crítico encaminhado à coordenação na escola e ao responsável em casa, cobrança apenas do motorista quando a outra parte já agiu, ausência de coordenação sem destinatário alternativo, reencaminhamento após habilitar coordenação e troca de motorista sem redefinir origem.

Sequência incompleta não se resolve com leitura, contato ou verificação isolados. Encerramento exige confirmações reais, contato, verificação e autoridade. Relatos de risco são críticos imediatos, idempotentes e preservam fatos anteriores; recebimento contestado mantém verificação pendente, inclusive quando os registros originais já indicavam entrega validada. Escopo, vínculos revogados, concorrência de atendimento e impossibilidade de fabricar confirmações foram conferidos.

## PostgreSQL, Redis e navegador

Foi criada uma API de QA em `127.0.0.1:3002`, em schema `qa_part7_<identificador>` separado do schema público. Jobs BullMQ usaram prefixo exclusivo da mesma execução. O navegador encaminhou as chamadas da interface para essa API, mantendo cadastros e viagens do usuário intactos.

Dois jobs atrasados de reavaliação ficaram persistidos no Redis. O worker foi encerrado e recriado, conservando os identificadores dos jobs. Os níveis 5/10/15 foram verificados com **relógio controlado somente na API temporária de QA**, sem esperar quinze minutos reais nem modificar o relógio do sistema. A origem permaneceu a mesma. Os endpoints auxiliares de QA ficam apenas em arquivos ignorados de teste, fora da aplicação entregue.

Com Edge automatizado, foram conferidos:

1. Operação comum visualiza o caso e não assume o crítico da coordenação.
2. Coordenação assume, registra contato e verificação física, sem resolução prematura.
3. As contas corretas completam as quatro confirmações; a pendência comum fecha e a sequência permanece em atendimento.
4. Coordenação encerra o acompanhamento com evidências e nota, preservando a ocorrência e o histórico das confirmações.
5. Família registra recebimento contestado pela interface; o novo caso é crítico, mantém os quatro registros anteriores e apresenta recebimento sob verificação.
6. Link de ocorrência abre o detalhe sujeito à sessão/contexto atuais.

Capturas em desktop e celular foram inspecionadas. **390 e 320 pixels sem rolagem horizontal**, com nenhum erro JavaScript funcional observado. Campos ficam bloqueados durante salvamento para evitar perda de uma anotação digitada antes de a anterior terminar de persistir.

## Limites

Nenhum push externo ou contato real foi enviado. A central e o escalonamento foram testados com PostgreSQL/Redis reais; o envio físico continua condicionado à configuração Expo da Parte 6. Evidências de contato/verificação usadas nos cenários são fictícias e pertencem somente ao QA.

D-05, D-06 e D-07 permanecem explícitos, sem destinatários críticos de embarque inventados, contingências automáticas ou inferência de parada sem registros. Resoluções excepcionais continuam indisponíveis. A viagem não é concluída por confirmar entrega ou encerrar acompanhamento. A Parte 8 permanece aguardando o teste do usuário.
