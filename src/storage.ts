export function readIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const value = JSON.parse(raw);
    return Array.isArray(value) ? new Set(value.filter(v => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function writeIds(key: string, ids: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Local storage is an enhancement, not a boot dependency.
  }
}
