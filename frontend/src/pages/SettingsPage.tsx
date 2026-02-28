import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken, setAccessToken, setRefreshToken } from '../lib/supabase';
import { toast } from 'sonner';

const SETTINGS_API_REF = 'formula:local.settings-api:0.1.0';

export function SettingsPage() {
  const { profile, user } = useAuth();
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
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: { action: 'update_profile', access_token: accessToken, display_name: displayName },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

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
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: {
          action: 'change_password',
          access_token: accessToken,
          email: user.email,
          current_password: currentPassword,
          new_password: newPassword,
        },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      // Update stored tokens with the fresh session from the formula
      const newAccessToken = res?.access_token as string;
      const newRefreshToken = res?.refresh_token as string;
      if (newAccessToken) {
        setAccessToken(newAccessToken);
      }
      if (newRefreshToken) {
        setRefreshToken(newRefreshToken);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Your password has been changed.');
    } catch (err) {
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
