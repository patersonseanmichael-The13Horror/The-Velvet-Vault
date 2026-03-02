export function toCents(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function formatAUD(cents) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(toCents(cents) / 100);
}

export function formatAUDSigned(cents) {
  const value = Number(cents || 0);
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatAUD(Math.abs(value))}`;
}

export function formatPercent(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0%";
  return `${Math.max(0, Math.min(100, parsed)).toFixed(0)}%`;
}
