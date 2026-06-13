// src/features/workspace/inboxFormat.ts
export function formatInboxDate(postedDate: string): string {
  const date = new Date(`${postedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return postedDate;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatInboxAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const absolute = Math.abs(parsed).toFixed(2);
  return parsed > 0 ? `+$${absolute}` : `−$${absolute}`;
}

export function invertAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0.00";
  }
  return (-parsed).toFixed(2);
}
