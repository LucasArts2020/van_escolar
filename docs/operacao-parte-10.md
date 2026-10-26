# Manutenção e preparação da operação

Este é um roteiro técnico local. Contato de plantão, canal de contingência, responsáveis e critérios de liberação ainda precisam ser preenchidos e aprovados para a operação real. Não cria um procedimento operacional aprovado por si só.

## Antes dos testes

1. Inicie PostgreSQL e Redis: `docker compose --profile alerts up -d postgres redis`.
2. Aplique `npm run db:migrate`; preserve o volume existente. Use seed somente em demonstração.
3. Inicie `npm run dev`; confira `/health` na porta 3001 e o painel na 3000.
4. Execute `npm run ops:check`. O comando usa credencial do backend, sem colocá-la em URL ou na interface. Não compartilhe o `.env`.

Para uma nova instalação, gere `OPERATIONS_TOKEN` aleatório (mínimo 32 caracteres, recomendado 32 bytes aleatórios em hexadecimal), coloque-o apenas no backend e no coletor de manutenção. Nunca use prefixos `NEXT_PUBLIC_` ou `EXPO_PUBLIC_`. Reinicie a API ao mudar o segredo. Para consulta remota, configure `OPERATIONS_API_URL` com HTTPS. O script recusa HTTP remoto e redirecionamentos, para preservar a credencial. A implantação também deve restringir acesso de rede aos endpoints de manutenção.

## Diagnóstico

| Saída de `ops:check` | Significado                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                    | Dependências saudáveis e nenhum indicador técnico de atenção nas contagens consultadas; não libera uso real.                                          |
| 1                    | Diagnóstico inacessível, credencial inválida ou dependências degradadas.                                                                              |
| 2                    | Dependências acessíveis, mas há push desabilitado, aparelho ausente, falhas, recibos desconhecidos, jobs falhos ou alertas vencidos/sem destinatário. |

O npm pode imprimir “script failed” para saídas 1/2; leia o diagnóstico e o código, não interprete saída 2 como perda de dados. O JSON não contém dados individuais. A verificação não envia notificações nem resolve ocorrências.

Banco indisponível: conferir serviço, rede, credenciais e espaço em disco. Não reinicializar volume para recuperar acesso. Fila indisponível/pausada ou heartbeat vencido: conferir processo API/worker e Redis; restabelecer o processamento preservando PostgreSQL e AOF. O worker recupera a caixa de saída e reavalia pendências. Reiniciar não substitui inspeção física nem encerra ocorrências.

Falha de envio/recibo desconhecido: a central e a ocorrência continuam sendo a referência de acompanhamento; conferir o aparelho, autorização, sessão e configuração Expo. Aceite do provedor não prova leitura. Contadores de falhas são históricos; não apague tentativas para fazer o indicador voltar a zero. A política atual não oferece reenvio administrativo indiscriminado.

Alertas sem destinatário: revisar vínculos/equipe ativos e a definição operacional aplicável. Na rodada da central escolar, o usuário definiu coordenação da própria escola e motorista designado para críticos de embarque na volta. Embarques na ida continuam com D-05 pendente; não escolher uma pessoa substituta sem autorização. Sem coordenação ativa, o encaminhamento fica incompleto. Ocorrências sem resposta continuam condicionadas a D-06. Não silenciar uma falha operacional apenas reiniciando a API.

Para monitoramento contínuo, a equipe deverá integrar os endpoints protegidos ao seu coletor e definir quem recebe as falhas e em quanto tempo atende. Nenhum agendamento externo ou mensagem foi criado nesta entrega.

## Backup e restauração

O teste opcional de integração faz dump **somente do schema fictício que acabou de criar**, restaura em outro schema aleatório e compara contagens de todas as tabelas e conteúdo de confirmações, correções, exceções, inspeções e auditoria. Remove ambos os schemas e a fila de QA ao terminar. Isso comprova o caminho técnico local, não uma política de backup de produção.

Antes do piloto, definir e testar no ambiente escolhido: responsável, frequência, retenção, criptografia, armazenamento fora do host, controle de acesso e tempo aceitável para recuperação. Backup deve incluir PostgreSQL e a configuração/segredos por canal protegido; a estratégia de Redis deve preservar o AOF e considerar a recuperação a partir do PostgreSQL. Não expor dumps pelo painel ou tratá-los como exportação autorizada do histórico.

Restaurar primeiro em ambiente isolado e conferir contagens, histórico, permissões e reprocessamento sem envio externo. Em restauração, iniciar com `EXPO_PUSH_ENABLED=false` até revisão da equipe para evitar notificações antigas inesperadas. Não restaurar por cima da base ativa durante o teste do usuário.

## Registro antes da liberação

| Item                                            | Situação desta entrega                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Fluxos integrados e teste técnico               | Implementados; evidências em `validacao-parte-10.md`.       |
| Teste interativo do usuário                     | Pendente.                                                   |
| Decisões operacionais D-01 a D-12               | Escolhas parciais registradas; demais definições pendentes. |
| Canais, destinatários reais e plantão           | Pendentes.                                                  |
| E-mail de convite/recuperação                   | Somente console local; indisponível em produção.            |
| Aplicativo instalado e push real                | Pendentes; exportação Expo não substitui aparelho físico.   |
| Treinamento e inspeção presencial               | Pendentes.                                                  |
| Hospedagem/HTTPS/segredos/monitoramento externo | A definir.                                                  |
| Backup do ambiente real e restauração           | A definir e testar; ensaio local disponível.                |

**Uso real não liberado.** Uma futura liberação deve registrar responsáveis, data, evidências e delimitações aprovadas. Este documento não atribui essa aprovação a nenhum participante.
