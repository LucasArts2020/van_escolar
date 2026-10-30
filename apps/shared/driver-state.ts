import type { MovementConfirmationResult, Trip } from "./trips";

/** A newer trip summary must not discard an older response for a different child. */
export function mergeConfirmation(
  trip: Trip,
  result: MovementConfirmationResult,
  versions: Map<string, number>,
): Trip {
  if (trip.id !== result.tripSummary.id) return trip;
  const replace =
    result.tripVersion >= (versions.get(result.passenger.id) || 0);
  if (replace) versions.set(result.passenger.id, result.tripVersion);
  const next = replace
    ? {
        ...trip,
        passengers: trip.passengers.map((p) =>
          p.id === result.passenger.id ? result.passenger : p,
        ),
      }
    : trip;
  if (result.tripSummary.version < trip.version) return next;
  return {
    ...next,
    ...result.tripSummary,
    closure: {
      ...result.tripSummary.closure,
      inspections: trip.closure.inspections,
    },
  };
}
