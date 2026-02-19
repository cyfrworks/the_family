import type { Role } from '../../lib/types';
import { PROVIDER_COLORS } from '../../config/constants';

interface MentionPopoverProps {
  candidates: Role[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function MentionPopover({ candidates, selectedIndex, onSelect }: MentionPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-stone-700 bg-stone-800 py-1 shadow-xl">
      {candidates.map((role, i) => (
        <button
          key={role.id}
          onClick={() => onSelect(i)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex
              ? 'bg-stone-700 text-gold-500'
              : 'text-stone-300 hover:bg-stone-700/50'
          }`}
        >
          {role.id === 'all' ? (
            <>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gold-600 text-[10px] font-bold text-stone-950">
                @
              </span>
              <span className="font-medium">@all</span>
              <span className="ml-auto text-xs text-stone-500">All roles</span>
            </>
          ) : (
            <>
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white ${PROVIDER_COLORS[role.provider]}`}
              >
                {role.provider[0].toUpperCase()}
              </span>
              <span>{role.name}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
