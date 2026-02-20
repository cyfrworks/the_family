import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ModelCatalogManager } from '../components/admin/ModelCatalogManager';
import { UserTierManager } from '../components/admin/UserTierManager';

type Tab = 'catalog' | 'users';

export function AdminPage() {
  const { isGodfather } = useAuth();
  const [tab, setTab] = useState<Tab>('catalog');

  if (!isGodfather) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <ShieldAlert size={48} className="mx-auto text-stone-600" />
          <h2 className="mt-4 font-serif text-2xl font-bold text-stone-100">Access Denied</h2>
          <p className="mt-2 text-sm text-stone-400">Only the Godfather can access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h2 className="font-serif text-3xl font-bold text-stone-100">Admin</h2>
          <p className="mt-1 text-sm text-stone-400">
            Manage the model catalog and user tiers.
          </p>
        </div>

        <div className="mb-6 flex gap-1 rounded-lg border border-stone-800 bg-stone-900 p-1">
          <button
            onClick={() => setTab('catalog')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'catalog'
                ? 'bg-stone-800 text-gold-500'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Model Catalog
          </button>
          <button
            onClick={() => setTab('users')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'users'
                ? 'bg-stone-800 text-gold-500'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Users
          </button>
        </div>

        {tab === 'catalog' && <ModelCatalogManager />}
        {tab === 'users' && <UserTierManager />}
      </div>
    </div>
  );
}
