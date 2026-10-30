# Agenda: uma confirmação por criança e data

A Agenda familiar reúne ida e volta em um cartão por criança, transporte e data. A família escolhe **Ida e volta**, **Só ida**, **Só volta** ou **Não utilizará** e usa um único botão principal para registrar sua escolha.

- As situações vigentes de ida e volta ficam sempre visíveis.
- Sugestões da rotina só se tornam respostas após confirmação explícita. Sem sugestão ou resposta, nenhuma ausência é presumida.
- Após o prazo, o botão envia solicitação ao transporte com motivo. O uso vigente permanece até a decisão autorizada.
- Trechos bloqueados pela operação, datas passadas e pedidos em análise continuam respeitando suas restrições. Um trecho disponível pode ser alterado sem modificar o outro bloqueado.
- Pedidos e retirada por trecho ficam em detalhes, sem duplicar os botões principais de confirmação.
- A rotina semanal continua independente das respostas por data.

O endpoint compatível `POST /planning/day/respond` recebe uma ou duas escolhas `{id,use,expectedVersion}` da mesma criança, vínculo e data, com motivo opcional antes do prazo. As respostas são gravadas na mesma transação; conflito em um trecho desfaz o conjunto. O contrato individual anterior continua disponível. Isso se aplica ao planejamento familiar, sem criar confirmação presencial em lote.

Validação: 20 testes de planejamento passaram, incluindo dupla resposta, ida/volta independentes, replay, conflito de versão, prazo, bloqueio e revogação. Tipos, build e exportação Android passaram. O navegador foi verificado em 320, 390 e 1440 px, com envio único no duplo clique e confirmação por teclado. O teste Expo em aparelho físico permanece pendente.

Também foi esclarecido o bloqueio de início em Meu dia: participação em revisão aparece identificada, com explicação e atalho para revisar. Nenhuma decisão de transporte ou motivo foi preenchido automaticamente. As 19 regressões de viagens e Meu dia passaram.
