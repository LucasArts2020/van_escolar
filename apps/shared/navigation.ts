/** A record to open within the currently authorized context. */
export type JourneyTarget = {
  view: "history" | "alerts" | "trips";
  contextId: string;
  date: string;
  studentId?: string;
  operatingLinkId?: string;
  tripId?: string;
  passengerId?: string;
  alertId?: string;
};
