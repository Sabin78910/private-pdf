import { describe, expect, it } from 'vitest';
import { accountFromIdToken, initials } from '../src/core/auth';

const CLIENT = 'abc.apps.googleusercontent.com';
const b64url = (o: object) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const token = (claims: object) => `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`;
const good = { iss: 'https://accounts.google.com', aud: CLIENT, exp: 2000, email: 'sita@example.com', name: 'सीता शर्मा' };

describe('accountFromIdToken', () => {
  it('reads name and email from a valid token, including Nepali names', () => {
    expect(accountFromIdToken(token(good), CLIENT, 1000)).toEqual({ name: 'सीता शर्मा', email: 'sita@example.com' });
  });
  it('rejects wrong audience, wrong issuer, expired and malformed tokens', () => {
    expect(accountFromIdToken(token({ ...good, aud: 'other' }), CLIENT, 1000)).toBeNull();
    expect(accountFromIdToken(token({ ...good, iss: 'evil.com' }), CLIENT, 1000)).toBeNull();
    expect(accountFromIdToken(token(good), CLIENT, 3000)).toBeNull();
    expect(accountFromIdToken('not-a-jwt', CLIENT, 1000)).toBeNull();
    expect(accountFromIdToken('a.%%%.c', CLIENT, 1000)).toBeNull();
  });
  it('falls back to email when there is no name', () => {
    const { name: _n, ...noName } = good;
    expect(accountFromIdToken(token(noName), CLIENT, 1000)?.name).toBe('sita@example.com');
  });
  it('gives a display initial', () => {
    expect(initials({ name: 'leo', email: 'x' })).toBe('L');
  });
});
