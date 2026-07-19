type NullableNumber = number | null | undefined;

function isFiniteNumber(value: NullableNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatDistance(value: NullableNumber): string {
  return isFiniteNumber(value) ? `${value.toFixed(2)} km` : "—";
}

export function formatMinutes(value: NullableNumber): string {
  return isFiniteNumber(value) ? `${value.toFixed(1)} min` : "—";
}

export function formatPercent(value: NullableNumber): string {
  return isFiniteNumber(value) ? `${Math.round(value * 100)}%` : "—";
}
