# Parte 8 — Conferência final e encerramento

Implementação para teste local das RN-29 a RN-32, com crítico imediato na tentativa de encerramento com contabilização pendente (RN-24). A Parte 9 permanece pendente.

## Fluxo entregue

Em **Viagens e passageiros**, uma viagem iniciada apresenta o resumo final, as crianças com pendências e a conferência física. O aplicativo Expo oferece o mesmo fluxo em **Viagens**.

O motorista designado declara, individualmente, que percorreu o interior, verificou os bancos e os espaços entre eles e verificou locais onde uma criança poderia ficar oculta. Deve selecionar se a van está vazia. Se houver criança a bordo ou a segurança não estiver assegurada, é obrigatória uma observação com pelo menos dez caracteres.

O servidor recebe a declaração e verifica os fatos na mesma transação. Só conclui se todas as participações ativas tiverem quatro confirmações reais (duas de embarque e duas de desembarque) ou ausência individual expressa, sem movimentação; nenhuma ocorrência de segurança pode permanecer aberta. A conferência deve declarar van vazia.

Se qualquer requisito faltar, registra **Trajeto encerrado com ocorrência aberta**. A declaração de van vazia preserva todas as pendências. Confirmar depois ou resolver um acompanhamento não conclui automaticamente a viagem: o motorista deve fazer e registrar uma nova conferência física.

## Alertas e contabilização

Uma criança sem qualquer confirmação continua pendente. Ao terminar o trajeto, é criado o caso **Contabilização pendente no encerramento**, crítico imediato, sem fabricar confirmações. Pendências e divergências já existentes são elevadas a crítico. Mantêm-se os destinatários da Parte 7: coordenação na escola e responsável em casa para desembarque; cobranças respeitam o lado faltante e destinos não aprovados continuam explícitos.

Os alertas, a caixa de saída e as confirmações continuam ativos após o término. A reconciliação também considera casos abertos sem política de tempo, preservando a continuidade após reinício do worker. A política configurável de 5 / 10 / 15 minutos continua nas demais pendências; o crítico por encerramento independe desse prazo.

O novo caso fecha automaticamente somente com as quatro confirmações reais ou com ausência individual verificada, com motivo e sem qualquer confirmação anterior. Isso encerra a pendência de contabilização; divergências como sequência incompleta, criança não localizada e recebimento contestado mantêm seus próprios tratamentos. Contato, leitura, inspeção da van e assumir atendimento não substituem a contabilização.

Após início, o motorista designado pode registrar ausência sem movimentação, inclusive depois do término ou da meia-noite. A exceção limita-se à contabilização de viagem ainda aberta: não permite incluir passageiros, refazer planejamento ou apagar eventos de datas passadas. Vínculos inativos continuam sujeitos aos bloqueios existentes e às futuras decisões de correção.

## Autoria, concorrência e escopo

Cada conferência é uma linha preservada com autor, vínculo de acesso, atribuição do motorista/veículo, horário do servidor, resultado, observação e fotografia dos requisitos naquele momento. A aplicação não oferece edição ou exclusão desses registros. A primeira hora de término é preservada mesmo quando a conclusão ocorre depois.

Há controle de versão, chave de idempotência e bloqueio transacional de operação/viagem. Repetir a mesma requisição não cria outra conferência ou outro alerta; reutilizar a chave com conteúdo diferente é rejeitado. Uma alteração concorrente exige atualização e nova conferência.

Escola e família consultam somente suas crianças, inclusive no resumo final e nas pendências. Não registram encerramento nem recebem observações livres da inspeção. Os fatos e autores das confirmações anteriores permanecem preservados. Concluir não libera a criança para outra reserva da mesma data e trecho nem desbloqueia retroativamente o planejamento.

## Propostas limitadas para teste

Como D-09 ainda não define todas as autoridades excepcionais, a inspeção e o encerramento estão limitados ao motorista atualmente designado, com vínculo ativo. Não há substituição de confirmação por autorização excepcional nesta etapa.

Motorista e veículo permanecem reservados enquanto a viagem estiver em andamento ou com trajeto encerrado e ocorrência aberta. Ficam disponíveis para iniciar outro trecho após a conclusão. Essa é uma escolha conservadora da implementação para teste, sujeita à definição operacional futura.

Uma inspeção com segurança não assegurada impede a conclusão mesmo com todas as entregas validadas. É preservada no histórico e exige nova inspeção declarando a van vazia. Relatos individuais de criança não localizada ou recebimento contestado continuam na central de alertas.

Não há detecção de paradas por GPS, confirmação em lote, correção de autoria, conclusão automática, resolução excepcional ou destinatário alternativo inventado. Push externo permanece desabilitado sem credenciais; a central interna e o processamento persistente continuam funcionando.
