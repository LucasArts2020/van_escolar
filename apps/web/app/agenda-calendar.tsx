"use client";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
export default function AgendaCalendar({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const selected = value || today;
  const [month, setMonth] = useState(selected.slice(0, 7));
  useEffect(() => {
    if (value) setMonth(value.slice(0, 7));
  }, [value]);
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(year, number, 0, 12)).getUTCDate();
  const count = Math.ceil((offset + lastDay) / 7) * 7;
  const cells = Array.from(
    { length: count },
    (_, index) => new Date(Date.UTC(year, number - 1, index - offset + 1, 12)),
  );
  function move(delta: number) {
    setMonth(
      iso(new Date(Date.UTC(year, number - 1 + delta, 1, 12))).slice(0, 7),
    );
  }
  const monthLabel = first.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <section className="agenda-calendar" aria-label="Calendário da agenda">
      <header className="agenda-calendar-toolbar">
        <label className="agenda-month">
          <CalendarDays size={16} />
          <span>{monthLabel}</span>
          <input
            type="month"
            aria-label="Escolher mês"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <div className="agenda-month-actions">
          <button
            type="button"
            onClick={() => {
              onChange(today);
              setMonth(today.slice(0, 7));
            }}
            className="agenda-today"
          >
            Hoje
          </button>
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div className="agenda-weekdays" aria-hidden="true">
        {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="agenda-days" role="group" aria-label={monthLabel}>
        {cells.map((d) => {
          const date = iso(d),
            isCurrent = date.slice(0, 7) === month;
          return (
            <button
              type="button"
              key={date}
              data-date={date}
              aria-label={d.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
              aria-pressed={date === value}
              aria-current={date === today ? "date" : undefined}
              className={`agenda-day ${isCurrent ? "" : "adjacent"} ${date === value ? "selected" : ""} ${date === today ? "today" : ""}`}
              onClick={() => {
                onChange(date);
                setMonth(date.slice(0, 7));
              }}
            >
              <span>{d.getUTCDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="agenda-calendar-caption">
        <span />
        <p>Escolha um dia para ver o planejamento</p>
      </div>
    </section>
  );
}
