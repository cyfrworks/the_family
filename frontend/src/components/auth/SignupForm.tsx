import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';

export function SignupForm() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp(email, password, displayName);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-stone-300 mb-1">
          Display Name
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
          placeholder="Your alias"
        />
      </div>
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
          minLength={6}
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
          placeholder="Min 6 characters"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-600 px-4 py-2.5 font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
      >
        <UserPlus size={18} />
        {loading ? 'Creating account...' : 'Join the Family'}
      </button>
      <p className="text-center text-sm text-stone-400">
        Already a member?{' '}
        <Link to="/login" className="text-gold-500 hover:text-gold-400">
          Sign in
        </Link>
      </p>
    </form>
  );
}
