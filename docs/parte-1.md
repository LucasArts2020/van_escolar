# Parte 1 — Contas, perfis e permissões

Status histórico: Parte 1 entregue e avanço autorizado pelo usuário. Consulte o README e `parte-3.md` para a etapa atual.

## Escopo

Login/logout, sessão revogável de 12 horas, recuperação de acesso, convites à equipe, cadastro via convite, edição do nome, contextos autorizados, equipe da escola, permissão adicional de coordenação e auditoria. O painel atende os três perfis para testar a base; o app possui início distinto por perfil, perfil e contextos.

RN-01: contas individuais; RN-02/03: consulta e alteração de organizações/equipes restritas pelo vínculo ativo no servidor; RN-33: autor e horário dos registros. A verificação envolvendo alunos depende da Parte 2.

## Propostas técnicas desta etapa

- `SCHOOL` é o perfil da escola; `coordinator` é uma permissão adicional. Coordenação não concede gestão da equipe automaticamente.
- `manage_team` permite convidar funcionários, conceder/remover coordenação, inativar/reativar vínculos e consultar auditoria da escola. A concessão inicial desta permissão está restrita ao seed local; não há endpoint público de autoatribuição. A autoridade definitiva depende da definição operacional em D-08/D-09.
- Convites desta etapa são somente para funcionários da escola. Convites de responsáveis e validação de vínculo com criança pertencem à Parte 2 e a D-08. Convite não atribui coordenação nem gestão.
- Usuários já existentes precisam informar sua senha atual ao aceitar convite. O convite não troca a senha de uma conta existente. Convite emitido por gestor cujo vínculo deixou de ser autorizado é rejeitado.
- O e-mail identifica a conta; alteração de e-mail aguarda fluxo de verificação. Nome pode ser editado com auditoria.
- Sessão de 12 horas, convite de 48 horas, recuperação de 30 minutos. São parâmetros técnicos propostos para desenvolvimento, sem definir os prazos operacionais D-01/D-03/D-07.
- Contexto familiar do seed serve para demonstrar troca de perfil. Não comprova vínculo com criança nem libera dados de alunos.
- Apenas entrega local pelo terminal. Expo Notifications e BullMQ serão implementados no estágio apropriado. Canais reais e política de tentativas ainda dependem de D-04; a escolha de Expo Notifications pelo usuário já define o canal push do aplicativo.

## Segurança aplicada

Senhas com scrypt e salt aleatório; tokens aleatórios de 256 bits armazenados como SHA-256; cookies HttpOnly/SameSite Strict no navegador e bearer no app com SecureStore. Produção ativa Secure nos cookies e precisa de HTTPS. Limite de 30 requisições por minuto por IP e endpoint (configuração inicial para instância única; rever proxy/limite distribuído antes de escalar).

Guardas consultam a sessão e o vínculo ativo a cada acesso. `X-Context-Id` seleciona um vínculo, sem criar autorização. Permissões nunca vêm do corpo do login. IDs de membros são consultados junto com o escopo da escola. Consultas SQL parametrizadas, validação de entrada e bloqueio de origens externas em mutações. Eventos persistidos usam transações com auditoria. Inativação preserva vínculos e registros.

Sem GPS, mapas, alunos ou viagens nesta etapa. Auditoria atual cobre ações persistidas, não é uma trilha de todas as leituras. A proteção contra alteração pelo próprio administrador do banco e as definições de retenção/exportação dependem da preparação operacional e D-11.

## Referências técnicas

- [Next.js — instalação](https://nextjs.org/docs/app/getting-started/installation)
- [NestJS — autenticação](https://docs.nestjs.com/security/authentication)
- [Expo — SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
