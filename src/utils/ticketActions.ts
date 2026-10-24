import type { Order } from "../types";
const calendarEscape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const calendarDate = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function calendarContents(order: Order) {
  const start = new Date(order.currentStartsAt ?? order.startsAt);
  const end = new Date(start.getTime() + 3 * 3600000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VIBETIX//Mock Concert//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${order.id}@vibetix.local`,
    `DTSTAMP:${calendarDate(new Date(order.purchaseDate))}`,
    `DTSTART:${calendarDate(start)}`,
    `DTEND:${calendarDate(end)}`,
    `SUMMARY:${calendarEscape(`${order.artist} · ${order.eventName} (demo)`)}`,
    `LOCATION:${calendarEscape(`${order.venue}, ${order.address}`)}`,
    "DESCRIPTION:Simulated VIBETIX booking. Not valid for entry.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
export function downloadCalendar(order: Order) {
  const url = URL.createObjectURL(
    new Blob([calendarContents(order)], {
      type: "text/calendar;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${order.orderNumber}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function directionsUrl(order: Order) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.venue}, ${order.address}`)}`;
}
