/** Signed-in Google account. Only these display fields are kept, on this device only. */
export interface Account {
  name: string;
  email: string;
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * Reads the account from a Google ID token after checking it was issued by Google for this app
 * and has not expired. There is no backend, so this is for display only, not authorization.
 */
export function accountFromIdToken(token: string, clientId: string, nowSec = Date.now() / 1000): Account | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  const issOk = p.iss === 'accounts.google.com' || p.iss === 'https://accounts.google.com';
  if (!issOk || p.aud !== clientId || typeof p.exp !== 'number' || p.exp < nowSec) return null;
  if (typeof p.email !== 'string') return null;
  return { name: typeof p.name === 'string' ? p.name : p.email, email: p.email };
}

export function initials(a: Account): string {
  const src = a.name.trim() || a.email;
  return [...src][0]?.toUpperCase() ?? '?';
}
