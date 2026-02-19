import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/supabase';
import { toast } from 'sonner';

export function SettingsPage() {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

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
      </div>
    </div>
  );
}
