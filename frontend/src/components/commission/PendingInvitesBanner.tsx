import { Check, X } from 'lucide-react';
import type { CommissionContact } from '../../lib/types';
import { toast } from 'sonner';

interface PendingInvitesBannerProps {
  invites: CommissionContact[];
  onAccept: (contactId: string) => Promise<unknown>;
  onDecline: (contactId: string) => Promise<unknown>;
}

export function PendingInvitesBanner({ invites, onAccept, onDecline }: PendingInvitesBannerProps) {
  if (invites.length === 0) return null;

  return (
    <div className="space-y-1 mb-2">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="rounded-lg border border-gold-600/30 bg-gold-600/10 px-3 py-2"
        >
          <p className="text-xs text-gold-500 mb-1.5">
            <span className="font-semibold">{invite.profile?.display_name ?? 'A Don'}</span>
            {' wants you in The Commission'}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={async () => {
                try {
                  await onAccept(invite.id);
                  toast.success('Welcome to The Commission.');
                } catch {
                  toast.error("Couldn't accept the invite.");
                }
              }}
              className="flex items-center gap-1 rounded bg-gold-600 px-2 py-0.5 text-[11px] font-semibold text-stone-950 hover:bg-gold-500 transition-colors"
            >
              <Check size={10} />
              Accept
            </button>
            <button
              onClick={async () => {
                try {
                  await onDecline(invite.id);
                  toast.success('Invitation declined.');
                } catch {
                  toast.error("Couldn't decline the invite.");
                }
              }}
              className="flex items-center gap-1 rounded border border-stone-700 px-2 py-0.5 text-[11px] text-stone-400 hover:bg-stone-800 transition-colors"
            >
              <X size={10} />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
