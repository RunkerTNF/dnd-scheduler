// src/lib/time.ts
import { addMinutes, startOfDay } from "date-fns";

export function toUTCDateMidnight(dateStr: string, tz: string) {
  // Для простоты MVP считаем, что дата уже в локали клиента и отправляется как YYYY-MM-DD
  const d = new Date(dateStr + "T00:00:00");
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function clampDuration(start: Date, end: Date) {
  if (end <= start) return addMinutes(start, 15);
  return end;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export function startOfUTCDay(d: Date) {
  return startOfDay(d);
}
