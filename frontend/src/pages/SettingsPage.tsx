import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth, getAccessToken, setAccessToken } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function SettingsPage() {
  const { profile, user, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await db.update('profiles', { display_name: displayName }, [
        { column: 'id', op: 'eq', value: profile.id },
      ]);
      toast.success('Your identity has been updated.');
    } catch {
      toast.error('Couldn\'t change your papers.');
    }
    setSaving(false);
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) return;

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setChangingPassword(true);

    // Save the active session so we can restore it if verification or update fails
    const savedAccessToken = getAccessToken();
    const savedRefreshToken = localStorage.getItem('sb_refresh_token');

    try {
      // 1. Verify current password (side-effect: overwrites stored tokens)
      try {
        await auth.signIn(user.email, currentPassword);
      } catch {
        throw new Error('Current password is incorrect.');
      }

      // 2. Update to new password (uses the fresh token from signIn above)
      await auth.updateUser({ password: newPassword });

      // 3. Re-authenticate with the new password to establish a fresh session
      //    This updates both the stored tokens and the AuthContext state
      await signIn(user.email, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Your password has been changed.');
    } catch (err) {
      // Restore the original session so the user isn't locked out
      setAccessToken(savedAccessToken);
      if (savedRefreshToken) localStorage.setItem('sb_refresh_token', savedRefreshToken);
      toast.error(err instanceof Error ? err.message : 'Password change failed.');
    }
    setChangingPassword(false);
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-lg">
        <h2 className="font-serif text-3xl font-bold text-stone-100 mb-6">Settings</h2>

        <form onSubmit={handleSave} className="rounded-xl border border-stone-800 bg-stone-900 p-6 space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-stone-300 mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Email</label>
            <p className="text-sm text-stone-500">{profile?.id ? 'Managed by Supabase Auth' : 'Not available'}</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        <form onSubmit={handleChangePassword} className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-6 space-y-4">
          <h3 className="font-serif text-xl font-semibold text-stone-100">Change Password</h3>

          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-stone-300 mb-1">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 placeholder-stone-500 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
              placeholder="Enter current password"
            />
          </div>

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
              Confirm New Password
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
            disabled={changingPassword}
            className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
          >
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
