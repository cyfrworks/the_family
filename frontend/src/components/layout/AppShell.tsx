import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Toaster } from 'sonner';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-stone-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex items-center border-b border-stone-800 px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-stone-400 hover:text-stone-200"
          >
            <Menu size={22} />
          </button>
          <h1 className="ml-3 font-serif text-lg font-bold text-gold-500">The Family</h1>
        </div>

        <main className="relative flex-1 overflow-hidden">
          <img src="/logo.png" alt="" className="pointer-events-none absolute inset-0 m-auto w-[500px] max-w-none opacity-15" />
          <div className="relative h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: '#1c1917',
            border: '1px solid #44403c',
            color: '#e7e5e4',
          },
        }}
      />
    </div>
  );
}
