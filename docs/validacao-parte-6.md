# Validação da Parte 6 — 22/10/2026

## Verificações executadas

- **79 testes HTTP/SQL aprovados**, cobrindo as etapas anteriores e os novos casos de notificações: estado informado/validado, autor correto, isolamento, revogação, leitura independente, rollback da caixa de saída, reenvio idempotente, tentativas limitadas, supressão de cobranças antigas, troca de conta, token inválido e recibo desconhecido.
- TypeScript verificado nos três aplicativos. Build de produção do backend e Next.js concluído.
- Exportação Android concluída com **699 módulos** e bundle Hermes de aproximadamente 1,8 MB. Isso valida o empacotamento; não substitui um build nativo nem um teste em aparelho físico.
- Migração idempotente aplicada ao PostgreSQL local, preservando cadastros, previsões, viagens e confirmações existentes. PostgreSQL e Redis do Compose saudáveis.

## PostgreSQL e Redis reais

Os cenários foram executados em schemas `qa_part6_<identificador>` separados do schema público. A API temporária escutou apenas em `127.0.0.1:3002`. Os testes de navegador encaminharam suas chamadas para essa API isolada, mantendo os dados de demonstração do usuário intactos.

Confirmações concorrentes dos dois lados, reenvios, quatro autores/registros válidos por participação completa e preservação da viagem em andamento foram conferidos com PostgreSQL real.

O teste de fila utilizou BullMQ/Redis reais e namespace próprio de QA. A fila foi pausada com jobs persistidos, o worker foi encerrado e recriado, e o processamento retomou os registros. Na rodada final, **sete notificações únicas** foram aceitas pelo adaptador de teste; uma falha transitória produziu uma tentativa adicional. Sete recibos foram persistidos, sem novos envios após o aceite. A deduplicação por evento/aparelho evitou repetir mensagens de uma pessoa com contexto familiar e escolar.

O adaptador externo foi substituído por uma implementação isolada de teste. **Nenhum push foi enviado ao Expo ou a um aparelho real.** As tentativas, tickets e recibos desse cenário são dados de QA e não comprovam entrega física.

## Navegador

Fluxo completo conferido com Edge automatizado:

1. Motorista registra o embarque; início da família mostra Sofia, estado informado e falta do responsável.
2. A família confirma pela tela de acompanhamento; linha do tempo registra os dois lados.
3. A central conserva a mensagem inicial e mostra o estado atual validado, sem cobrar repetição.
4. Marcar como lida não cria confirmação adicional.
5. Desembarque informado aparece para a família como atualização; a confirmação é cobrada da escola.
6. A escola confirma pelo detalhe da notificação; a família acompanha a entrega validada.
7. O link com notificação/contexto abre a criança e o evento certos.

Capturas em 1440 e 390 pixels foram inspecionadas. Larguras de **390 e 320 pixels sem rolagem horizontal**, e nenhum erro JavaScript observado. Os horários e nomes da linha do tempo foram conferidos visualmente.

## Limitações verificadas

Push real ainda requer projeto EAS, credenciais FCM/APNs, build e aparelho configurados. `EXPO_PUSH_ENABLED` permanece desabilitado no ambiente local. Central, leitura, linha do tempo, autorizações e confirmações funcionam sem esse envio externo.

Alertas por tempo/gravidade, encaminhamento crítico e resolução de ocorrências continuam na Parte 7. Conferência física e encerramento continuam na Parte 8. A etapa foi interrompida para o teste do usuário antes de avançar.
