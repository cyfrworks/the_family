import { useState } from 'react';
import { Plus, Layout } from 'lucide-react';
import { useMembers } from '../hooks/useMembers';
import { MemberCard } from '../components/members/MemberCard';
import { MemberEditor } from '../components/members/MemberEditor';
import { MemberTemplateSelector } from '../components/members/MemberTemplateSelector';
import type { Member } from '../lib/types';
import { toast } from 'sonner';

export function MembersPage() {
  const { myMembers, loading, createMember, updateMember, deleteMember } = useMembers();
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl font-bold text-stone-100">Members</h2>
            <p className="mt-1 text-sm text-stone-400">
              Your AI personas for sit-downs.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-2 rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-300 hover:bg-stone-800 transition-colors"
            >
              <Layout size={16} />
              The Outfit
            </button>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-gold-500 transition-colors"
            >
              <Plus size={16} />
              New Member
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-stone-500">Loading...</div>
        ) : myMembers.length === 0 ? (
          <div className="py-12 text-center text-stone-500">No members yet.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {myMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onEdit={() => setEditing(member)}
                onDelete={async () => {
                  try {
                    await deleteMember(member.id);
                    toast.success(`${member.name} has left the Family.`);
                  } catch {
                    toast.error('They refused to go.');
                  }
                }}
              />
            ))}
          </div>
        )}

        {(creating || editing) && (
          <MemberEditor
            member={editing}
            onSave={async (data) => {
              try {
                if (editing) {
                  await updateMember(editing.id, data);
                  toast.success(`${data.name} has new orders.`);
                } else {
                  await createMember(data);
                  toast.success(`${data.name} has joined the Family.`);
                }
                setEditing(null);
                setCreating(false);
              } catch {
                toast.error('Couldn\'t make it happen.');
              }
            }}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        )}

        {showTemplates && (
          <MemberTemplateSelector
            onSelect={async (template) => {
              try {
                await createMember({
                  name: template.name,
                  provider: template.provider,
                  model: template.model,
                  system_prompt: template.system_prompt,
                });
                toast.success(`${template.name} has been made.`);
                setShowTemplates(false);
              } catch {
                toast.error('The initiation failed.');
              }
            }}
            onClose={() => setShowTemplates(false)}
          />
        )}
      </div>
    </div>
  );
}
