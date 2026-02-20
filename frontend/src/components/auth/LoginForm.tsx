import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, ArrowLeft, Mail } from 'lucide-react';

export function LoginForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError('The family doesn\'t recognize that name and password. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetSending(true);
    try {
      await auth.resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setResetSending(false);
    }
  }

  if (forgotMode) {
    return (
      <div className="space-y-4">
        {resetSent ? (
          <>
            <div className="rounded-lg bg-green-900/30 border border-green-800 p-3 text-sm text-green-300">
              If that email is in the family, you'll receive a reset link.
            </div>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setResetSent(false); }}
              className="flex items-center gap-1 text-sm text-gold-500 hover:text-gold-400"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            {resetError && (
              <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
                {resetError}
              </div>
            )}
            <p className="text-sm text-stone-400">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div>
              <label htmlFor="resetEmail" className="block text-sm font-medium text-stone-300 mb-1">
                Email
              </label>
              <input
                id="resetEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                placeholder="don@family.com"
              />
            </div>
            <button
              type="submit"
              disabled={resetSending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-600 px-4 py-2.5 font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
            >
              <Mail size={18} />
              {resetSending ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setResetError(''); }}
              className="flex items-center gap-1 text-sm text-gold-500 hover:text-gold-400"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-stone-300 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
          placeholder="don@family.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-stone-300 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
          placeholder="Enter your password"
        />
        <div className="mt-1 text-right">
          <button
            type="button"
            onClick={() => setForgotMode(true)}
            className="text-sm text-gold-500 hover:text-gold-400"
          >
            Forgot password?
          </button>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-600 px-4 py-2.5 font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
      >
        <LogIn size={18} />
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      <p className="text-center text-sm text-stone-400">
        No account?{' '}
        <Link to="/signup" className="text-gold-500 hover:text-gold-400">
          Join the Family
        </Link>
      </p>
    </form>
  );
}
