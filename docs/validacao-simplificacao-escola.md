# Validação — simplificação da escola

Rodada escolar validada localmente em 26/10/2026. O roteiro de uso está em [simplificacao-escola.md](simplificacao-escola.md).

## Regras e integração

- Suíte completa: **151 testes passaram**, sem falhas ou testes ignorados. Inclui dez regressões da leitura escolar consolidada e três testes iniciais da materialização.
- Após eliminar pedidos repetidos de materialização, os **quatro testes específicos** desse fluxo passaram novamente. Cobrem concorrência, recuperação de falha/configuração ausente, janela por fuso e pedido único para sessenta vínculos.
- Integração com **PostgreSQL e Redis reais: 16 testes passaram**, incluindo fila persistente, reinício, prazos, concorrência, resposta perdida e restauração de backup de 32 tabelas.
- Consulta da nova Central executada também diretamente contra PostgreSQL real com 134 linhas e 61 ocorrências autorizadas. Totais de outras datas, limite da prévia e SQL das contagens verificados. O acesso do cenário foi restrito ao próprio schema de QA.

## Navegador

Cenário isolado com sessenta crianças em duas vans na ida, duas na volta, homônimos, outra escola e seis previsões adicionais. Nenhuma operação do cenário utilizou os registros de negócio do usuário.

- Sessenta confirmações com um POST individual; nenhum GET de detalhes de viagem por criança.
- Resposta perdida após commit, resposta antiga, teclado, reenvio, escola confirmando primeiro nos dois trechos, autoria e ocorrência de sequência incompleta preservados.
- Preparar uma viagem pela API do motorista manteve exatamente o mesmo elemento da linha e do botão da previsão. Sem duplicação e sem perder busca/filtro de transporte.
- Histórico abriu na criança correta; retorno preservou filtros, posição e foco. Ocorrência → histórico → ocorrência manteve o ponto original. Central oculta não consultou o serviço durante 16 segundos de observação.
- Vínculo revogado removido; dados de outra escola isolados; operador sem entradas de gestão e coordenação com os acessos previstos.
- Links anteriores de notificações/alertas continuaram prevalecendo sobre a entrada padrão.
- Agenda familiar fez um único POST de materialização ao abrir a data. Não uso existente preservado e nenhuma confirmação automática de uso. Preparação do transporte também materializou a data automaticamente.
- Larguras de 320, 390 e 1440 pixels sem transbordamento; ações de 46 a 48 pixels. Em 390 × 844, o primeiro botão ficou inteiro na tela inicial.
- Nenhum erro de JavaScript ou falha HTTP inesperada nos cenários.

## Limites

Verificação de tipos da API, web e aplicativo aprovada. Build da API e Next.js concluído; exportação Android Expo concluída com 711 módulos. Após o build, a API respondeu `status: ok` e a web respondeu HTTP 200. O retorno contextual nativo e a suspensão de consultas de alertas ocultos passaram pela checagem de tipos e pela exportação final.

Os schemas e prefixos Redis exclusivos do QA foram removidos; a checagem final encontrou zero schemas escolares temporários e zero chaves de fila escolares temporárias. Os dados do usuário foram preservados.

A exportação Expo verifica a compilação; o uso em aparelho físico e as entregas externas de push exigem teste próprio. Não houve envio real de notificações ou alteração de fatos históricos. As próximas rodadas continuam sendo motorista, responsável e gestão. Esta entrega para no teste do usuário e não libera operação real.
