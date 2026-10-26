# Roteiro de teste — Parte 5

Atualize [http://localhost:3000](http://localhost:3000). Use as contas demo existentes; a senha inicial é `Caminho@2026!`, sem restaurar senhas que você alterou. As viagens de teste anteriores foram preservadas.

## 1. Preparação

1. Entre como Motorista e abra **Viagens e passageiros** na data de hoje.
2. Abra a viagem Planejada deixada na Parte 4, ou prepare outra com uma previsão livre de Sofia. Ida e volta são independentes.
3. Se Sofia estiver em Definir destinação, registre um motivo e inclua para transporte. Inicie a viagem pelo motorista designado.
4. Início não registra embarque. O cartão da criança mostra Aguardando embarque e as duas etapas sem confirmação.

Uma viagem ainda não iniciada apenas mostra os lados e orienta aguardar o início. Uma criança marcada Não transportada precisa de revisão pelo transporte antes de receber movimentações. Não há botão para concluir viagens nesta etapa.

## 2. Volta: escola → transporte → família

1. Como Motorista, confirme **Embarque** somente para Sofia. Confira Embarque informado, Possivelmente a bordo e Falta: Escola.
2. Entre como Gestão da escola ou Operação, abra a mesma data, **Volta**, viagem e criança. Use **Confirmar entrega ao motorista**.
3. Volte ao motorista e clique **Atualizar viagens**. O embarque fica validado por duas pessoas, com nomes e horários.
4. Entre como Responsável no contexto familiar de Ana e abra essa volta. Use **Confirmar que recebi a criança** no desembarque.
5. Enquanto falta o motorista, a entrega continua pendente e o estado é Desembarque informado. A família não precisa confirmar novamente.
6. Como Motorista, atualize e use **Confirmar desembarque**. A entrega passa a validada e a indicação Possivelmente a bordo desaparece.
7. A viagem continua Em andamento. A conferência final e o encerramento serão implementados na Parte 8.

## 3. Ida: família → transporte → escola

Use uma viagem de ida com motorista e veículo livres. Uma viagem em andamento ainda ocupa seus recursos, mesmo após a entrega; não existe encerramento antecipado para liberar outra viagem. Se necessário, utilize outro motorista e veículo cadastrados ou execute os cenários em etapas separadas.

1. Como Responsável, use **Confirmar que entreguei a criança** no embarque em casa.
2. Como motorista designado, atualize e confirme Embarque. Os dois lados validam o embarque.
3. Como escola, confirme **Recebimento na escola** antes do motorista.
4. Como motorista, atualize: a entrega continua pendente, faltando sua confirmação. Confirme Desembarque para validar.
5. Escola não pode confirmar o embarque em casa; família não confirma o recebimento na escola. O backend também rejeita essas tentativas por IDs.

## 4. Sequência incompleta

1. Em outra participação sem embarque validado, registre primeiro o desembarque pelo lado permitido.
2. Confira a ocorrência de sequência incompleta. O sistema deve mostrar o recebimento informado sem criar embarque anterior.
3. Confirme pelo outro lado do desembarque. A entrega pode ficar validada, mas a ocorrência permanece aberta para revisão.
4. Se o embarque for confirmado depois, os registros reais aparecem e a ocorrência anterior continua visível. Não existe resolução automática ou botão para apagar a ocorrência nesta etapa.

## 5. Reenvios, autoria e proteção

1. Atualize ou reabra a viagem depois de confirmar. O autor e o horário original permanecem, sem nova confirmação no mesmo lado.
2. Duas pessoas da escola ou dois responsáveis não fornecem o lado do motorista. A segunda pessoa da mesma parte deve ver quem já confirmou.
3. A mesma conta com perfis de motorista e responsável não consegue confirmar pelos dois lados. Esse caso e os cliques simultâneos foram exercitados na suíte HTTP/SQL.
4. Depois de Embarque informado, tentar registrar ausência deve ser impedido. A rotina semanal pode ser alterada para datas futuras sem apagar o movimento já registrado.
5. Se substituir motorista/veículo, os autores e atribuições anteriores permanecem. O motorista anterior deixa de registrar novas movimentações pela operação.
6. Outra escola ou responsável sem vínculo não consulta nem confirma a criança, mesmo conhecendo seus IDs.

## 6. Aplicativo

Use a configuração de IP/Expo do README. Em **Viagens → detalhes → criança**, motorista e responsável veem as mesmas etapas, lados, autores e horários do painel. A confirmação só aparece registrada após resposta da API. Use **Atualizar viagens** para carregar ações de outra pessoa.

Não há envio real de notificações, funcionamento offline ou atualização automática nesta parte. O teste em aparelho físico/iOS continua pendente.
