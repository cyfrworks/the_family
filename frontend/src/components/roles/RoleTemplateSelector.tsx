import { X } from 'lucide-react';
import { ROLE_TEMPLATES, PROVIDER_COLORS, PROVIDER_LABELS } from '../../config/constants';
import type { RoleTemplate } from '../../lib/types';

interface RoleTemplateSelectorProps {
  onSelect: (template: RoleTemplate) => void;
  onClose: () => void;
}

export function RoleTemplateSelector({ onSelect, onClose }: RoleTemplateSelectorProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-stone-800 bg-stone-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-100">The Outfit</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLE_TEMPLATES.map((template) => (
              <button
                key={template.slug}
                onClick={() => onSelect(template)}
                className="rounded-xl border border-stone-800 bg-stone-800/50 p-4 text-left hover:border-gold-600/50 hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{template.avatar_emoji}</span>
                  <div>
                    <h4 className="font-medium text-stone-100">{template.name}</h4>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${PROVIDER_COLORS[template.provider]}`}
                    >
                      {PROVIDER_LABELS[template.provider]} / {template.model}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-stone-400">{template.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
