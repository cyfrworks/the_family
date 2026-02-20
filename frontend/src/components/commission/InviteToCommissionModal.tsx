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
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setInlineError(null);
    setLoading(true);
    try {
      await inviteByEmail(email.trim());
      toast.success('Word has been sent.');
      onClose();
    } catch (err: unknown) {
      console.error('Commission invite error:', err);

      // Build a searchable string from every possible error shape:
      // - err.message (plain or JSON-encoded)
      // - JSON.stringify of the whole error (catches CyfrError.code + message)
      // - String fallback
      let raw = err instanceof Error ? err.message : String(err);

      // err.message may itself be a JSON string from CYFR — try to unwrap it
      try {
        const parsed = JSON.parse(raw);
        raw = parsed.message ?? parsed.error?.message ?? parsed.error ?? raw;
        if (typeof raw !== 'string') raw = JSON.stringify(raw);
      } catch {
        // not JSON, keep raw as-is
      }

      const upper = raw.toUpperCase();

      if (upper.includes('ALREADY_CONNECTED')) {
        setInlineError("They're already in The Commission.");
      } else if (upper.includes('ALREADY_PENDING') || upper.includes('UNIQUE CONSTRAINT') || upper.includes('DUPLICATE KEY')) {
        setInlineError("Word's already been sent. They haven't responded yet.");
      } else if (upper.includes('USER_NOT_FOUND')) {
        setInlineError("No one in the underworld goes by that name.");
      } else if (upper.includes('CANNOT_INVITE_SELF')) {
        setInlineError("You can't invite yourself, Don.");
      } else {
        console.error('Unrecognized invite error format:', raw);
        setInlineError("Couldn't send word.");
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
              onChange={(e) => {
                setEmail(e.target.value);
                setInlineError(null);
              }}
              required
              className={`w-full rounded-lg border bg-stone-800 px-3 py-2 text-stone-100 focus:outline-none focus:ring-1 ${
                inlineError
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-stone-700 focus:border-gold-600 focus:ring-gold-600'
              }`}
              placeholder="their.email@example.com"
            />
            {inlineError ? (
              <p className="mt-1.5 text-xs text-red-400">{inlineError}</p>
            ) : (
              <p className="mt-1.5 text-xs text-stone-500">
                They must already have an account in The Family.
              </p>
            )}
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
