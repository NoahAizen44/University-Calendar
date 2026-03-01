import type { PlannerState } from '../types';
import type { AuthSession } from './auth';

function getConfig() {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    url: env.VITE_SUPABASE_URL?.trim() || '',
    anonKey: env.VITE_SUPABASE_ANON_KEY?.trim() || '',
  };
}

export function isCloudSyncConfigured() {
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

export async function loadCloudPlannerState(session: AuthSession): Promise<PlannerState | null> {
  const { url, anonKey } = getRequiredConfig();
  const res = await fetch(`${url}/rest/v1/planner_states?user_id=eq.${session.user.id}&select=state&limit=1`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const payload = await parseJsonSafe<Array<{ state: PlannerState }>>(res);
  if (!res.ok) {
    throw new Error('Failed to load cloud planner state');
  }
  return payload?.[0]?.state ?? null;
}

export async function saveCloudPlannerState(session: AuthSession, state: PlannerState): Promise<void> {
  const { url, anonKey } = getRequiredConfig();
  const res = await fetch(`${url}/rest/v1/planner_states?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([
      {
        user_id: session.user.id,
        state,
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!res.ok) {
    throw new Error('Failed to save cloud planner state');
  }
}
