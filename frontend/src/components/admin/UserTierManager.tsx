import { Loader2 } from 'lucide-react';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_LABELS, TIER_COLORS } from '../../config/constants';
import type { UserTier } from '../../lib/types';
import { toast } from 'sonner';

const TIERS: UserTier[] = ['godfather', 'boss', 'associate'];

export function UserTierManager() {
  const { user } = useAuth();
  const { users, loading, updateTier } = useAdminUsers();

  async function handleTierChange(userId: string, tier: UserTier) {
    try {
      await updateTier(userId, tier);
      toast.success('Tier updated.');
    } catch {
      toast.error('Failed to update tier.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-stone-500">
        <Loader2 size={16} className="animate-spin" />
        Loading users...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-400 mb-4">
        {users.length} user{users.length !== 1 ? 's' : ''} in the Family
      </p>

      {users.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-900 p-3"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-600 text-sm font-bold text-stone-950">
            {u.display_name?.[0]?.toUpperCase() ?? 'D'}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-stone-100">{u.display_name}</span>
            {u.id === user?.id && (
              <span className="ml-2 text-xs text-stone-500">(you)</span>
            )}
          </div>
          <select
            value={u.tier}
            onChange={(e) => handleTierChange(u.id, e.target.value as UserTier)}
            className="rounded border border-stone-700 bg-stone-800 px-2 py-1 text-sm text-stone-100 focus:border-gold-600 focus:outline-none"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>{TIER_LABELS[t]}</option>
            ))}
          </select>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${TIER_COLORS[u.tier]}`}>
            {TIER_LABELS[u.tier]}
          </span>
        </div>
      ))}
    </div>
  );
}
