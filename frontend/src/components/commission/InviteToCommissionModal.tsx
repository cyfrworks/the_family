import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useCommission } from '../../hooks/useCommission';

interface InviteToCommissionModalProps {
  onClose: () => void;
}

export function InviteToCommissionModal({ onClose }: InviteToCommissionModalProps) {
  const { inviteByEmail } = useCommission();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await inviteByEmail(email.trim());
      toast.success('Word has been sent.');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('USER_NOT_FOUND')) {
        toast.error("No one in the underworld goes by that name.");
      } else if (message.includes('ALREADY_CONNECTED')) {
        toast.error("They're already in The Commission.");
      } else if (message.includes('ALREADY_PENDING')) {
        toast.error("Word has already been sent. They haven't responded yet.");
      } else if (message.includes('CANNOT_INVITE_SELF')) {
        toast.error("You can't invite yourself, Don.");
      } else {
        toast.error("Couldn't send word.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-stone-800 bg-stone-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-100">Invite a Don</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
              placeholder="their.email@example.com"
            />
            <p className="mt-1.5 text-xs text-stone-500">
              They must already have an account in The Family.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 hover:bg-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending word...' : 'Send Word'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
