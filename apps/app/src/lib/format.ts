import type { Driver, WeekendSession } from "@pitwall/shared";

export const driverName = (d: Pick<Driver, "givenName" | "familyName">) => `${d.givenName} ${d.familyName}`;

/** Start of a session in the viewer's time zone, or in `timeZone` when given. */
export function formatSessionTime(s: WeekendSession, timeZone?: string) {
  if (!s.start) {
    return new Date(`${s.date}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  return new Date(s.start).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

export function formatDateRange(sessions: WeekendSession[]) {
  const first = sessions[0];
  const last = sessions.at(-1);
  if (!first || !last) return "";
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  return first.date === last.date ? fmt(first.date) : `${fmt(first.date)} – ${fmt(last.date)}`;
}

export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatAge(iso: string | null, now: number) {
  if (!iso) return "unknown";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const formatPoints = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(1));

/** Keep the current season in links so navigation never resets the user's selection. */
export function withSeason(href: string, season: number | null) {
  if (!season) return href;
  return `${href}${href.includes("?") ? "&" : "?"}season=${season}`;
}
