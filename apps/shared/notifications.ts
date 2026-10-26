import type { Movement, Passenger, Trip } from "./trips";
export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  purpose: string;
  pending: boolean;
  studentName: string;
  timezone: string;
  target: {
    tripId: string;
    passengerId: string;
    movementId: string;
    kind: "BOARDING" | "ALIGHTING";
    date: string;
    direction: string;
    alertId?: string | null;
  };
  pushNote: string;
  deliveries: {
    id: string;
    status: string;
    attempts: number;
    receipt_attempts: number;
    accepted_at: string | null;
    finished_at: string | null;
    error_code: string | null;
  }[];
};
export type Inbox = {
  items: NotificationItem[];
  unread: number;
  hasMore: boolean;
};
export type Journey = {
  trip: Trip;
  passenger: Passenger;
  timeline: { id: string; title: string; body: string; at: string }[];
  notification?: NotificationItem;
  attempts?: {
    delivery_id: string;
    phase: string;
    attempt: number;
    status: string;
    error_code: string | null;
    created_at: string;
  }[];
};
export type ChildrenHome = {
  children: {
    id: string;
    name: string;
    current: null | {
      tripId: string;
      passengerId: string;
      date: string;
      direction: string;
      state: string;
      possiblyOnboard: boolean;
      openIssues: number;
      deliveryUnderReview?: boolean;
      movements: Movement[];
      tripStatus: string;
    };
  }[];
};
export const pushLabels: Record<string, string> = {
  OTHER_CONTEXT: "Mesmo evento já encaminhado em outro contexto seu",
  DEVICES: "Estado por aparelho",
  WAITING: "Aguardando processamento",
  DISABLED: "Push não habilitado no servidor",
  NO_DEVICE: "Nenhum aparelho habilitado",
  QUEUED: "Na fila de envio",
  RETRY: "Nova tentativa agendada",
  ACCEPTED: "Recebido pelo Expo; aguardando recibo",
  PROVIDER_ACCEPTED: "Aceito pelo serviço do aparelho",
  FAILED: "Falha de envio",
  SUPPRESSED: "Envio dispensado após reavaliação",
  RECEIPT_UNKNOWN: "Sem confirmação do provedor",
};
export function shortDate(value: string) {
  return value.split("-").reverse().join("/");
}
