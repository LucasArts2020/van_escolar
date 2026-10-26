export const tripLabels: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  ROUTE_ENDED_OPEN: "Trajeto encerrado com ocorrência aberta",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  COMPLETED_REVIEW: "Conclusão sob revisão",
};
export const tripStatusLabel = (status: string, exceptional = false) =>
  status === "COMPLETED" && exceptional
    ? "Concluída com contabilização excepcional"
    : tripLabels[status];
export const dispositionLabels: Record<string, string> = {
  EXPECTED: "A transportar",
  REVIEW_REQUIRED: "Definir destinação",
  NOT_TRANSPORTED: "Não transportada",
};
export const planningLabels: Record<string, string> = {
  CONFIRMED: "Uso confirmado",
  PENDING: "Aguardando confirmação",
  NOT_USING: "Não utilizará",
  NOT_EXPECTED: "Sem previsão na rotina",
};
export type TripPlan = {
  id: string;
  status: string;
  scheduled: boolean;
  locked_at: string | null;
  student_id: string;
  student_name: string;
  school_name: string;
  school_id: string;
  trip_id: string | null;
  pending_change: boolean;
};
export type TripOptions = {
  plans: TripPlan[];
  drivers: { id: string; name: string }[];
  vehicles: { id: string; name: string; plate: string; capacity: number }[];
};
export type Passenger = {
  exceptionalResolution?: {
    id: string;
    actorName: string;
    at: string;
    outcome: string;
    recipientName: string | null;
  } | null;
  id: string;
  plan_id: string;
  student_id: string;
  student_name: string;
  school_name: string;
  planning_status: string;
  scheduled: boolean;
  disposition: string;
  reason: string | null;
  exceptional: boolean;
  active: boolean;
  boarding_informed_at: string | null;
  boarding_validated_at: string | null;
  alighting_informed_at: string | null;
  delivery_validated_at: string | null;
  link_status: string;
  movementState: string;
  possiblyOnboard: boolean;
  deliveryUnderReview?: boolean;
  canReportRisk?: boolean;
  alerts?: { id: string; kind: string; level: number; status: string }[];
  movements: Movement[];
  issues: MovementIssue[];
};
export type MovementKind = "BOARDING" | "ALIGHTING";
export type MovementConfirmationResult = {
  id: string;
  state: Movement["state"];
  unchanged: boolean;
  passenger: Passenger;
  tripVersion: number;
};
export type Movement = {
  id: string | null;
  kind: MovementKind;
  counterpartRole: "GUARDIAN" | "SCHOOL";
  location: string;
  state: "AWAITING" | "INFORMED" | "VALIDATED";
  firstAt: string | null;
  validatedAt: string | null;
  confirmations: {
    id: string;
    side: string;
    actorId: string;
    actorName: string;
    role: string;
    organizationName: string;
    membershipId: string;
    assignmentId: string;
    receivedAt: string;
    correctionStatus?: string | null;
  }[];
  missingRoles: string[];
  canConfirm: boolean;
  blockedReason: string | null;
};
export type MovementIssue = {
  id: string;
  kind: string;
  status: string;
  detectedAt: string;
  details: { boardingConfirmationsAtDetection: number; reason: string };
};
export const movementRoleLabels: Record<string, string> = {
  DRIVER: "Motorista",
  GUARDIAN: "Responsável",
  SCHOOL: "Escola",
};
export const passengerMovementLabels: Record<string, string> = {
  EXCEPTIONALLY_ACCOUNTED: "Contabilizada excepcionalmente",
  AWAITING_BOARDING: "Aguardando embarque",
  BOARDING_INFORMED: "Embarque informado",
  BOARDING_VALIDATED: "Embarque validado",
  ALIGHTING_INFORMED: "Desembarque informado",
  DELIVERED: "Entrega validada",
  NOT_TRANSPORTED: "Não transportada",
};
export function movementStatus(m: Movement) {
  return m.state === "AWAITING"
    ? "Aguardando confirmações"
    : m.state === "VALIDATED"
      ? m.kind === "BOARDING"
        ? "Embarque validado"
        : "Entrega validada"
      : m.kind === "BOARDING"
        ? "Embarque informado"
        : "Desembarque informado";
}
export function movementAction(role: string, kind: MovementKind) {
  return role === "GUARDIAN"
    ? kind === "BOARDING"
      ? "Confirmar que entreguei a criança"
      : "Confirmar que recebi a criança"
    : role === "SCHOOL"
      ? kind === "BOARDING"
        ? "Confirmar entrega ao motorista"
        : "Confirmar recebimento na escola"
      : kind === "BOARDING"
        ? "Confirmar embarque"
        : "Confirmar desembarque";
}
export type Trip = {
  closure: {
    exceptional: number;
    total: number;
    delivered: number;
    notTransported: number;
    ready: boolean;
    canInspect: boolean;
    pending: {
      id: string;
      studentName: string;
      accounted: boolean;
      reasons: string[];
    }[];
    inspections: {
      id: string;
      actor_name: string;
      inspected_at: string;
      van_empty: boolean;
      result: string;
      note?: string | null;
      trip_version: number;
    }[];
  };
  route_ended_at: string | null;
  completed_at: string | null;
  today: string;
  id: string;
  service_date: string;
  direction: string;
  timezone: string;
  status: string;
  version: number;
  driver_membership_id: string;
  driver_name: string;
  vehicle_id: string;
  vehicle_name: string;
  vehicle_plate: string;
  capacity: number;
  started_at: string | null;
  cancellation_reason: string | null;
  passengers: Passenger[];
  assignments: {
    id: string;
    driver_name: string;
    vehicle_name: string;
    vehicle_plate: string;
    actor_name: string;
    reason: string;
    created_at: string;
  }[];
  counts: {
    total: number;
    expected: number;
    review: number;
    notTransported: number;
    boardingInformed: number;
    boardingValidated: number;
    pendingDelivery: number;
    delivered: number;
    unaccounted: number;
    openIssues: number;
  };
};
export type TripCloseInput = {
  id: string;
  expectedVersion: number;
  walkedInterior: true;
  checkedSeats: true;
  checkedHidingPlaces: true;
  vanEmpty: boolean;
  note?: string;
};
export const tripCounts = (t: Trip): [number, string][] => [
  [t.counts.expected, "A transportar"],
  [t.counts.review, "A revisar"],
  [t.counts.notTransported, "Não transportadas"],
  [t.counts.boardingInformed, "Embarques informados"],
  [t.counts.boardingValidated, "Embarques validados"],
  [t.counts.pendingDelivery, "Entregas pendentes"],
  [t.counts.delivered, "Entregas validadas"],
  [t.counts.openIssues, "Ocorrências abertas"],
];
