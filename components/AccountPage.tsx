import React, { useState } from 'react';
import { Cloud, CloudOff, KeyRound, Loader2, LogOut, Mail, UserCircle2 } from 'lucide-react';
import type { AuthSession } from '../services/auth';

type Props = {
  session: AuthSession | null;
  authConfigured: boolean;
  syncStatus: 'idle' | 'syncing' | 'ok' | 'error';
  syncError: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => void;
};

const AccountPage: React.FC<Props> = ({
  session,
  authConfigured,
  syncStatus,
  syncError,
  onSignIn,
  onSignUp,
  onSignOut,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'signin' | 'signup'>(null);
  const [error, setError] = useState<string | null>(null);

  const syncBadge = (() => {
    if (!session) return null;
    if (syncStatus === 'syncing') return <span className="text-xs font-medium text-amber-600">Syncing...</span>;
    if (syncStatus === 'ok') return <span className="text-xs font-medium text-emerald-600">Synced</span>;
    if (syncStatus === 'error') return <span className="text-xs font-medium text-rose-600">Sync failed</span>;
    return <span className="text-xs font-medium text-slate-500">Idle</span>;
  })();

  const runAuth = async (mode: 'signin' | 'signup') => {
    setError(null);
    const nextEmail = email.trim();
    if (!nextEmail || !password.trim()) {
      setError('Enter email and password.');
      return;
    }
    setBusy(mode);
    try {
      if (mode === 'signin') await onSignIn(nextEmail, password);
      else await onSignUp(nextEmail, password);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Account</h2>
        <p className="text-slate-500">Sign in to sync your planner across devices.</p>
      </div>

      {!authConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          Cloud auth is not configured. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`.
        </div>
      )}

      {session ? (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <UserCircle2 className="w-4 h-4" />
              Signed in
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="text-xs text-slate-500 mb-1">Email</div>
                <div className="text-sm font-medium text-slate-800 break-all">{session.user.email}</div>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Cloud sync</div>
                  {syncBadge}
                </div>
                {syncStatus === 'ok' ? <Cloud className="w-4 h-4 text-emerald-600" /> : <CloudOff className="w-4 h-4 text-slate-400" />}
              </div>
            </div>
            {syncError && <div className="text-xs text-rose-600">{syncError}</div>}
          </div>

          <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-rose-700">Sign out</div>
              <div className="text-xs text-rose-500 mt-1">Local data remains in this browser.</div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <KeyRound className="w-4 h-4" />
            Sign in
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>

          {(error || syncError) && <div className="text-sm text-rose-600">{error || syncError}</div>}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!authConfigured || busy !== null}
              onClick={() => void runAuth('signin')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                !authConfigured || busy !== null
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {busy === 'signin' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Sign in
            </button>
            <button
              type="button"
              disabled={!authConfigured || busy !== null}
              onClick={() => void runAuth('signup')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                !authConfigured || busy !== null
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {busy === 'signup' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Create account
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPage;
