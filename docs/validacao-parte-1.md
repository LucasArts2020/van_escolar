# Validação da Parte 1 — 22/10/2026

Implementação limitada à Parte 1. A Parte 2 depende do teste e retorno do usuário.

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| `npm ci --omit=optional --no-audit --no-fund` | Instalação limpa concluída; lockfile gerado a partir dos manifests, sem caminhos locais de resolução |
| `npm test` | 12 testes HTTP passando em NestJS + SQL PostgreSQL no PGlite isolado |
| `npm run typecheck` | API, painel e aplicativo aprovados |
| `npm run db:migrate` e `npm run db:seed` | Executados no PostgreSQL 16 do Docker Compose |
| `GET http://localhost:3001/health` | Respondeu `status: ok`, consultando o PostgreSQL local |
| `npm run build` | Backend e painel compilados |
| `npx expo install --check` | Dependências compatíveis com o Expo SDK 58 |
| `npx expo export --platform android` | Bundle Android gerado, 618 módulos |
| Navegador Edge via Playwright | Login da escola e do responsável, equipe, abertura/fechamento de convite, perfil, troca de contexto e logout aprovados; nenhum erro JavaScript capturado |
| Largura 390 px | Sem transbordamento horizontal; saída da conta disponível |

Após os ajustes na versão estreita do painel, o teste no navegador e o build web foram executados novamente com sucesso. As capturas inspecionadas estão na pasta local ignorada `.local/`.

## Cobertura dos 12 testes

Sessão obrigatória, cookies HttpOnly, proteção contra origem externa, isolamento de escolas, contexto alheio recusado para motorista/responsável, rejeição de permissões forjadas, IDs de membros fora do escopo, coordenação separada de gestão, revogação de vínculo, convite restrito e de uso único, recuperação de senha com revogação de sessões, autoria/auditoria e logout revogável/idempotente.

## Validações que ainda cabem ao usuário

- Teste de uso e aceite conforme `teste-parte-1.md`.
- Execução em um celular Android/iOS real; foi validado o bundle Android, sem teste em dispositivo físico ou build nativo iOS.
- Revisão das propostas técnicas em `parte-1.md`; as decisões operacionais pendentes dos documentos de referência permanecem pendentes.

Os links de convite e recuperação são entregues ao terminal local da API, sem envio real de e-mail. Cadastros de alunos, vínculos com crianças, viagens, notificações e alertas ainda não estão implementados.
