import type { Journey } from "./notifications";
export const alertLevels = ["Pendência", "Lembrete", "Atenção", "Crítico"];
export const alertKinds: Record<string, string> = {
  CONFIRMATION_PENDING: "Confirmação pendente",
  SEQUENCE_INCOMPLETE: "Sequência incompleta",
  NOT_LOCATED: "Criança não localizada",
  RECEIPT_DISPUTED: "Recebimento contestado",
  ROUTE_END_PENDING: "Contabilização pendente no encerramento",
  CORRECTION_CONFLICT: "Confirmação em correção",
};
export const alertStatuses: Record<string, string> = {
  OPEN: "Aberta",
  IN_REVIEW: "Em atendimento",
  RESOLVED: "Resolvida",
};
export const alertRoutes: Record<string, string> = {
  NOT_REQUIRED: "Encaminhamento crítico ainda não necessário",
  ASSIGNED: "Destinatário crítico definido conforme o trecho e a ocorrência",
  UNDEFINED_BOARDING:
    "D-05 pendente: destinatário crítico de embarque na ida não definido",
  NO_CRITICAL_RECIPIENT:
    "Encaminhamento crítico incompleto: falta destinatário ativo previsto para a ocorrência.",
};
export type AlertItem = {
  id: string;
  kind: string;
  status: string;
  level: number;
  version: number;
  student_name: string;
  trip_id: string;
  passenger_id: string;
  movement_kind: "BOARDING" | "ALIGHTING";
  direction: string;
  service_date: string;
  timezone: string;
  origin_at: string;
  next_due_at: string | null;
  routing_status: string;
  policy_snapshot: {
    reminder_minutes: number;
    attention_minutes: number;
    critical_minutes: number;
    revision: number;
  } | null;
  assignedName: string | null;
  report_note: string | null;
  resolution_note: string | null;
  missingRoles: string[];
  resolved_at?: string | null;
  resolution_kind?: string | null;
  resolution?: {
    event_id: string;
    actor_name: string;
    occurred_at: string;
  } | null;
  receipt?: ResolutionReceipt | null;
  actions: {
    requirements?: { id: string; label: string; met: boolean }[];
    resolutionMode?: string;
    canAssume: boolean;
    canRecord: boolean;
    canResolve: boolean;
    resolutionExplanation: string;
  };
};
export type AlertOptions = {
  canConfigure: boolean;
  policy: null | {
    reminder_minutes: number;
    attention_minutes: number;
    critical_minutes: number;
    revision: number;
  };
  proposal: {
    reminderMinutes: number;
    attentionMinutes: number;
    criticalMinutes: number;
  };
};
export type AlertDetail = {
  alert: AlertItem;
  journey: Journey;
  history: {
    id: string;
    type: string;
    actor_name: string;
    occurred_at: string;
    details: {
      note?: string;
      level?: number;
      previousLevel?: number;
      resolutionKind?: string;
    };
  }[];
};
export const alertEventLabels: Record<string, string> = {
  CREATED: "Ocorrência registrada",
  LEVEL_REACHED: "Gravidade atualizada",
  REPORTED: "Relato de risco",
  ASSUMED: "Atendimento assumido",
  CONTACT: "Contato registrado",
  VERIFICATION: "Verificação física registrada",
  RESOLVED: "Atendimento encerrado",
};

export type ResolutionReceipt = {
  eventId: string;
  missingRoles: string[];
  pendingCount: number;
  canAcknowledge: boolean;
  recipients: {
    name: string;
    roles: string[];
    acknowledgedAt: string | null;
    revokedAt: string | null;
    isMe: boolean;
  }[];
};
export const resolutionKinds: Record<string, string> = {
  NORMAL_CONFIRMATIONS: "Confirmações presenciais",
  NORMAL_ACCOUNTING: "Contabilização por confirmações presenciais",
  VERIFIED_FOLLOW_UP: "Atendimento verificado",
  VERIFIED_ABSENCE: "Ausência verificada",
  EXCEPTIONAL_ACCOUNTING: "Contabilização excepcional",
  CORRECTION_REJECTED: "Correção rejeitada",
};
