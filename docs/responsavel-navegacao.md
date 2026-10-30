# Responsável: navegação e verificação funcional

O menu principal na web e no Expo passa a ser Meus filhos, Agenda e Mais.

- Meus filhos abre o acompanhamento atual e mantém pendências anteriores visíveis.
- Agenda reúne a rotina e o uso diário por trecho.
- Mais oferece acompanhamento das viagens dos filhos, dados e vínculos, ocorrências, histórico e regras/ajuda.
- As entradas de operação do motorista não aparecem no menu familiar. Links existentes continuam aceitos.
- As autorizações continuam sendo verificadas pelo servidor. O responsável não prepara nem inicia viagens.

Teste com responsavel@demo.local. Abra Meus filhos, Agenda e Mais; confira o acompanhamento e volte aos filhos. O acesso depende de vínculo familiar verificado e ativo.

O sistema está implementado para testes locais. A homologação do usuário, o teste Expo em aparelho físico, a configuração dos canais externos e as decisões operacionais já documentadas continuam pendentes para operação real.

Validação: 84 testes passaram, sem falhas, cobrindo acesso, planejamento, confirmações, notificações, alertas e encerramento. Tipos, build web e exportação Android passaram. No navegador, os três menus familiares, acompanhamento sem preparação e Agenda foram conferidos em 320, 390 e 1440 px, sem erros de JavaScript ou rolagem horizontal.
