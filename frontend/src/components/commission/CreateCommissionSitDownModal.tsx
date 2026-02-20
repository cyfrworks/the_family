import { useState, type FormEvent } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useMembers } from '../../hooks/useMembers';
import { useCommission } from '../../hooks/useCommission';
import { useCommissionSitDowns } from '../../hooks/useCommissionSitDowns';
import { PROVIDER_COLORS } from '../../config/constants';

interface CreateCommissionSitDownModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateCommissionSitDownModal({ onClose, onCreated }: CreateCommissionSitDownModalProps) {
  const { myMembers } = useMembers();
  const { contacts } = useCommission();
  const { createCommissionSitDown } = useCommissionSitDowns();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedContactIds.size === 0) {
      toast.error('Invite at least one Don to the sit-down.');
      return;
    }
    setLoading(true);
    try {
      const sitDown = await createCommissionSitDown(
        name,
        description || undefined,
        Array.from(selectedMemberIds),
        Array.from(selectedContactIds)
      );
      onCreated(sitDown.id);
    } catch {
      toast.error("Couldn't arrange the sit-down.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-stone-800 bg-stone-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-100">
            Commission Sit-down
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-5 pt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-gold-600' : 'bg-stone-700'
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Name & Description */}
          {step === 1 && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  placeholder="Joint venture, Territory talks..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">
                  Description <span className="text-stone-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
                  placeholder="What's on the table?"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { if (name.trim()) setStep(2); }}
                  disabled={!name.trim()}
                  className="flex items-center gap-1 rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Select Members */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Bring your Members to the table
                </label>
                {myMembers.length === 0 ? (
                  <p className="text-xs text-stone-500 py-2">
                    You don't have any Members yet. You can add them later.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {myMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleMember(member.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          selectedMemberIds.has(member.id)
                            ? 'border-gold-600 bg-gold-600/10'
                            : 'border-stone-700 hover:bg-stone-800'
                        }`}
                      >
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white ${PROVIDER_COLORS[member.provider]}`}
                        >
                          {member.provider[0].toUpperCase()}
                        </span>
                        <span className="text-sm text-stone-300 truncate">{member.name}</span>
                        {selectedMemberIds.has(member.id) && (
                          <Check size={14} className="ml-auto text-gold-500 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 hover:bg-stone-800 transition-colors"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1 rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Select Contacts */}
          {step === 3 && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Invite Dons to the sit-down
                </label>
                {contacts.length === 0 ? (
                  <p className="text-xs text-stone-500 py-2">
                    No Commission contacts yet. Invite some Dons first.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {contacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleContact(contact.contact_user_id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          selectedContactIds.has(contact.contact_user_id)
                            ? 'border-gold-600 bg-gold-600/10'
                            : 'border-stone-700 hover:bg-stone-800'
                        }`}
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-600 text-[10px] font-bold text-stone-950">
                          {contact.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                        </div>
                        <span className="text-sm text-stone-300 truncate">
                          {contact.contact_profile?.display_name ?? 'Don'}
                        </span>
                        {selectedContactIds.has(contact.contact_user_id) && (
                          <Check size={14} className="ml-auto text-gold-500 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 hover:bg-stone-800 transition-colors"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedContactIds.size === 0}
                  className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Creating...' : 'Call the Sit-down'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
