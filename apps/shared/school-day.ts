import type { Trip } from "./trips";

export type SchoolPlanningStatus =
  | "CONFIRMED"
  | "AWAITING_RESPONSE"
  | "ROUTINE_EXPECTED"
  | "NOT_USING"
  | "NOT_EXPECTED"
  | "MISSING_CONFIGURATION"
  | "NO_HISTORICAL_PLAN";

export type SchoolDayRow = {
  /** Stable before and after a trip is prepared. Names and passenger IDs are not identities. */
  id: string;
  operating_link_id: string;
  student_id: string;
  student_name: string;
  school_id: string;
  school_name: string;
  transport_id: string;
  transport_name: string;
  direction: "OUTBOUND" | "RETURN";
  today: string;
  planning: {
    source: "PERSISTED" | "ROUTINE" | "UNAVAILABLE";
    status: SchoolPlanningStatus;
    scheduled: boolean | null;
    planId: string | null;
    version: number | null;
    deadlineAt: string | null;
    missingConfiguration: ("POLICY" | "ROUTINE")[];
    pendingChange: {
      id: string;
      requestedUsage: boolean;
      reason: string;
      requestedAt: string;
    } | null;
  };
  /** A real assigned trip only. A transport's registered vehicles are never predictions. */
  trip_id: string | null;
  passenger_id: string | null;
};

export type SchoolDayAttention = {
  openCount: number;
  criticalCount: number;
  otherDatesCount: number;
  items: {
    id: string;
    kind: string;
    level: number;
    status: string;
    date: string;
    studentName: string;
    studentId: string;
    tripId: string;
    passengerId: string;
  }[];
};

export type SchoolDay = {
  date: string;
  serverNow: string;
  today: string;
  tomorrow: string;
  rows: SchoolDayRow[];
  /** Includes only this school's authorized passengers, using the normal movement permissions. */
  trips: Trip[];
  /** Open occurrences across all dates; totals are not limited to the five preview items. */
  attention: SchoolDayAttention;
};

export const schoolPlanningLabels: Record<SchoolPlanningStatus, string> = {
  CONFIRMED: "Uso confirmado",
  AWAITING_RESPONSE: "Aguardando resposta da família",
  ROUTINE_EXPECTED: "Previsão da rotina · uso não confirmado",
  NOT_USING: "Não utilizará",
  NOT_EXPECTED: "Sem uso previsto",
  MISSING_CONFIGURATION: "Configuração pendente",
  NO_HISTORICAL_PLAN: "Sem planejamento registrado nesta data",
};
