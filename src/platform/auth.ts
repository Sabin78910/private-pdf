import { Capacitor } from '@capacitor/core';
import { accountFromIdToken, type Account } from '../core/auth';

/**
 * Optional Google sign-in. Every PDF tool works without it, and signing in never uploads
 * documents. Google's code is only loaded when the user taps "Sign in with Google".
 * Set VITE_GOOGLE_CLIENT_ID (a Web OAuth client ID) at build time to switch it on.
 */
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';
const KEY = 'pdfapp.account.v1';

export const signInEnabled = () => CLIENT_ID !== '';

export function currentAccount(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function save(a: Account) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: a.name, email: a.email }));
  } catch {
    /* private mode: stay signed in for this page only */
  }
}

/** Android: native Google account picker (Credential Manager). */
async function nativeSignIn(): Promise<Account> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({ google: { webClientId: CLIENT_ID } });
  const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  if (result.responseType !== 'online' || !result.profile.email) throw new Error('sign-in failed');
  return { name: result.profile.name ?? result.profile.email, email: result.profile.email };
}

interface Gis {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; use_fedcm_for_prompt?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
}

let gis: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  gis ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: Gis }).google);
    s.onerror = () => ((gis = null), reject(new Error('offline')));
    document.head.append(s);
  });
  return gis;
}

/**
 * Web: renders Google's own sign-in button into `host` (Google requires the user to tap it).
 * Resolves when the user has signed in.
 */
async function webSignIn(host: HTMLElement, lang: string): Promise<Account> {
  const g = await loadGis();
  return new Promise((resolve, reject) => {
    g.accounts.id.initialize({
      client_id: CLIENT_ID,
      use_fedcm_for_prompt: true,
      callback: ({ credential }) => {
        const a = accountFromIdToken(credential, CLIENT_ID);
        if (a) resolve(a);
        else reject(new Error('invalid token'));
      },
    });
    host.replaceChildren();
    g.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', locale: lang });
  });
}

export async function signIn(host: HTMLElement, lang: string): Promise<Account> {
  const a = Capacitor.isNativePlatform() ? await nativeSignIn() : await webSignIn(host, lang);
  save(a);
  return a;
}

export async function signOut(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    if (Capacitor.isNativePlatform()) {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.logout({ provider: 'google' });
    } else if (gis) {
      (await gis).accounts.id.disableAutoSelect();
    }
  } catch {
    /* already signed out on Google's side */
  }
}
