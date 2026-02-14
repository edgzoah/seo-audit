export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

export function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function compactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const path = `${parsed.pathname}${parsed.search}`;
    return path === "/" ? parsed.hostname : path;
  } catch {
    return value;
  }
}
