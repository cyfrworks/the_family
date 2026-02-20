import type { Member } from '../../lib/types';
import { PROVIDER_COLORS } from '../../config/constants';

interface MentionPopoverProps {
  candidates: Member[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  memberOwnerMap?: Map<string, string>;
}

export function MentionPopover({ candidates, selectedIndex, onSelect, memberOwnerMap }: MentionPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-stone-700 bg-stone-800 py-1 shadow-xl">
      {candidates.map((member, i) => {
        const ownerName = memberOwnerMap?.get(member.id);
        return (
          <button
            key={member.id}
            onClick={() => onSelect(i)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              i === selectedIndex
                ? 'bg-stone-700 text-gold-500'
                : 'text-stone-300 hover:bg-stone-700/50'
            }`}
          >
            {member.id === 'all' ? (
              <>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gold-600 text-[10px] font-bold text-stone-950">
                  @
                </span>
                <span className="font-medium">@all</span>
                <span className="ml-auto text-xs text-stone-500">All Members</span>
              </>
            ) : (
              <>
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white ${PROVIDER_COLORS[member.provider]}`}
                >
                  {member.provider[0].toUpperCase()}
                </span>
                <span className="truncate">{member.name}</span>
                {ownerName && (
                  <span className="ml-auto shrink-0 text-[10px] text-stone-500">Don {ownerName}'s</span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
