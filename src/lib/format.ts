// Shared formatting / validation helpers (non-component).

export type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "info";

export function stateTone(state?: string | null): Tone {
  switch (state) {
    case "sent":
    case "success":
    case "completed":
    case "connected":
    case "reminder":
      return "good";
    case "held":
    case "incomplete":
    case "completed_with_issues":
    case "retry_authorized":
    case "no_pending":
      return state === "no_pending" ? "info" : "warning";
    case "uncertain":
    case "credentials_missing":
    case "skipped":
      return "serious";
    case "failed":
      return "critical";
    default:
      return "neutral";
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailList(values: string[]): string | null {
  const seen = new Set<string>();
  for (const v of values) {
    if (!EMAIL_RE.test(v)) return `Invalid email address: ${v}`;
    if (seen.has(v.toLowerCase())) return `Duplicate email address: ${v}`;
    seen.add(v.toLowerCase());
  }
  return null;
}

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return value.length === 10
    ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
