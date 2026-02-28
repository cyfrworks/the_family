import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Settings, LogOut, X, Shield, MoreVertical, Trash2, Users, UserPlus, ChevronDown, Minus, Info, Crown } from 'lucide-react';
import { RunYourFamilyButton } from '../common/RunYourFamilyButton';
import { TIER_LABELS, TIER_COLORS } from '../../config/constants';
import { useAuth } from '../../contexts/AuthContext';
import { useSitDowns } from '../../hooks/useSitDowns';
import { useCommission } from '../../hooks/useCommission';
import { useCommissionSitDowns } from '../../hooks/useCommissionSitDowns';
import { useRealtimeStatus } from '../../hooks/useRealtimeStatus';
import { useEffect, useRef, useState } from 'react';
import { CreateSitdownModal } from '../sitdown/CreateSitdownModal';
import { CreateCommissionSitDownModal } from '../commission/CreateCommissionSitDownModal';
import { InviteToCommissionModal } from '../commission/InviteToCommissionModal';
import { PendingInvitesBanner } from '../commission/PendingInvitesBanner';
import { toast } from 'sonner';

function SitDownTooltip({ description }: { description: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click (for mobile tap-to-open)
  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [show]);

  return (
    <span
      ref={ref}
      className="relative ml-auto shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShow((s) => !s);
      }}
    >
      <Info size={12} className="text-stone-600 hover:text-stone-400 transition-colors" />
      {show && (
        <span className="absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-normal rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-[11px] leading-tight text-stone-300 shadow-lg w-48">
          {description}
        </span>
      )}
    </span>
  );
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, isGodfather, tier, signOut } = useAuth();
  const realtimeConnected = useRealtimeStatus();
  const { sitDowns, deleteSitDown, refetch: refetchSitDowns } = useSitDowns();
  const { contacts, pendingInvites, sentInvites, acceptInvite, declineInvite, removeContact } = useCommission();
  const { sitDowns: commissionSitDowns, deleteSitDown: deleteCommissionSitDown } = useCommissionSitDowns();
  const location = useLocation();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showCommissionCreate, setShowCommissionCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCommission, setShowCommission] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  function handleSignOut() {
    signOut();
    navigate('/login');
  }

  function renderSitDownItem(sd: { id: string; name: string; description?: string | null }, icon: React.ReactNode, onDelete: (id: string) => Promise<void>) {
    return (
      <div key={sd.id} className="group relative">
        <Link
          to={`/sitdown/${sd.id}`}
          onClick={onClose}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 pr-8 text-sm transition-colors ${
            location.pathname === `/sitdown/${sd.id}`
              ? 'bg-stone-800 text-gold-500'
              : 'text-stone-300 hover:bg-stone-800/50 hover:text-stone-100'
          }`}
        >
          {icon}
          <span className="truncate">{sd.name}</span>
          {sd.description && <SitDownTooltip description={sd.description} />}
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(menuOpen === sd.id ? null : sd.id);
          }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-stone-500 hover:bg-stone-700 hover:text-stone-300 transition-opacity ${
            menuOpen === sd.id ? 'opacity-100' : 'lg:opacity-0 lg:group-hover:opacity-100'
          }`}
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen === sd.id && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-stone-700 bg-stone-800 py-1 shadow-lg">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                setMenuOpen(null);
                if (confirm('End this sit-down? There\'s no coming back from this.')) {
                  try {
                    await onDelete(sd.id);
                    if (location.pathname === `/sitdown/${sd.id}`) {
                      navigate('/');
                    }
                    toast.success('The sit-down is over.');
                  } catch {
                    toast.error('Couldn\'t end the sit-down.');
                  }
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-stone-700"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-stone-800 bg-stone-900 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 px-4 py-4">
          <Link to="/" className="flex items-center gap-2" onClick={onClose}>
            <img src="/logo.png" alt="The Family" className="h-8 w-8 rounded-lg" />
            <h1 className="font-serif text-xl font-bold text-gold-500">The Family</h1>
          </Link>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200 lg:hidden">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Personal Sit-downs */}
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-stone-500">
            Sit-downs
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="mb-2 w-full rounded-lg bg-gold-600 px-3 py-2 text-center font-serif text-sm font-bold text-stone-950 hover:bg-gold-500 transition-colors"
          >
            Call a Sit-down
          </button>

          <div className="space-y-0.5">
            {sitDowns.map((sd) =>
              renderSitDownItem(sd, <MessageSquare size={16} className="shrink-0" />, deleteSitDown)
            )}

            {sitDowns.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-stone-600">
                No sit-downs yet. Start one.
              </p>
            )}
          </div>

          {/* Commission Sit-downs */}
          <div className="mt-6 border-t border-stone-800 pt-4">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-stone-500">
              Commission Sit-downs
            </span>
            <button
              onClick={() => setShowCommissionCreate(true)}
              className="mb-2 w-full rounded-lg bg-gold-600 px-3 py-2 text-center font-serif text-sm font-bold text-stone-950 hover:bg-gold-500 transition-colors"
            >
              Call a Sit-down
            </button>

            <div className="space-y-0.5">
              {commissionSitDowns.map((sd) =>
                renderSitDownItem(sd, <Users size={16} className="shrink-0" />, deleteCommissionSitDown)
              )}

              {commissionSitDowns.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-stone-600">
                  No commission sit-downs yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="border-t border-stone-800 p-3 space-y-0.5">
          {/* The Commission — contact list */}
          <div>
            <button
              onClick={() => setShowCommission((s) => !s)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-300 hover:bg-stone-800/50 hover:text-stone-100 transition-colors"
            >
              <Users size={16} />
              <span className="flex-1 text-left">The Commission</span>
              {pendingInvites.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-600 px-1 text-[10px] font-bold text-stone-950">
                  {pendingInvites.length}
                </span>
              )}
              <ChevronDown size={14} className={`text-stone-500 transition-transform ${showCommission ? 'rotate-180' : ''}`} />
            </button>

            {showCommission && (
              <div className="ml-2 mt-1 space-y-1.5 border-l border-stone-800 pl-3 pb-1">
                <PendingInvitesBanner
                  invites={pendingInvites}
                  onAccept={acceptInvite}
                  onDecline={declineInvite}
                />

                {/* Outgoing pending invites */}
                {sentInvites.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1 opacity-60">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-700 text-[9px] font-bold text-stone-400">
                      {c.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                    </div>
                    <span className="flex-1 truncate text-xs italic text-stone-500">
                      {c.contact_profile?.display_name ?? 'Don'}
                    </span>
                    <span className="text-[10px] text-stone-600">Pending...</span>
                  </div>
                ))}

                {/* Contact list */}
                {contacts.map((c) => (
                  <div key={c.id} className="group flex items-center gap-2 rounded-md px-2 py-1">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-600 text-[9px] font-bold text-stone-950">
                      {c.contact_profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
                    </div>
                    <span className="flex-1 truncate text-xs text-stone-400">
                      {c.contact_profile?.display_name ?? 'Don'}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${c.contact_profile?.display_name ?? 'this Don'} from The Commission?`)) {
                          removeContact(c.contact_user_id);
                        }
                      }}
                      className="rounded p-0.5 text-stone-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                    >
                      <Minus size={12} />
                    </button>
                  </div>
                ))}

                {contacts.length === 0 && pendingInvites.length === 0 && sentInvites.length === 0 && (
                  <p className="px-2 py-1 text-[11px] text-stone-600">No contacts yet.</p>
                )}

                <button
                  onClick={() => setShowInvite(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-gold-500 hover:bg-stone-800 transition-colors"
                >
                  <UserPlus size={12} />
                  Invite a Don
                </button>
              </div>
            )}
          </div>

          <Link
            to="/members"
            onClick={onClose}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              location.pathname === '/members'
                ? 'bg-stone-800 text-gold-500'
                : 'text-stone-300 hover:bg-stone-800/50 hover:text-stone-100'
            }`}
          >
            <Shield size={16} />
            <span>Members</span>
          </Link>
          {isGodfather && (
            <Link
              to="/admin"
              onClick={onClose}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                location.pathname === '/admin'
                  ? 'bg-stone-800 text-gold-500'
                  : 'text-stone-300 hover:bg-stone-800/50 hover:text-stone-100'
              }`}
            >
              <Crown size={16} />
              <span>Admin</span>
            </Link>
          )}
          <Link
            to="/settings"
            onClick={onClose}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              location.pathname === '/settings'
                ? 'bg-stone-800 text-gold-500'
                : 'text-stone-300 hover:bg-stone-800/50 hover:text-stone-100'
            }`}
          >
            <Settings size={16} />
            <span>Settings</span>
          </Link>
          <div className="mt-1 flex justify-center">
            <RunYourFamilyButton compact className="w-full" />
          </div>
        </div>

        {/* User */}
        <div className="border-t border-stone-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-600 text-sm font-bold text-stone-950">
                {profile?.display_name?.[0]?.toUpperCase() ?? 'D'}
              </div>
              <div className="min-w-0">
                <span className="block truncate text-sm text-stone-300">
                  {profile?.display_name ?? 'Don'}
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold ${TIER_COLORS[tier]}`}>
                    {TIER_LABELS[tier]}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                    realtimeConnected
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : 'bg-red-900/50 text-red-400'
                  }`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                      realtimeConnected ? 'bg-emerald-400' : 'bg-red-400'
                    }`} />
                    {realtimeConnected ? 'Wired in' : 'Dark'}
                  </span>
                </span>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-md p-1.5 text-stone-400 hover:bg-stone-800 hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {showCreate && (
        <CreateSitdownModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            onClose();
            refetchSitDowns();
            navigate(`/sitdown/${id}`);
          }}
        />
      )}

      {showCommissionCreate && (
        <CreateCommissionSitDownModal
          onClose={() => setShowCommissionCreate(false)}
          onCreated={(id) => {
            setShowCommissionCreate(false);
            onClose();
            navigate(`/sitdown/${id}`);
          }}
        />
      )}

      {showInvite && (
        <InviteToCommissionModal onClose={() => setShowInvite(false)} />
      )}
    </>
  );
}
