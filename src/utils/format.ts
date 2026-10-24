const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
export const formatCurrency = (value: number) =>
  currencyFormatter.format(value);
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(
  timeZone: string,
  kind: string,
  options: Intl.DateTimeFormatOptions,
) {
  const key = `${timeZone}:${kind}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    // Orders may use valid IANA zones beyond the small catalog. Keep this cache bounded.
    if (dateFormatters.size >= 32)
      dateFormatters.delete(dateFormatters.keys().next().value!);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}
export const formatEventDate = (date: string, timeZone: string) =>
  dateFormatter(timeZone, "date", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
export const formatEventTime = (date: string, timeZone: string) =>
  dateFormatter(timeZone, "time", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
export const formatEventDay = (date: string, timeZone: string) =>
  dateFormatter(timeZone, "day", { weekday: "long" }).format(new Date(date));
export const formatEventYear = (date: string, timeZone: string) =>
  dateFormatter(timeZone, "year", { year: "numeric" }).format(new Date(date));
