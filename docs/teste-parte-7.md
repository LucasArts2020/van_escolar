# Teste da Parte 7

Abra [o painel](http://localhost:3000). As contas demo começam com `Caminho@2026!`; senhas já alteradas são preservadas. Use uma viagem aberta de hoje com Sofia e destinação revisada conforme a Parte 4.

## Intervalos e pessoa correta

1. Entre como `motorista@demo.local`, abra **Alertas e ocorrências → Intervalos da operação**, confira **5 / 10 / 15** e salve. A primeira configuração considera o horário original das pendências existentes. Alterar a política posteriormente não muda o prazo de um caso já aberto.
2. Na viagem, registre só o embarque do motorista. A família deve visualizar a pendência desde esse primeiro registro.
3. Após 5 minutos, aparece **Lembrete** para o responsável que falta confirmar. Após 10, **Atenção**; após 15, **Crítico**. No embarque, o detalhe avisa que o destinatário crítico de D-05 ainda não está definido.
4. Assuma o acompanhamento, marque uma notificação como lida e alterne telas. O horário de origem permanece igual. O atendimento pode estar **Em atendimento** enquanto a gravidade continua aumentando.
5. Confirme pela conta do responsável. A pendência comum passa a resolvida por confirmação normal. Não deve continuar cobrando o responsável.
6. Inverta a ordem numa movimentação posterior: responsável confirma primeiro. O lembrete restante deve cobrar o motorista.

Para um teste mais curto, o transporte pode configurar temporariamente 1 / 2 / 3 minutos **antes de gerar uma nova pendência**. Isso não altera casos já abertos. Restaure 5 / 10 / 15 depois do teste.

## Crítico na escola e coordenação

1. Faça a ida com embarque validado. Entre como `operacao@demo.local` e confirme primeiro o recebimento de Sofia na escola.
2. Deixe faltar o desembarque do motorista. Ao atingir o crítico, `escola@demo.local` recebe acompanhamento na **Central da coordenação**. A operação comum não pode assumir o crítico em nome da coordenação.
3. A família acompanha a atualização, sem receber cobrança para confirmar pela escola ou repetir um ato já realizado. O motorista faltante continua sendo cobrado.
4. Confirme o desembarque pelo motorista. A pendência comum se resolve, conservando autores e histórico.

Na volta, com recebimento em casa informado pelo responsável e sem confirmação do motorista, o responsável recebe o crítico como acompanhamento; a confirmação pendente continua sendo a do motorista.

## Sequência incompleta e evidências

1. Em uma participação de teste, registre desembarque antes de validar o embarque. Haverá a ocorrência original e o acompanhamento de **Sequência incompleta**, inicialmente em Atenção.
2. Pela coordenação, assuma e registre **Contato realizado** e **Verificação física realizada**, descrevendo fatos de teste. As anotações, sozinhas, não liberam o encerramento.
3. Registre os quatro atos reais pelas contas corretas. A entrega pode ficar validada, mas a sequência incompleta continua em acompanhamento.
4. Pela coordenação, atualize o caso. Com contato, verificação, embarque e entrega validados, escreva a nota de encerramento e use **Encerrar atendimento verificado**.
5. A ocorrência passa a resolvida com histórico. Nenhuma confirmação desaparece e a viagem continua aberta. Operação comum e família não podem usar esse encerramento da escola.

## Relato de risco

Na criança de uma viagem aberta, expanda **Relatar criança não localizada ou recebimento contestado**, selecione o tipo/evento e descreva o fato. O caso aparece imediatamente como crítico, sem esperar os intervalos.

Se o recebimento já estava validado, os registros originais continuam visíveis e aparece **Recebimento sob verificação**. Ler ou assumir não remove esse estado. Encerramento exige os fatos e a autoridade descritos em `parte-7.md`; não existe resolução excepcional nesta entrega.

Use somente dados fictícios para experimentar. A funcionalidade de relato registra um fato no sistema; não executa ligação ou acionamento externo.

## Persistência e escopo

- Feche o navegador/celular mantendo backend, PostgreSQL e Redis em execução. Ao voltar, a origem e o nível devem refletir o tempo transcorrido.
- Troque o motorista de uma viagem aberta. O novo motorista deve receber o alerta vigente quando a reconciliação reavaliar os destinatários, sem reiniciar o prazo.
- Se não houver coordenação ativa, o caso informa ausência de destinatário crítico. Nenhuma escola, pessoa ou serviço alternativo é escolhido automaticamente.
- Outra escola/família não deve consultar ou tratar o caso conhecendo seu ID.
- A central funciona sem push real. O envio externo continua dependendo da configuração Expo da Parte 6.

Pare nesta etapa. A conferência final e o encerramento da viagem serão testados na Parte 8.
