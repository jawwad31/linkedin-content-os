const DISPLAY_LOCALE = "en-US";
const DISPLAY_TIME_ZONE = "UTC";

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

const UTC_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
  timeZoneName: "short",
});

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return parseTimestamp(value);
  }

  const [, year, month, day] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12),
  );
}

function parseTimestamp(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized);

  return new Date(hasExplicitTimezone ? normalized : `${normalized}Z`);
}

export function formatDateOnly(value: string): string {
  return DATE_ONLY_FORMATTER.format(parseDateOnly(value));
}

export function formatUtcDate(value: string): string {
  return UTC_DATE_FORMATTER.format(parseTimestamp(value));
}

export function formatUtcDateTime(value: string): string {
  return UTC_DATE_TIME_FORMATTER.format(parseTimestamp(value));
}
