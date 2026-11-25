/** Server and browser must print the same text, so dates are shown in UTC. */
export function formatDateTimeUtc(d: Date | string): string {
  const iso = (typeof d === "string" ? new Date(d) : d).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
