# Atualização visual — outubro de 2026

Rodada de design para teste local, sem mudanças nas regras de negócio.

## O que mudou

- Identidade visual unificada em verde, com melhor contraste, tipografia maior e superfícies consistentes.
- Menu lateral no computador; navegação inferior de três entradas para escola e motorista no navegador móvel.
- Cabeçalhos diretos, acesso ao perfil e troca de contexto no topo.
- Meu dia: data e atalhos juntos, pendências e viagens anteriores lado a lado no computador, cartões com identificação e situação mais claras.
- Central: filtros legíveis em telas pequenas, contadores e ação individual destacados.
- Família: filhos e pendências preservados em primeiro plano, atalho para Agenda e informações de conta recolhidas em detalhes.
- Expo: tema compartilhado aplicado ao cabeçalho, Meu dia e Central, com controles e estados visuais consistentes.
- Foco de teclado, link para pular ao conteúdo e respeito à preferência de movimento reduzido.

## Como testar

1. Abra http://localhost:3000 e entre com as contas de demonstração de motorista, escola e responsável.
2. No motorista, abra uma viagem e alterne manualmente Embarque/Desembarque. Verifique busca, detalhes e retorno.
3. Na Central, alterne recebimento/entrega e use data, busca e transporte. Em telas estreitas, a data e o transporte ocupam linhas próprias.
4. Na família, abra Conta e acesso para consultar as informações secundárias.
5. Reduza a janela e use o menu inferior da escola/motorista. Percorra os controles com Tab.

A confirmação continua individual e depende da autorização do servidor. Revisões, exceções e ocorrências permanecem separadas. Nenhuma confirmação em lote ou fila offline foi acrescentada.

## Validação

- Verificação de tipos nos três projetos e build Next.js.
- Exportação Android do Expo; validação visual em aparelho físico permanece pendente.
- Navegador em 320, 390, 768 e 1440 px, incluindo os três perfis, viagem do motorista e Mais.
- Regressão do fluxo de confirmação em base PostgreSQL de QA isolada; os dados de demonstração do usuário não são usados para confirmações de teste.

Esta rodada deve ser testada pelo usuário antes de avançar para novas mudanças de fluxo.

Resultados desta rodada: 28 combinações de tela/largura verificadas, sem rolagem horizontal ou erros de JavaScript; botões visíveis com pelo menos 44 px. A regressão de 60 crianças passou, incluindo duplo clique, resposta perdida, resposta atrasada, estabilidade da linha, retorno contextual e revogação de acesso. O ambiente temporário de QA foi removido após o teste.
