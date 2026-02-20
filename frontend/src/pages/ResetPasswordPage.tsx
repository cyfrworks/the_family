import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, setAccessToken } from '../lib/supabase';
import { KeyRound } from 'lucide-react';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  useEffect(() => {
    // Parse the recovery token from the URL hash fragment
    // Supabase sends: #access_token=...&token_type=bearer&type=recovery
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    if (params.get('type') === 'recovery' && params.get('access_token')) {
      setRecoveryToken(params.get('access_token'));
      // Clean the hash from the URL without triggering a reload
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      // No valid recovery token — redirect to login
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!recoveryToken) return;

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      // Temporarily use the recovery token to update the password
      const previousToken = localStorage.getItem('sb_access_token');
      setAccessToken(recoveryToken);

      try {
        await auth.updateUser({ password: newPassword });
      } finally {
        // Restore previous token (or clear if there wasn't one)
        setAccessToken(previousToken);
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  }

  if (!recoveryToken) return null;

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-stone-950 px-4 overflow-y-auto">
      <img src="/banner.png" alt="" className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] max-w-none opacity-25" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl font-bold text-gold-500">The Family</h1>
          <p className="mt-2 text-stone-400">Set a new password.</p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
          {success ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-900/30 border border-green-800 p-3 text-sm text-green-300">
                Your password has been reset. You may now sign in.
              </div>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-600 px-4 py-2.5 font-semibold text-stone-950 hover:bg-gold-500 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-stone-300 mb-1">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-300 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  placeholder="Re-enter new password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-600 px-4 py-2.5 font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
              >
                <KeyRound size={18} />
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
