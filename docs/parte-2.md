# Parte 2 — Cadastros e vínculos

Registro histórico da entrega da Parte 2. O usuário autorizou continuar para a Parte 3; consulte `parte-3.md` para o escopo atual.

## Funcionalidades

- Alunos: cadastro, lista e detalhe com nome e nascimento opcional, sem localização.
- Associações por aluno entre escola e transporte, iniciadas por qualquer um dos dois lados. Estados: pendente, ativo, recusado e inativo.
- Escolas/transportes relacionados, derivados das solicitações de alunos; diretório de nomes/códigos das organizações para selecionar o destinatário.
- Cadastro de outra escola/operação em um contexto separado, atualização do nome da organização atual e preservação dos contextos anteriores.
- Responsáveis: convite específico para uma criança, aceite com conta individual, conferência manual do vínculo e inativação sem apagar o registro.
- Motoristas: listagem por operação, convite para a mesma operação e aceite com conta individual.
- Veículos: cadastro, listagem, inativação/reativação; escola consulta veículos somente dos transportes com associação ativa.
- Auditoria de criação, solicitação, decisão, verificação e inativação. No painel, os eventos da escola aparecem em Registro de ações.

O painel atende os três perfis. No aplicativo, motorista dispõe de alunos, solicitações, veículos, motoristas e novo contexto; responsável consulta filhos verificados e pendências de verificação. A gestão da equipe escolar continua no painel. Links de convite continuam entregues somente pelo terminal local, conforme a Parte 1.

## Propostas de procedimento para teste — D-08 e D-12 continuam pendentes

Estas escolhas dão um fluxo concreto ao protótipo; não representam critérios operacionais aprovados.

1. A organização que cria o cadastro é sua detentora. Somente ela inicia novas associações desse cadastro e gerencia seus convites familiares. A outra organização pode aceitar/recusar e ambas podem inativar a associação. Para adicionar outra organização, o detentor precisa iniciar o pedido; aceitar um vínculo não autoriza repassar acesso a terceiros.
2. Convite familiar identifica uma única criança e um único e-mail. O aceite apenas coloca o vínculo em **aguardando verificação**. Um operador ativo da organização detentora precisa registrar como conferiu o vínculo para liberar acesso. Não há integração de validação documental; a conferência é uma ação humana, com autor, horário e justificativa. A autoridade definitiva e os documentos aceitos dependem de D-08.
3. Os motoristas ativos podem cadastrar veículos e convidar colegas somente dentro da própria operação, registrando a conferência do vínculo profissional. A definição definitiva de quem administra a operação também depende de D-08. Um convite nunca muda a senha ou o nome de uma conta existente; exige sua senha atual.
4. Usuário com perfil escolar pode criar outro contexto escolar; motorista pode criar outra operação de transporte. A escola criada recebe gestão de equipe para seu criador, sem acesso aos dados de outras escolas. Este é um procedimento de cadastro para teste, sem verificação oficial de instituição ou empresa. O diretório exibe nome e código, sem alunos ou famílias; não comprova identidade institucional.
5. Possíveis duplicidades são identificadas somente no cadastro da própria organização, comparando nome sem distinção de acentos, caixa e espaços repetidos. Havendo coincidência, criar cadastro separado exige revisão expressa e justificativa. Não há união de alunos entre organizações nem busca global de crianças. Conferir data e contexto é responsabilidade do operador; a heurística não prova identidade.
6. Mudanças de escola/transporte não transferem nem removem dados automaticamente. Associações anteriores e seus eventos permanecem. D-12 ainda precisa definir o procedimento definitivo para transferências e calendários. As viagens futuras deverão registrar os vínculos autorizados usados no momento da operação.
7. Nesta etapa, dados básicos do aluno não têm edição/destruição pela interface. Correções com procedimento auditável serão tratadas na Parte 9. Não há exclusão de alunos, veículos ou vínculos.

**Pessoas alternativas autorizadas a receber não foram implementadas:** o próprio plano condiciona essa tela à definição de D-08. Convite familiar não presume autorização para um terceiro receber a criança.

## Acesso por estado

| Situação | Consulta permitida |
| --- | --- |
| Cadastro próprio sem associação | Registro administrativo da organização detentora; não representa transporte autorizado |
| Pedido pendente recebido | Resumo mínimo: nome da criança e organizações para análise; sem detalhe completo, responsáveis ou acesso operacional |
| Associação ativa | Detalhe e dados pertinentes ao contexto autorizado; destinatário consulta apenas responsáveis já verificados |
| Associação recusada/inativa | Resumo e estado históricos preservados; destinatário perde acesso ao detalhe/à operação |
| Convite familiar aceito, sem verificação | Estado da análise e organização conferente, sem dados da criança |
| Vínculo familiar verificado | Responsável consulta exclusivamente a criança vinculada à sua conta, no perfil de responsável |
| Vínculo familiar inativo | Consulta à criança recusada, sem afetar vínculos de outras crianças |

As guardas da Parte 1 continuam obrigatórias em todas as rotas de cadastro. O servidor restringe o aluno por vínculo e perfil, e valida o escopo junto com o ID. As mutações usam transações e auditoria. O aceite e a verificação familiar são serializados por criança; convites usados, expirados, cancelados ou emitidos por vínculo revogado são rejeitados.

## Dados de demonstração

- Sofia Menezes: cadastro da Escola Horizonte, associação ativa com Transporte Boa Viagem e vínculo familiar fictício pré-verificado de Ana.
- Lucas Ferreira: cadastro do transporte com solicitação pendente para a Escola Horizonte. Antes do aceite, a escola vê somente o resumo em Solicitações.
- Outra Sofia Menezes: cadastro separado na Escola Ipê, sem acesso pela Horizonte, pelo transporte ou por Ana.
- Van 01: placa ABC1D23, 15 lugares, do Transporte Boa Viagem.

Todos são dados fictícios. Eventos do seed registram `demo: true`; a pré-verificação não afirma conferência real. Reexecutar o seed não reativa os vínculos de demonstração que o usuário inativou, nem restaura senhas/nome de contas existentes.

## Integração

`npm run db:migrate` acrescenta tabelas sem remover a Parte 1. `npm run db:seed` acrescenta os exemplos acima. Redis, BullMQ e Expo Notifications continuam reservados para as Partes 6/7. Não há horários limite, rotina semanal, viagens ou notificações reais nesta entrega.
