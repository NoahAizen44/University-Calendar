export function uid(prefix = ''): string {
  const core = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${core}` : core;
}
