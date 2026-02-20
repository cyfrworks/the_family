import { Edit2, Trash2 } from 'lucide-react';
import type { Member } from '../../lib/types';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../config/constants';

interface MemberCardProps {
  member: Member;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

export function MemberCard({ member, onEdit, onDelete, compact }: MemberCardProps) {
  const provider = member.catalog_model?.provider;
  const alias = member.catalog_model?.alias;

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-2">
        {provider && (
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${PROVIDER_COLORS[provider]}`}>
            {provider[0].toUpperCase()}
          </span>
        )}
        <span className="text-sm text-stone-200">{member.name}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-800 text-lg">
            {member.avatar_url || '\u{1F3AD}'}
          </div>
          <div>
            <h3 className="font-medium text-stone-100">{member.name}</h3>
            <div className="mt-0.5 flex items-center gap-2">
              {provider && (
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${PROVIDER_COLORS[provider]}`}
                >
                  {PROVIDER_LABELS[provider]}
                </span>
              )}
              <span className="text-xs text-stone-500">{alias ?? 'Unknown model'}</span>
            </div>
          </div>
        </div>

        {(onEdit || onDelete) && (
          <div className="flex gap-1">
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded-md p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors"
              >
                <Edit2 size={14} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-md p-1.5 text-stone-500 hover:bg-stone-800 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-stone-500 line-clamp-2">{member.system_prompt}</p>
    </div>
  );
}
