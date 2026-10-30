# Validação — Meu dia e coerência

Rodada validada em 27/10/2026, a partir do estado `ca32e25`. Roteiro de uso: [simplificacao-motorista.md](simplificacao-motorista.md).

## Verificações automáticas

| Verificação | Resultado |
| --- | --- |
| Suíte completa da API | 159 testes aprovados |
| Regressões de motorista e Central escolar após ajustes compartilhados | 17 testes aprovados |
| Regressões finais de motorista, incluindo autoria e estados excepcionais | 7 testes aprovados; fazem parte dos cenários acima |
| Integração PostgreSQL/Redis | 16 testes aprovados, incluindo reinício, fila persistente e prazos de 5/10/15 minutos |
| Backup/restauração isolados | Contagens e registros preservados em 32 tabelas |
| Tipos | API, web e Expo aprovados |
| Build | NestJS e Next.js aprovados |
| Exportação Expo Android | Aprovada, 719 módulos, bundle de aproximadamente 2 MB |
| Diff | Sem erros de espaço em branco |

As regressões verificam projeção de planejamento sem rotina, configuração posterior sem reescrever o snapshot, dupla confirmação, sequência incompleta, revisão antiga ao lado de viagem recente, resumo transacional no replay, paginação além de 20 viagens, isolamento escolar e revogação de contexto/vínculo. Também verificam que uma resposta mais antiga de outra criança pode atualizar sua própria linha sem retroceder o resumo da viagem.

## Navegador com API e PostgreSQL reais

Cenário temporário com 60 crianças, homônimos, duas escolas e várias vans, em schema e namespace Redis exclusivos de QA:

- Entrada direta em Meu dia e menu de três itens. Nenhuma consulta de opções de preparação durante a execução.
- Um POST por confirmação, proteção contra duplo clique e conservação da ordem, identidade, posição e foco do botão.
- Durante a sequência de confirmações, apenas duas leituras periódicas do detalhe; nenhuma consulta de detalhe por criança.
- GET antigo entregue depois de confirmação recente sem desfazer o resultado.
- Resposta perdida após gravação conciliada por leitura, com um único POST. Falha de envio e leitura oferece verificação antes de nova tentativa.
- Histórico abre a participação correta. Retorno preserva etapa, detalhes expandidos e a lista.
- Conferência física em fluxo próprio, com releitura da viagem ao abrir.
- Área operacional oculta sem consultas periódicas durante 16 segundos; retorno retoma atualização.
- Revogação de contexto limpa os dados operacionais.
- Preparação salva abre a nova viagem diretamente em Meu dia, sem procurar novamente na lista.
- Operador escolar consulta o nome da escola; gestão autorizada pode editar.
- Larguras de 320, 390 e 1440 pixels sem rolagem horizontal, com botões de confirmação de pelo menos 44 pixels.
- Navegação com Tab/Enter e ação bloqueada sem POST quando a viagem ainda não iniciou. Nenhum erro JavaScript no cenário principal.

O processo de QA removeu seu schema e suas chaves Redis. Os registros de validação e capturas ficam em `.local/`, ignorado pelo Git. As bases de uso local não foram usadas para criar os cenários de teste.

## Limites desta validação

A exportação e os tipos do Expo foram verificados; o aplicativo ainda precisa do teste do usuário em aparelho físico. Push externo permaneceu desabilitado nos cenários. Esta rodada não altera autoridades, decisões operacionais pendentes ou a exigência de homologação antes do uso real.
