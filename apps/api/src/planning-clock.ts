import { Injectable } from "@nestjs/common";
@Injectable()
export class PlanningClock {
  now(): Date {
    return new Date();
  }
}
export function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const p = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${p("year")}-${p("month")}-${p("day")}`;
}
export function addDays(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
