# Urgências: resolução e ciência

A ocorrência e a ciência da resolução são informações separadas. Confirmar ciência não registra embarque, entrega ou conferência da van e não bloqueia o encerramento da viagem.

## Teste na web e no Expo

1. Abra uma ocorrência em **Mais → Pendências e ocorrências** ou pelo atalho da criança.
2. Confira os requisitos em **Resolver urgência**. Para atendimento verificado, registre o contato e a verificação física em campos independentes; a justificativa da resolução é outro campo.
3. A coordenação da escola ou o motorista designado, conforme a regra já existente, resolve quando o servidor autorizar. Pendências comuns continuam sendo encerradas pelas confirmações necessárias; correções e exceções seguem pelo histórico da criança.
4. Confira o comprovante: autor, data, justificativa e forma de resolução.
5. Para uma ocorrência que atingiu nível crítico e foi resolvida após esta atualização, entre com outra parte envolvida. Use o atalho **Ciências de urgências pendentes** ou o filtro **Aguardando minha ciência**.
6. Toque em **Confirmar ciência da resolução**. Ler a mensagem não executa essa ação.

O motorista designado, os responsáveis verificados e a coordenação da escola recebem a solicitação conforme o acesso vigente no instante da resolução. Uma pessoa recebe uma solicitação por resolução, mesmo que tenha mais de um contexto. O autor já consta como ciente quando for destinatário. Quem perder o acesso tem a pendência dispensada, com histórico preservado; a solicitação não é transferida nem reativada silenciosamente.

Resoluções antigas continuam disponíveis, sem avisos retroativos. Ocorrências comuns não geram ciência adicional. Ausência de destinatário é indicada no comprovante.

## Contratos

- `POST /alerts/:id/resolution-acknowledgements`, com `{ resolutionEventId }`: idempotente, autor/contexto da sessão e resposta com `receipt` atualizado.
- Detalhe com requisitos e modo de resolução, comprovante e destinatários/ciências.
- `GET /alerts?awaitingAcknowledgement=true` e contador `pendingCount` separado das ocorrências abertas.
- Projeção `pendingAcknowledgements` em Meu dia, Central da escola e início da família.
- Migração aditiva em `schema.sql`, aplicada por `npm run db:migrate`; preserva registros históricos. Destinatários e notificações são criados na mesma transação da resolução.

A atualização mantém a autoridade já definida e não libera o sistema para operação real. Teste em aparelho físico e homologação continuam necessários.

## Validação desta entrega

- 165 testes da suíte passaram, incluindo seis regressões de resolução e ciência; após o ajuste final de encaminhamento, as seis regressões específicas passaram novamente.
- 16 integrações com PostgreSQL/Redis passaram; backup e restauração isolada verificaram 34 tabelas.
- Tipos, build API/Next.js e exportação Android do Expo passaram. Teste em aparelho físico permanece pendente.
- Navegador: resolução pela coordenação com campos separados, atalho familiar, ciência com resposta perdida e duplo clique, retorno ao filtro e layouts de 320/390/1440 px; controles de pelo menos 44 px, sem erros JavaScript ou rolagem horizontal.
- Confirmação de ciência pelo motorista usando teclado (Enter) passou.
- Dados de QA em schema/filas próprios foram removidos após a verificação.
