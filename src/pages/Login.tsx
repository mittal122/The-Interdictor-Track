import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Server, Lock } from 'lucide-react';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Unable to connect to authentication server.');
    }
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-500">
              <ShieldAlert className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500 uppercase tracking-wider">Operator ID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="admin or viewer"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 uppercase tracking-wider">Passcode</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded bg-zinc-100 px-4 py-2 text-sm font-bold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-300"
          >
            <Lock className="h-4 w-4" />
            Authenticate
          </button>
        </form>
        
        <div className="mt-6 text-center text-[10px] text-zinc-600 uppercase tracking-widest">
          <p>Demo Credentials:</p>
          <p>Admin: admin / admin</p>
          <p>Viewer: viewer / viewer</p>
        </div>
      </div>
    </div>
  );
}
