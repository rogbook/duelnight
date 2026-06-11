// Minimal RFC5545 .ics builder for a single event
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toIcsDate(iso: string) {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export type IcsEvent = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

export function buildIcs(ev: IcsEvent): string {
  const dtStart = toIcsDate(ev.startsAt);
  const dtEnd = toIcsDate(
    ev.endsAt ?? new Date(new Date(ev.startsAt).getTime() + 60 * 60 * 1000).toISOString(),
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DuelNight//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@duelnight.app`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(ev.title)}`,
    ev.location ? `LOCATION:${escapeText(ev.location)}` : "",
    ev.description ? `DESCRIPTION:${escapeText(ev.description)}` : "",
    ev.url ? `URL:${ev.url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadIcs(ev: IcsEvent) {
  const blob = new Blob([buildIcs(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.title.replace(/[^\w\-가-힣]/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
