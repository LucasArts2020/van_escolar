export const operationRelease = {
  title: "Preparação para operação",
  status: "Teste local · uso real não liberado",
  explanation:
    "Os fluxos estão integrados para validação. A liberação depende de decisões operacionais aprovadas, canais reais verificados e treinamento dos participantes.",
};
export const roleChecks = {
  DRIVER: [
    "Confira data, trecho, motorista, veículo e a destinação de cada criança prevista.",
    "Registre somente a sua confirmação individual de embarque e desembarque. Confira quem ainda precisa confirmar.",
    "Ao finalizar, percorra o interior da van, bancos e áreas onde uma criança possa permanecer. Registre a conferência.",
    "Se faltar entrega ou houver divergência, mantenha o acompanhamento aberto. Resolver um atendimento exige nova conferência para concluir.",
  ],
  GUARDIAN: [
    "Confirme ida e volta do dia seguinte separadamente, respeitando o prazo exibido no planejamento.",
    "Confirme a entrega ou o recebimento presencial da sua criança. Um aviso no celular não equivale a essa confirmação.",
    "Confira as pendências no seu espaço. Se já confirmou, a outra parte deve registrar a própria ação.",
    "Em caso de recebimento contestado ou criança não localizada, registre o relato de risco para verificação imediata.",
  ],
  SCHOOL: [
    "Confira os vínculos autorizados e as viagens do dia da sua escola.",
    "Na ida, registre o recebimento presencial; na volta, a entrega ao transporte. Cada lado registra a própria confirmação.",
    "A coordenação acompanha os críticos de recebimento na escola e, junto ao motorista designado, os de embarque na volta. Ler ou assumir não encerra a pendência.",
    "Correções e contabilizações excepcionais exigem a coordenação da escola, motivo, contatos e verificações. O fato original continua no histórico.",
  ],
};
export const contingencySteps = [
  "Sem comunicação, uma ação pode não ter chegado ao servidor ou a resposta pode ter se perdido. Confira o estado atualizado antes de repetir.",
  "Não há fila offline nem sincronização automática. Um clique local não comprova entrega ou recebimento pelo sistema.",
  "Mantenha o cuidado presencial da criança e a conferência física. Não use confirmação de outra pessoa para eliminar uma pendência.",
  "O canal alternativo, a pessoa de plantão e a escalada sem resposta ainda precisam ser definidos e aprovados para a operação. Não dependa apenas do push.",
  "Após restabelecer a conexão, consulte alertas e histórico. Registros equivocados exigem correção com autoria; exceções exigem evidências e coordenação.",
];
export const operationalDecisions = [
  {
    id: "D-01",
    title: "Prazo e autoridade de configuração",
    state: "Pendente",
    detail:
      "18:00 em America/Sao_Paulo é o padrão de demonstração; configuração pelo transporte é proposta técnica.",
  },
  {
    id: "D-02",
    title: "Previsão não confirmada",
    state: "Pendente",
    detail:
      "Permanece pendente. Inclusão excepcional exige motivo; o procedimento operacional precisa ser aprovado.",
  },
  {
    id: "D-03",
    title: "Níveis de alerta",
    state: "Parcialmente decidido",
    detail:
      "5 / 10 / 15 minutos escolhidos pelo usuário. Autoridade do transporte para alterar ainda é proposta.",
  },
  {
    id: "D-04",
    title: "Canais e falhas",
    state: "Pendente",
    detail:
      "Central interna e integração Expo implementadas. Canais reais, aparelhos e política de tentativas exigem validação; push pode estar desabilitado.",
  },
  {
    id: "D-05",
    title: "Críticos de embarque",
    state: "Parcialmente decidido",
    detail:
      "Na volta, coordenação da própria escola e motorista designado aprovados pelo usuário. Na ida, destinatário crítico de embarque ainda não definido.",
  },
  {
    id: "D-06",
    title: "Sem resposta ao crítico",
    state: "Pendente",
    detail:
      "Plantão, canal alternativo e autoridade de escalada precisam de definição.",
  },
  {
    id: "D-07",
    title: "Ausência de ambas as confirmações",
    state: "Pendente",
    detail:
      "A conferência final exige contabilização. Não há detecção automática de parada sem registro nem prazo prévio aprovado.",
  },
  {
    id: "D-08",
    title: "Vínculos e recebedores",
    state: "Pendente",
    detail:
      "Vínculos verificados e duplicidades sob revisão estão implementados. Adultos alternativos não estão habilitados; critérios exigem aprovação.",
  },
  {
    id: "D-09",
    title: "Correções e exceções",
    state: "Parcialmente decidido",
    detail:
      "Coordenação da escola autorizada pelo usuário, com motivo e verificações. Autoridade de inclusão tardia pelo transporte continua proposta.",
  },
  {
    id: "D-10",
    title: "Indisponibilidade",
    state: "Pendente",
    detail:
      "Sem fila offline. Falta aprovar contato alternativo, registro de contingência e reconciliação após retorno.",
  },
  {
    id: "D-11",
    title: "Retenção e exportação",
    state: "Pendente",
    detail:
      "Histórico preservado. Prazos, exclusão e exportação precisam de definição; não há exclusão automática.",
  },
  {
    id: "D-12",
    title: "Calendário e mudança de vínculo",
    state: "Pendente",
    detail:
      "Rotina semanal e exceções por data implementadas. Feriados e mudança de escola/transporte exigem procedimento aprovado.",
  },
];
