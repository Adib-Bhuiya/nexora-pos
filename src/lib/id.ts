/** RFC4122-ish v4 id. Falls back when crypto.randomUUID is unavailable (plain http on a LAN IP). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined') crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

export const uid = (prefix: string): string => `${prefix}_${uuid()}`;

/** Short, human-readable transaction id, e.g. TXN-M3K9Q2A7. */
export function txnId(now = new Date()): string {
  const t = now.getTime().toString(36).toUpperCase().slice(-5);
  const r = uuid().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `TXN-${t}${r}`;
}
