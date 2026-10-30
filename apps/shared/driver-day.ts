export type DriverTripCard = {
  id: string;
  service_date: string;
  direction: string;
  status: string;
  version: number;
  driver_membership_id: string;
  driver_name: string;
  vehicle_name: string;
  vehicle_plate: string;
  total: number;
  review: number;
  mine: boolean;
};
export type DayPage<T> = {
  items: T[];
  total: number;
  page: number;
  hasMore: boolean;
};
export type DriverAttention = {
  id: string;
  kind: string;
  level: number;
  status: string;
  date: string;
  studentName: string;
  studentId: string;
  tripId: string;
  passengerId: string;
};
export type DriverPreparationItem = {
  linkId: string;
  studentId: string;
  studentName: string;
  schoolName: string;
  planningStatus: string | null;
  requestId: string | null;
  requestedUsage: boolean | null;
  tripId: string | null;
  disposition: string | null;
  bucket: string;
};
export type DriverPreparation = DayPage<DriverPreparationItem> & {
  direction: "OUTBOUND" | "RETURN";
  going: number;
  notGoing: number;
  pending: number;
  awaitingChanges: number;
};
export const preparationLabels: Record<string, string> = {
  GOING: "Vai · uso confirmado",
  NOT_GOING: "Não vai",
  PENDING: "Aguardando confirmação ou revisão",
  FORECAST: "Previsto na rotina · falta confirmar",
  UNCONFIGURED: "Sem rotina configurada",
  SNAPSHOT_UNCONFIGURED: "Planejamento criado sem rotina · confira o uso",
  NO_FORECAST: "Sem uso previsto na rotina",
  NO_RECORD: "Sem registro nesta data",
};
export function preparationItemLabel(p: DriverPreparationItem) {
  return p.disposition === "NOT_TRANSPORTED"
    ? "Não transportará · decisão registrada"
    : p.disposition === "REVIEW_REQUIRED"
      ? "Participação em revisão"
      : p.disposition === "EXPECTED" && p.planningStatus !== "CONFIRMED"
        ? "Liberado pelo transporte · família não confirmou"
        : preparationLabels[p.bucket] || "Consultar planejamento";
}
export type DriverDay = {
  preparation?: DriverPreparation;
  pendingAcknowledgements?: number;
  date: string;
  today: string;
  tomorrow: string;
  serverNow: string;
  trips: DayPage<DriverTripCard>;
  openTrips: DayPage<DriverTripCard>;
  attention: DayPage<DriverAttention> & {
    criticalCount: number;
    otherDatesCount: number;
  };
};
