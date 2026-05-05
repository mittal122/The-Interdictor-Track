import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Server, Lock, UserPlus, LogIn } from 'lucide-react';

// Backend URL: falls back to same-origin for local dev
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// ── Client-side auth helpers ────────────────────────────────────────────────
// Used as fallback when the Express backend is unreachable (e.g. Vercel deploy).
// Stores users in localStorage with plain-text passwords (acceptable for demo).

interface StoredUser {
  username: string;
  password: string;
  role: 'admin' | 'viewer';
}

const LOCAL_USERS_KEY = 'interdictor_local_users';

function getLocalUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Seed default demo users
  const defaults: StoredUser[] = [
    { username: 'admin', password: 'admin', role: 'admin' },
    { username: 'viewer', password: 'viewer', role: 'viewer' },
  ];
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(defaults));
  return defaults;
}

function saveLocalUsers(users: StoredUser[]): void {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

/** Simple JWT-like token for client-side sessions (base64-encoded, NOT secure) */
function createClientToken(user: { username: string; role: string }): string {
  const payload = { ...user, iat: Date.now(), exp: Date.now() + 8 * 60 * 60 * 1000 };
  return btoa(JSON.stringify(payload));
}

// ── Component ───────────────────────────────────────────────────────────────

type AuthMode = 'login' | 'register';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // ── Try server-first auth, fallback to client-side ──────────────────────
  const handleLogin = async () => {
    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }

    setIsLoading(true);
    setError('');

    // 1) Try the Express backend first
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        login(data.token, data.user);
        navigate('/dashboard');
        return;
      }

      // If server returned a proper auth error (401/400), respect it
      if (response.status === 401 || response.status === 400) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || 'Invalid credentials.');
        setIsLoading(false);
        return;
      }

      // If 404 or other non-auth error → server is unreachable, fall through to client-side
    } catch {
      // Network error → backend unavailable, fall through
    }

    // 2) Client-side fallback (Vercel / static deploys)
    const users = getLocalUsers();
    const found = users.find(u => u.username === username);
    if (!found || found.password !== password) {
      setError('Invalid credentials.');
      setIsLoading(false);
      return;
    }

    const token = createClientToken({ username: found.username, role: found.role });
    login(token, { username: found.username, role: found.role });
    setIsLoading(false);
    navigate('/dashboard');
  };

  // ── Client-side registration ────────────────────────────────────────────
  const handleRegister = async () => {
    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setIsLoading(true);
    setError('');

    const users = getLocalUsers();
    if (users.find(u => u.username === username)) {
      setError('Username already exists.');
      setIsLoading(false);
      return;
    }

    const newUser: StoredUser = { username, password, role };
    users.push(newUser);
    saveLocalUsers(users);

    // Auto-login after registration
    const token = createClientToken({ username, role });
    login(token, { username, role });
    setIsLoading(false);
    navigate('/dashboard');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'login') handleLogin();
    else handleRegister();
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-mono text-zinc-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700">
            <Server className="h-8 w-8 text-zinc-400" />
          </div>
          <h1 className="text-xl font-bold uppercase tracking-widest">The Interdictor Track</h1>
          <p className="mt-2 text-xs text-zinc-500 uppercase tracking-widest">Secure Access Required</p>
        </div>

        {/* ── Mode Toggle ────────────────────────────────────────────── */}
        <div className="mb-6 flex rounded-lg border border-zinc-800 overflow-hidden">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all ${
              authMode === 'login'
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all ${
              authMode === 'register'
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-500">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500 uppercase tracking-wider">
                {authMode === 'login' ? 'Operator ID' : 'Choose Username'}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder={authMode === 'login' ? 'Enter your username' : 'Create a username'}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 uppercase tracking-wider">
                {authMode === 'login' ? 'Passcode' : 'Create Passcode'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="••••••••"
                required
              />
            </div>

            {authMode === 'register' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 uppercase tracking-wider">Confirm Passcode</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 uppercase tracking-wider">Access Level</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('viewer')}
                      className={`flex-1 rounded border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                        role === 'viewer'
                          ? 'border-emerald-600 bg-emerald-950/40 text-emerald-400'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700'
                      }`}
                    >
                      Viewer
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      className={`flex-1 rounded border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                        role === 'admin'
                          ? 'border-amber-600 bg-amber-950/40 text-amber-400'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700'
                      }`}
                    >
                      Admin
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded bg-zinc-100 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-zinc-900/20 border-t-zinc-900 rounded-full animate-spin" />
            ) : authMode === 'login' ? (
              <Lock className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isLoading ? 'Processing...' : authMode === 'login' ? 'Authenticate' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-[10px] text-zinc-600 uppercase tracking-widest space-y-1">
          <p>Demo Credentials:</p>
          <p>Admin: admin / admin</p>
          <p>Viewer: viewer / viewer</p>
        </div>
      </div>
    </div>
  );
}
