import type { Movement, Passenger, MovementKind } from "./trips";
import { movementRoleLabels } from "./trips";

export function confirmationSide(
  m: Movement | undefined,
  side: "DRIVER" | "COUNTERPART",
) {
  return m?.confirmations.find(
    (c) => c.side === side && c.correctionStatus !== "APPROVED",
  );
}
export function sidePresentation(
  m: Movement | undefined,
  side: "DRIVER" | "COUNTERPART",
) {
  const name =
    side === "DRIVER"
      ? "Motorista"
      : movementRoleLabels[m?.counterpartRole || "SCHOOL"];
  const record = confirmationSide(m, side);
  const invalid = m?.confirmations.some(
    (c) => c.side === side && c.correctionStatus === "APPROVED",
  );
  if (record?.correctionStatus === "PENDING")
    return `${name}: registro sob correção por ${record.actorName}`;
  if (record) return `${name} confirmou por ${record.actorName}`;
  if (invalid) return `${name}: registro invalidado por correção`;
  return `${name}: falta confirmar`;
}
export function movementPresentation(
  p: Passenger,
  kind: MovementKind,
  side: "DRIVER" | "COUNTERPART",
  membershipId?: string,
) {
  const m = p.movements.find((m) => m.kind === kind)!;
  const record = confirmationSide(m, side),
    other = confirmationSide(m, side === "DRIVER" ? "COUNTERPART" : "DRIVER");
  const pendingReview = m.confirmations.some(
    (c) => c.correctionStatus === "PENDING",
  );
  const ownRecord = !!membershipId && record?.membershipId === membershipId;
  const issues = p.issues.filter((i) => i.status !== "RESOLVED");
  const alerts = (p.alerts || []).filter((a) => a.status !== "RESOLVED");
  const waiting = m.missingRoles
    .map((r) => movementRoleLabels[r])
    .join(" e ")
    .toLowerCase();
  const inactive = !p.active || p.link_status !== "ACTIVE";
  const invalidated = m.confirmations.some(
    (c) => c.correctionStatus === "APPROVED",
  );
  const unavailable = inactive
    ? "Participação ou vínculo inativo"
    : p.disposition === "NOT_TRANSPORTED"
      ? "Não transportada"
      : p.disposition === "REVIEW_REQUIRED"
        ? "Participação em revisão pelo transporte"
        : null;
  return {
    movement: m,
    record,
    other,
    pendingReview,
    hasOccurrence: issues.length > 0 || alerts.length > 0,
    actionLabel:
      unavailable ||
      (p.exceptionalResolution
        ? "Contabilização excepcional"
        : record?.correctionStatus === "PENDING"
          ? "Registro sob correção"
          : record
            ? ownRecord
              ? "Você já confirmou"
              : `${side === "DRIVER" ? "Motorista" : movementRoleLabels[m.counterpartRole]} já confirmou`
            : kind === "BOARDING"
              ? "Confirmar embarque"
              : "Confirmar desembarque"),
    status:
      unavailable ||
      (p.exceptionalResolution
        ? `Contabilizada excepcionalmente por ${p.exceptionalResolution.actorName}`
        : pendingReview
          ? "Registro sob correção · consulte os detalhes"
          : invalidated
            ? "Registro invalidado por correção · consulte o histórico"
            : record && !other
              ? `${ownRecord ? "Você confirmou" : `${side === "DRIVER" ? "Motorista" : movementRoleLabels[m.counterpartRole]} confirmou`} · aguardando ${waiting}`
              : m.state === "VALIDATED"
                ? "Duas confirmações vigentes"
                : waiting
                  ? `Falta confirmar: ${waiting}`
                  : "Consulte as confirmações"),
  };
}
