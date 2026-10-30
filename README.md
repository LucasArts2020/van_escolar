# Caminho · Transporte escolar

Implementação incremental em TypeScript. **Partes 1 a 10 implementadas para teste local.** A Parte 10 integra os fluxos, a preparação por perfil, testes reproduzíveis e diagnóstico protegido. Consulte `docs/teste-parte-10.md`. **Uso real não liberado:** faltam homologação do usuário, decisões operacionais e validação dos canais/aparelhos reais.

Rodada de urgências: [resolução e confirmação de ciência](docs/urgencias-resolucao-ciencia.md), com requisitos visíveis, comprovante e ciência separada para novas resoluções críticas.

Agenda familiar: [confirmação simplificada](docs/agenda-confirmacao-simples.md), com escolha de ida/volta e um botão principal por criança, transporte e data.

Meu dia: [resumo para preparar a viagem](docs/meu-dia-preparacao-resumo.md), com pendências, quem vai, quem não vai e situações a conferir antes da preparação.

## Stack

Entrega atual para teste: **Meu dia do motorista e coerência das informações**, na web e no Expo, com confirmação individual em abas de Embarque/Desembarque, preparação contextual e conferência física separada. Veja [o roteiro desta rodada](docs/simplificacao-motorista.md). A [Central escolar integrada](docs/simplificacao-escola.md) continua disponível. Os novos layouts de responsável e gestão ficam para as próximas rodadas, após teste do usuário. A [atualização visual](docs/atualizacao-visual.md) unifica os estilos e simplifica a apresentação das telas existentes.

- `apps/api`: NestJS, PostgreSQL, sessões opacas revogáveis, auditoria transacional e caixa de saída com BullMQ.
- `apps/web`: Next.js App Router e React, painel em português.
- `apps/mobile`: React Native com Expo, sessões no Expo SecureStore e integração com Expo Notifications.
- `compose.yaml`: PostgreSQL 16 e Redis 7 persistente, no perfil `alerts`. A central interna funciona sem push; o envio externo exige configuração de EAS/FCM/APNs e aparelho autorizado.

## Executar no Windows

Requisitos: Node.js 22+ e Docker Desktop em execução (contêineres Linux).

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
docker compose --profile alerts up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A API escuta na porta 3001. O painel encaminha `/api` para a API; cookies de sessão são HttpOnly e não ficam no armazenamento do navegador.

### Contas fictícias

Todas começam com a senha `Caminho@2026!`. O seed é idempotente e **não restaura senhas alteradas**.

| E-mail                 | Acesso inicial                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| escola@demo.local      | Escola Horizonte, operação, coordenação e gestão de equipe                                  |
| operacao@demo.local    | Escola Horizonte, apenas operação                                                           |
| motorista@demo.local   | Transporte Boa Viagem, motorista                                                            |
| responsavel@demo.local | Contexto familiar e vínculo de operação com Escola Horizonte, para testar troca de contexto |
| outraescola@demo.local | Escola Ipê, coordenação e gestão de equipe                                                  |

Os vínculos do seed são fictícios e não substituem verificação de identidade ou vínculo familiar. Na Parte 2, o seed acrescenta Sofia (associação ativa e vínculo familiar demo de Ana), Lucas (pedido pendente do transporte para a escola), outra Sofia isolada na Escola Ipê e Van 01. Reexecutar o seed preserva as decisões já tomadas sobre esses vínculos.

Na Parte 3, o seed acrescenta a rotina demo de Sofia (segunda a sexta, ida e volta) e limite demonstrativo de 18:00 no fuso de São Paulo para Boa Viagem. Rotinas e limites existentes não são sobrescritos. A geração de previsões continua sob demanda.

Na Parte 4, as viagens são preparadas pelo motorista com as previsões de cada data/trecho. Não há seed de viagens iniciadas ou embarques. A migração acrescenta viagens, participações e histórico de atribuições, preservando os dados anteriores.

Na Parte 5, cada criança tem embarque e desembarque com duas confirmações independentes. Autor, perfil, horário e atribuição são preservados. Desembarque sem embarque validado abre ocorrência de sequência incompleta, sem fabricar eventos anteriores. Não há seed de confirmações: utilize as contas de cada lado para testar.

Na Parte 6, a visão geral do responsável mostra a situação dos filhos. **Notificações** abre a central, a linha do tempo e a movimentação correta. Eventos e mensagens são gravados junto à confirmação; o backend processa a fila com deduplicação, tentativas e recibos. Ler uma mensagem não confirma uma entrega. Push está desabilitado por padrão: veja `docs/parte-6.md` para configurar o envio real e `docs/teste-parte-6.md` para o roteiro manual.

Na Parte 7, **Alertas e ocorrências / Alertas** acompanha gravidade e atendimento separadamente. O usuário escolheu 5 / 10 / 15 minutos; o transporte registra esses intervalos na tela, e cada caso preserva a configuração capturada e a origem. Críticos de desembarque vão à coordenação na escola ou ao responsável em casa; cobranças continuam limitadas ao lado faltante. Relatos de risco são imediatos e preservam os fatos. Contato, verificação e encerramento do acompanhamento têm autor e histórico; não há resolução excepcional. Veja `docs/parte-7.md` e `docs/teste-parte-7.md`.

Na Parte 8, **Viagens e passageiros / Viagens** apresenta o resumo final e a conferência física da van. O motorista designado verifica interior, bancos e locais ocultos e registra o resultado. Só há conclusão com todas as crianças contabilizadas, nenhuma ocorrência aberta e van declarada vazia. O término com pendência gera crítico imediato e mantém alertas e confirmações ativos. Ausência individual sem movimentação exige motivo; registros posteriores não concluem automaticamente. Nova conferência é necessária. Motorista e veículo ficam reservados até a conclusão. Veja `docs/parte-8.md`, `docs/teste-parte-8.md` e `docs/validacao-parte-8.md`.

Na Parte 9, **Histórico e correções / Histórico** filtra registros por criança, viagem e data. O autor solicita correção da própria confirmação; a coordenação da escola decide com motivo, contatos e verificações, conforme a autoridade escolhida pelo usuário. Resoluções excepcionais são registros separados, sem fabricar confirmações; a entrega exige recebedor já autorizado e a viagem continua exigindo conferência final. Correções ou relatos de risco posteriores colocam uma conclusão sob revisão e invalidam a vigência de exceções anteriores. A interface distingue contabilização excepcional de dupla confirmação normal. Veja `docs/parte-9.md`, `docs/teste-parte-9.md` e `docs/validacao-parte-9.md`.

Na Parte 10, **Preparação para operação / Preparação** reúne cuidados por perfil, indisponibilidade e decisões D-01 a D-12. `npm run test:integration` valida PostgreSQL e Redis em namespace exclusivo; `npm run ops:check` consulta o diagnóstico protegido. Veja `docs/parte-10.md`, `docs/operacao-parte-10.md` e `docs/validacao-parte-10.md`.

### Aplicativo Expo

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
# Edite EXPO_PUBLIC_API_URL com o IPv4 deste computador, obtido por ipconfig.
npm run dev:mobile
```

Celular e computador precisam estar na mesma rede Wi-Fi. Permita as portas 3001 e do Expo no firewall da rede privada se necessário. Em emulador Android, use `http://10.0.2.2:3001`. No celular, `localhost` aponta para o próprio celular. Use uma versão de Expo Go compatível com o SDK deste projeto ou um development build. O app usa SecureStore em Android/iOS; o painel é a interface para navegadores.

Há início e perfil específicos de motorista e responsável, seleção de contexto, recuperação, aceite de convite, cadastros, planejamento e viagens com dupla confirmação. No aplicativo, motorista usa Cadastros e responsável usa Filhos; ambos acessam Planejamento e Viagens. As confirmações ficam dentro dos detalhes de cada criança na viagem. Para testar links no app, copie o valor de `token=` do link exibido pelo terminal e cole no campo correspondente. O mesmo link abre diretamente no painel web. Um convite familiar aceito ainda exige verificação pela organização detentora do cadastro.

### Convites e recuperação no teste local

`DEV_DELIVERY=console` imprime o link **somente no terminal da API** com o aviso `ENTREGA LOCAL — NÃO É E-MAIL`. Não retorna tokens ao solicitante pela API. Convites expiram em 48 horas; recuperação em 30 minutos. Tokens são armazenados como hash e consumidos uma única vez. Recuperar a senha revoga todas as sessões.

Não existe serviço de e-mail configurado. Em produção o adaptador local rejeita essas ações, sem anunciar envio. Integrar o canal real antes de disponibilizar acesso real. Tempos de sessão/convite/recuperação e gestão inicial de equipe são propostas técnicas da Parte 1, documentadas em `docs/parte-1.md`.

## Verificação

```powershell
npm run test
npm run typecheck
npm run build
```

Os testes HTTP executam NestJS e SQL PostgreSQL em PGlite isolado em memória. Não usam o banco de demonstração. Os arquivos executam em sequência; as tarefas de compilação WebAssembly e o pool V8 são limitados para reduzir consumo de memória. Movimentações, notificações, alertas e histórico usam o ambiente de teste previsto no limitador HTTP; histórico e integração têm aplicações e bases próprias. A integração também é reproduzível com PostgreSQL e Redis reais em namespace de QA isolado. Veja `docs/teste-parte-10.md` para os comandos e roteiro atual.

## Limite desta entrega

Contas, organizações, alunos, associações, convites, verificação de responsáveis, motoristas, veículos, rotina semanal, planejamento diário, viagens, dupla confirmação, notificações, alertas graduais, acompanhamento de ocorrências, conferência final, histórico, correções e contabilização excepcional estão integrados. A Parte 10 acrescenta preparação por perfil, testes completos e diagnóstico de manutenção. O isolamento cobre filhos e alunos por vínculo e perfil, inclusive antes do aceite e após inativação. Não há rastreamento. Pessoas alternativas autorizadas a receber continuam condicionadas à decisão D-08.

O sistema não está liberado para operação real. A entrega atual é a Parte 10 para teste local. Decisões D pendentes permanecem registradas; procedimentos e limites estão em `docs/parte-2.md` a `docs/parte-10.md` e `docs/operacao-parte-10.md`. Os tempos de alerta escolhidos são 5 / 10 / 15 minutos; a coordenação da escola foi autorizada a aprovar correções e resolver exceções com motivo e verificações. D-05/D-06/D-07 continuam explícitos: não se inventam destinatários críticos gerais de embarque, alternativas ou paradas sem registro. A política de push/tentativas é proposta para D-04, sem credenciais reais configuradas. Convites/recuperação só têm entrega no console local. Não há fila offline, exportação ou exclusão automática; D-10/D-11 ainda exigem definição operacional. O limite demo do planejamento é 18:00 em America/Sao_Paulo; geração sob demanda. Fila e escalonamento funcionam no backend. Iniciar viagem não informa embarque; confirmar recebimento ou resolver atendimento não conclui a viagem. A conclusão exige conferência física e contabilização integral, identificando exceções. Diagnóstico saudável e exportação Expo não substituem homologação, treinamento ou canais reais verificados.
