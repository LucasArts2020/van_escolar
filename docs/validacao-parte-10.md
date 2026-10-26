# Validação da Parte 10 — 26/10/2026

## Testes automatizados

- `npm test`: **130 aprovados, zero falhas, zero ignorados**. Inclui os 116 testes anteriores e 14 cenários integrados/diagnóstico novos.
- `npm run test:integration` com PostgreSQL/Redis reais e `QA_BACKUP_DRILL=true`: **16 aprovados, zero falhas, zero ignorados**. Executa os mesmos 14 cenários e acrescenta persistência/reinício de worker e backup/restauração.
- `npm run typecheck`: API, painel e aplicativo aprovados.
- `npm run build`: API NestJS e build de produção Next.js aprovados. Após o build, painel HTTP 200 e API com `status: ok`, `stage: 10`.
- Exportação Android Expo aprovada: **708 módulos**, bundle Hermes de aproximadamente **1,9 MB**. A verificação de tipos mobile foi repetida após atualizar a identificação da etapa. Não houve instalação em aparelho nem envio externo.

A integração real final utilizou schema `qa_part10_ef63ca43387a4fd4`, prefixo Redis exclusivo e dados fictícios. No encerramento, o schema e a fila próprios foram removidos. Os cadastros/viagens do usuário não foram usados nos testes.

## Fluxos e falhas

Ida e volta foram verificadas desde rotina semanal e planejamento confirmado no dia anterior, com dupla confirmação pelas partes corretas, notificações internas, inspeção e histórico dos três perfis.

Os testes verificam falta de uma confirmação, evolução em 5/10/15, cobranças para quem falta agir, ausência das duas sem inferir parada, coordenação como destinatária do crítico escolar e família como destinatária no desembarque em casa. A entrega permanece pendente quando falta um lado; van vazia não elimina a ocorrência.

Cliques simultâneos/repetidos e replay após resposta perdida preservam unicidade, autores e eventos. Falha do provedor registra três tentativas e estado de falha sem validar movimentação. O adaptador de falha é explícito e não envia push externo.

Correção após conclusão preserva confirmações e inspeção anterior, exige coordenação e evidências, diferencia exceção de dupla confirmação e exige nova inspeção. Troca de IDs, escola alheia e revogação de vínculo são negadas.

O diagnóstico exige credencial de manutenção independente de sessão escolar. Falha de banco/Redis, fila pausada, heartbeat vencido e recuperação foram verificados. Dados de conexão, tokens e informações individuais não aparecem nas respostas. Readiness retorna 503 quando degradado; o diagnóstico continua observável com estado explícito.

## Persistência e recuperação

Com BullMQ/Redis reais, uma tarefa adiada permanece após encerrar e recriar a instância do worker. Escalonamento mantém a origem e não duplica notificações. Pausa e retomada da fila alteram o diagnóstico sem modificar a contabilização da criança. O Redis compartilhado não foi reiniciado nem limpo globalmente.

O ensaio de `pg_dump` exportou somente o schema de QA recém-criado, restaurou em outro schema temporário e comparou contagens das **32 tabelas**. Confirmações, correções, resoluções excepcionais, inspeções e auditoria também passaram por comparação de conteúdo. O destino temporário foi removido. Esse ensaio não define frequência, retenção ou armazenamento de backup do ambiente real.

## Navegador e ambiente local

Edge automatizado aprovou a preparação para motorista, responsável e escola em **1440, 390 e 320 pixels**, com as doze decisões, orientações por perfil, atalhos funcionais e sem overflow horizontal ou erro JavaScript observado. O guia previamente carregado permanece legível sem conexão; não há fila offline de confirmações. Capturas de desktop e celular foram inspecionadas.

No ambiente local, `ops:check` encontrou banco/worker/fila saudáveis, sem jobs falhos ou atrasados, e push desabilitado. A saída de atenção 2 foi esperada e preserva `NOT_RELEASED`. A credencial local foi gerada no `.env` ignorado pelo Git, sem ser exibida nem enviada à interface.

Relatórios de execução e capturas ficam em `.local/parte10-*`, ignorados pelo Git. As suítes e os comandos reproduzíveis fazem parte do projeto.

## Limites e pendências de liberação

Faltam a homologação interativa do usuário, instalação/teste em aparelhos físicos, push e e-mail reais, destinatários/plantão, procedimentos operacionais aprovados, treinamento e preparação do ambiente hospedado. As decisões pendentes estão na tela de preparação e nos documentos da etapa. Nenhum resultado automatizado aprova essas definições.

**Parte 10 entregue para teste local; uso real não liberado.**
