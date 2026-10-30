import type { ActorRequest } from "./auth";
import { finalReview } from "./trip-closure";
import type { Tx } from "./alerts-domain";
import { passengerCounts } from "../../shared/trips";

export async function tripSummary(
  db: Tx,
  req: ActorRequest,
  t: any,
  passengers: any[],
) {
  const active = passengers.filter((p) => p.active);
  const review = await finalReview(
    db,
    t.id,
    active.map((p) => p.id),
  );
  return {
    id: t.id,
    version: t.version,
    status: t.status,
    counts: passengerCounts(active),
    closure: {
      ...review,
      pendingCount: review.pending.length,
      canInspect:
        req.context!.role === "DRIVER" &&
        req.context!.id === t.driver_membership_id &&
        req.actor.id === t.driver_user_id &&
        ["IN_PROGRESS", "ROUTE_ENDED_OPEN", "COMPLETED_REVIEW"].includes(
          t.status,
        ),
    },
  };
}
