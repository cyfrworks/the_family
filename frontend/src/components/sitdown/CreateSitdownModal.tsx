import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useSitDowns } from '../../hooks/useSitDowns';
import { toast } from 'sonner';

interface CreateSitdownModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateSitdownModal({ onClose, onCreated }: CreateSitdownModalProps) {
  const { createSitDown } = useSitDowns();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const sitDown = await createSitDown(name, description || undefined);
      onCreated(sitDown.id);
    } catch {
      toast.error('Couldn\'t arrange the sit-down.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-stone-800 bg-stone-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-100">Call a Sit-down</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600"
              placeholder="Strategy session, War council..."
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
              placeholder="What's this sit-down about?"
            />
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
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
