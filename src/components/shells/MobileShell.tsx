import { ReactNode } from 'react';
import { ChevronLeft, FileText, Home, MoreHorizontal, Plus, Wallet } from 'lucide-react';

type MobileNav = 'home' | 'record' | 'settlement' | 'new';

interface MobileShellProps {
  title: string;
  subtitle?: string;
  canBack: boolean;
  onBack: () => void;
  activeNav: MobileNav;
  canOpenRecord: boolean;
  canOpenSettlement: boolean;
  onChangeNav: (nav: MobileNav) => void;
  children: ReactNode;
}

export function MobileShell({
  title,
  subtitle,
  canBack,
  onBack,
  activeNav,
  canOpenRecord,
  canOpenSettlement,
  onChangeNav,
  children,
}: MobileShellProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <header className="safe-top shrink-0 border-b border-slate-200 bg-white px-6 pb-6 pt-12 shadow-sm">
        <div className="mb-4 flex h-8 items-center justify-between">
          {canBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-slate-100"
            >
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
          ) : (
            <div className="w-10" />
          )}

          <div className="flex items-center gap-1 opacity-20">
            <div className="h-1 w-1 rounded-full bg-slate-900" />
            <div className="h-1 w-1 rounded-full bg-slate-900" />
            <div className="h-1 w-1 rounded-full bg-slate-900" />
          </div>

          <div className="w-10" />
        </div>

        <div>
          <h1 className="line-clamp-1 text-xl font-bold tracking-tight text-slate-800">{title}</h1>
          {subtitle ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{subtitle}</p> : null}
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto bg-slate-50">{children}</main>

      <nav className="pb-safe-bottom flex h-[84px] shrink-0 items-center justify-around border-t border-slate-200 bg-white px-4 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
        <NavItem label="Home" icon={<Home size={22} />} active={activeNav === 'home'} onClick={() => onChangeNav('home')} />
        <NavItem
          label="Records"
          icon={<FileText size={22} />}
          active={activeNav === 'record'}
          onClick={() => onChangeNav('record')}
          disabled={!canOpenRecord}
        />
        <div className="relative -mt-10">
          <button
            type="button"
            onClick={() => onChangeNav('new')}
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl transition-all active:scale-90 ${
              activeNav === 'new' ? 'bg-indigo-700' : 'bg-slate-900'
            }`}
          >
            <Plus size={28} />
          </button>
        </div>
        <NavItem
          label="Settle"
          icon={<Wallet size={22} />}
          active={activeNav === 'settlement'}
          onClick={() => onChangeNav('settlement')}
          disabled={!canOpenSettlement}
        />
        <NavItem label="More" icon={<MoreHorizontal size={22} />} active={false} onClick={() => {}} disabled />
      </nav>
    </div>
  );
}

interface NavItemProps {
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function NavItem({ label, icon, active, disabled, onClick }: NavItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 transition-all ${
        disabled ? 'opacity-10 grayscale' : active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-500'
      }`}
    >
      <div className={`rounded-xl p-1.5 transition-colors ${active ? 'bg-indigo-50' : ''}`}>{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
    </button>
  );
}
