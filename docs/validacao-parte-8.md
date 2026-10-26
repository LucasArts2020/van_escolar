# Validação da Parte 8 — 23/10/2026

## Verificações concluídas

- **103 testes aprovados, nenhum erro**, na execução completa de `npm test`. Incluem as partes anteriores e onze novos cenários de encerramento.
- `npm run typecheck`: API, web e mobile aprovados.
- `npm run build`: compilação NestJS e build de produção Next.js aprovados.
- Exportação Android Expo aprovada: **703 módulos**, bundle Hermes de aproximadamente **1,9 MB**. Não equivale a APK instalado ou teste em aparelho físico.
- Migração da Parte 8 aplicada e repetida no PostgreSQL local, sem apagar dados existentes.
- API local responde com `stage: 8`; painel local responde HTTP 200 após os builds.

## Regras e concorrência

Foram verificados encerramento sem qualquer evento, ausência de dupla confirmação de desembarque, sequência incompleta, recebimento contestado e impossibilidade de usar van vazia para apagar pendência. Os registros e autores das confirmações foram preservados.

Os testes cobrem conferência física obrigatória, observação exigida quando a segurança não está assegurada, versão vencida, contexto indevido, motorista não designado, viagem não iniciada, idempotência e duas tentativas concorrentes. Uma requisição repetida mantém uma conferência; conteúdo diferente na mesma chave é rejeitado.

Também foram conferidos: quatro confirmações sem conclusão automática; nova conferência para concluir; ausência individual sem movimentação após o término e depois da meia-noite; bloqueio de ausência após qualquer confirmação; preservação da primeira hora de término e das conferências anteriores; reservas de motorista/veículo mantidas enquanto há encerramento pendente e liberadas após conclusão; reserva da criança e bloqueio do planejamento preservados.

O resumo final de uma viagem com duas escolas foi consultado pelos três contextos interessados. Cada escola e a família receberam somente a criança autorizada e seus totais. Observações livres da inspeção não foram expostas a esses perfis. Somente o motorista designado recebeu permissão de inspeção.

## PostgreSQL, Redis e navegador

O teste da interface usou API temporária em `127.0.0.1:3002`, schema PostgreSQL exclusivo `qa_part8_973e6739d1ac4ca5` e prefixo Redis correspondente. As chamadas do navegador de QA foram encaminhadas a essa base, separada dos cadastros e viagens locais do usuário. Push externo permaneceu desabilitado.

Com Edge automatizado, foram verificados:

1. Botão bloqueado até preencher a conferência física e escolher o resultado; observação obrigatória para segurança não assegurada.
2. Encerramento com criança sem eventos resulta em trajeto aberto e crítico imediato, conservando zero confirmações.
3. Worker reiniciado com PostgreSQL e Redis reais; o caso e a viagem continuam abertos e o processamento permanece disponível.
4. Quatro confirmações reais registradas após o término resolvem a contabilização, mantendo a viagem aberta.
5. Atualização da tela exige nova conferência; o envio conclui e preserva ambas as inspeções.
6. No trecho de volta, ausência individual registrada pela interface contabiliza a criança e exige nova conferência para concluir.
7. Família consulta o resultado, sem botão de encerramento nem observação livre da inspeção.

Capturas de pendência e conclusão foram inspecionadas em **1440, 390 e 320 pixels**. Não houve rolagem horizontal ou erro JavaScript funcional observado. A exportação mobile foi validada separadamente.

O schema e os jobs temporários foram removidos pelo encerramento da API de QA; o arquivo de controle registra `closed: true`. Scripts auxiliares, capturas e exportações ficam em `.local/`, ignorado pelo Git. Os endpoints de controle de QA não fazem parte da aplicação entregue.

## Limites da entrega

Falta o teste interativo do usuário, incluindo aparelho físico se desejar validar o aplicativo nativo. A conclusão e a reserva dos recursos seguem a proposta limitada da Parte 8 documentada em `parte-8.md`. D-09, correções, resolução excepcional e histórico ampliado permanecem para a Parte 9. Nenhuma credencial ou envio real de push foi configurado nesta etapa.
