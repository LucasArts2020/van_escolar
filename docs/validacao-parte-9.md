# Validação da Parte 9 — 26/10/2026

## Verificações concluídas

- **116 testes aprovados, nenhum erro**, na execução completa de `npm test`. Treze cenários novos ficam na suíte isolada de histórico, com base e aplicação próprias; os limites HTTP da aplicação foram preservados.
- `npm run typecheck`: API, web e aplicativo aprovados.
- `npm run build`: compilação NestJS e build de produção Next.js aprovados.
- Exportação Android Expo aprovada: **706 módulos**, bundle Hermes de aproximadamente **1,9 MB**. A exportação não substitui APK instalado nem teste em aparelho físico.
- API local responde com `stage: 9`; painel responde HTTP 200 após o build.
- Migração da Parte 9 aplicada ao PostgreSQL local, preservando os dados anteriores.

## Regras conferidas

Foram verificados os filtros por criança, viagem e data, os limites do intervalo e o isolamento por família/escola/transporte. A mudança de nome em um cadastro não duplica a criança no filtro nem altera os nomes capturados em viagens anteriores.

Somente o autor solicita correção. Solicitações repetidas preservam um pedido, uma ocorrência e a confirmação original. Os dois autores da mesma movimentação podem apresentar solicitações independentes. Aprovação/rejeição exige coordenação da escola correspondente, motivo, contatos e verificações; decisões concorrentes não se sobrescrevem. Revogar coordenação ou vínculos impede ações e consultas indevidas, conservando os registros.

Contabilização excepcional foi verificada com confirmações ausentes ou corrigidas. O procedimento exige declaração de verificação física, evidências e recebedor ativo da escola na ida ou responsável verificado na volta. Não transportada não substitui uma confirmação vigente. Não são criadas confirmações em nome de outra parte; a atualização à família recebe o título específico **Contabilização excepcional**, sem cobrança ou anúncio de dupla confirmação.

Uma exceção vigente impede a recriação automática das pendências já tratadas. Novo relato de risco invalida sua vigência e preserva a resolução anterior. Após a conclusão excepcional, um responsável sem confirmação própria ainda pode contestar o recebimento: a viagem entra em revisão e exige nova verificação.

Correções de viagens concluídas preservam a hora anterior e as inspeções, colocam a conclusão sob revisão e exigem nova conferência física após tratamento. A revisão histórica não ocupa recursos físicos de outra viagem atual. As telas distinguem conclusão/contabilização excepcional dos fatos normais de dupla confirmação.

## PostgreSQL, Redis e navegador

O navegador de QA usou API temporária em `127.0.0.1:3002`, schema PostgreSQL `qa_part9_bc03cf0b2feb462c` e prefixo Redis exclusivo. As chamadas da interface foram encaminhadas à base isolada. Cadastros e viagens do usuário não foram usados para os cenários; push externo permaneceu desabilitado.

Com Edge automatizado, passaram:

1. Solicitação pelo próprio motorista em uma viagem já concluída, preservando as quatro confirmações originais.
2. Operação comum sem autoridade para decidir e coordenação aprovando com evidências.
3. Contabilização excepcional após a decisão, com pessoa autorizada identificada.
4. Reinício do worker com PostgreSQL/Redis reais, conservando a resolução vigente e os acompanhamentos encerrados.
5. Nova conferência do motorista e identificação visual da conclusão com contabilização excepcional.
6. Família solicitando correção de sua própria confirmação, sem permissão de aprovação.
7. Falha de rede simulada no envio: a interface apresenta erro e não anuncia sucesso; a base permanece inalterada. Após restabelecer a comunicação, o reenvio persiste uma única solicitação.
8. Novo fato invalidando a vigência da exceção anterior, sem apagar seu histórico.
9. Configurações e procedimento de indisponibilidade limitados ao contexto atual.

Capturas foram inspecionadas em **1440, 390 e 320 pixels**. Um campo que excedia a largura no celular foi corrigido; a repetição passou sem rolagem horizontal ou erro JavaScript funcional observado.

## Migração repetida e limpeza

O SQL completo de migração foi reaplicado à base de QA já contendo dados da Parte 9. Antes e depois permaneceram **quatro confirmações, duas correções, uma contabilização excepcional e duas inspeções**, comprovando compatibilidade com os novos estados e tipos de eventos.

O encerramento da API de QA removeu seu schema e seus jobs. O arquivo de controle registra `closed: true`. Scripts auxiliares, capturas e relatórios ficam em `.local/`, ignorado pelo Git; endpoints de controle não fazem parte da aplicação entregue.

## Limites

Falta o teste interativo do usuário. D-10/D-11 ainda exigem procedimento operacional de contingência/sincronização, retenção e exportação; essas funções não foram presumidas. Adultos alternativos continuam condicionados a D-08. A autoridade de coordenação desta etapa foi aprovada expressamente pelo usuário. Integração final e preparação para operação permanecem na Parte 10.
