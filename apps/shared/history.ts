import type { Passenger } from "./trips";
export type HistoryOptions = {
  today: string;
  students: { id: string; name: string }[];
  operations: {
    transport_id: string;
    name: string;
    timezone: string;
    cutoff_time: string | null;
    reminder_minutes: number | null;
    attention_minutes: number | null;
    critical_minutes: number | null;
  }[];
  canConfigure: boolean;
  canReview: boolean;
  exceptionalAuthority: string;
  offlineProcedure: string;
  retention: string;
};
export type HistoryItem = {
  id: string;
  student_id: string;
  student_name: string;
  school_name: string;
  trip_id: string;
  service_date: string;
  direction: string;
  status: string;
  timezone: string;
  vehicle_name: string;
  pending_corrections: number;
  exceptional: boolean;
};
export type HistoryPage = {
  items: HistoryItem[];
  hasMore: boolean;
  nextOffset: number;
  serverNow?: string;
};
export type Correction = {
  id: string;
  confirmation_id: string;
  reason: string;
  account: string;
  created_at: string;
  actor_name: string;
  status: string;
  version: number;
  decision_actor_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  contacts: string | null;
  verification: string | null;
};
export type ExceptionalResolution = {
  id: string;
  actor_name: string;
  created_at: string;
  reason: string;
  contacts: string;
  verification: string;
  outcome: string;
  recipient_name: string | null;
  safety_revision: number;
  current: boolean;
};
export type HistoryDetail = {
  passenger: Passenger;
  trip: {
    id: string;
    service_date: string;
    direction: string;
    status: string;
    version: number;
    timezone: string;
    vehicle_name: string;
    driver_name: string;
    started_at: string | null;
    completed_at: string | null;
    review_opened_at: string | null;
  };
  confirmations: {
    id: string;
    actor_name: string;
    side: string;
    role: string;
    kind: string;
    received_at: string;
    assignment_id: string;
    canRequestCorrection: boolean;
  }[];
  corrections: Correction[];
  alerts: {
    id: string;
    kind: string;
    status: string;
    level: number;
    origin_at: string;
    resolved_at: string | null;
    resolution_kind: string | null;
    resolution_note: string | null;
  }[];
  alertHistory: {
    id: string;
    case_id: string;
    type: string;
    actor_name: string;
    occurred_at: string;
    details: {
      note?: string;
      contacts?: string;
      verification?: string;
      resolutionKind?: string;
    };
  }[];
  resolutions: ExceptionalResolution[];
  inspections: {
    id: string;
    actor_name: string;
    inspected_at: string;
    van_empty: boolean;
    result: string;
    trip_version: number;
  }[];
  assignments: {
    id: string;
    driver_name: string;
    vehicle_name: string;
    vehicle_plate: string;
    created_at: string;
  }[];
  canReview: boolean;
  canResolveException: boolean;
  recipients: { id: string; name: string; role: string }[];
};
export const correctionLabels: Record<string, string> = {
  PENDING: "Aguardando coordenação",
  APPROVED: "Correção aprovada — registro original preservado",
  REJECTED: "Correção rejeitada — confirmação original mantida",
};
export const resolutionLabels: Record<string, string> = {
  EXCEPTIONAL_ACCOUNTING: "Contabilização excepcional",
  NORMAL_CONFIRMATIONS: "Dupla confirmação normal",
  NORMAL_ACCOUNTING: "Contabilização pelas confirmações",
  VERIFIED_ABSENCE: "Ausência individual verificada",
  VERIFIED_FOLLOW_UP: "Acompanhamento verificado",
  CORRECTION_REJECTED: "Solicitação de correção rejeitada",
};
export const historyTime = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
export function historyEvents(d: HistoryDetail) {
  return [
    ...d.confirmations.map((c) => ({
      id: c.id,
      at: c.received_at,
      title:
        (c.kind === "BOARDING" ? "Embarque" : "Desembarque") + " registrado",
      body: c.actor_name + " · " + c.role + " · registro original " + c.id,
    })),
    ...d.corrections.flatMap((c) => [
      {
        id: c.id,
        at: c.created_at,
        title: "Correção solicitada",
        body:
          c.actor_name +
          " · confirmação original " +
          c.confirmation_id +
          " · " +
          c.reason,
      },
      ...(c.decided_at
        ? [
            {
              id: c.id + "-decision",
              at: c.decided_at,
              title: correctionLabels[c.status],
              body: c.decision_actor_name + " · " + c.decision_reason,
            },
          ]
        : []),
    ]),
    ...d.alertHistory.map((e) => ({
      id: e.id,
      at: e.occurred_at,
      title:
        e.type === "RESOLVED"
          ? resolutionLabels[e.details.resolutionKind || ""] ||
            "Ocorrência resolvida"
          : "Ocorrência · " + e.type,
      body: e.actor_name + (e.details.note ? " · " + e.details.note : ""),
    })),
    ...d.resolutions.map((e) => ({
      id: e.id,
      at: e.created_at,
      title:
        "Contabilização excepcional" + (e.current ? " vigente" : " anterior"),
      body: e.actor_name + " · " + e.reason,
    })),
    ...d.inspections.map((i) => ({
      id: i.id,
      at: i.inspected_at,
      title: "Conferência física · " + i.result,
      body:
        i.actor_name +
        (i.van_empty
          ? " · van declarada vazia"
          : " · segurança não assegurada"),
    })),
    ...d.assignments.map((a) => ({
      id: a.id,
      at: a.created_at,
      title: "Atribuição de motorista e veículo",
      body: a.driver_name + " · " + a.vehicle_name + " · " + a.vehicle_plate,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
