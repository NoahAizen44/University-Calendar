export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
  };
};

const SESSION_KEY = 'scholarsync:auth:v1';

function getConfig() {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    url: env.VITE_SUPABASE_URL?.trim() || '',
    anonKey: env.VITE_SUPABASE_ANON_KEY?.trim() || '',
  };
}

export function isAuthConfigured() {
  const { url, anonKey } = getConfig();
  return Boolean(url && anonKey);
}

function getRequiredConfig() {
  const cfg = getConfig();
  if (!cfg.url || !cfg.anonKey) {
    throw new Error('Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  }
  return cfg;
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function toSession(payload: any): AuthSession {
  const accessToken = payload?.access_token;
  const refreshToken = payload?.refresh_token;
  const userId = payload?.user?.id;
  const email = payload?.user?.email;
  if (!accessToken || !userId || !email) {
    throw new Error('Auth response missing session/user.');
  }
  return {
    accessToken,
    refreshToken,
    user: { id: userId, email },
  };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const { url, anonKey } = getRequiredConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await parseJsonSafe<any>(res);
  if (!res.ok) {
    throw new Error(payload?.msg || payload?.error_description || 'Sign in failed');
  }
  return toSession(payload);
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthSession> {
  const { url, anonKey } = getRequiredConfig();
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await parseJsonSafe<any>(res);
  if (!res.ok) {
    throw new Error(payload?.msg || payload?.error_description || 'Sign up failed');
  }

  // If email confirmation is on, signup might not return a usable access token.
  if (!payload?.access_token) {
    throw new Error('Account created. Confirm your email, then sign in.');
  }
  return toSession(payload);
}

export function loadStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.accessToken || !parsed?.user?.id || !parsed?.user?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
