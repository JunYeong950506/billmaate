import { ReactNode } from 'react';
import { ChevronLeft, FileText, Home, Settings, Wallet } from 'lucide-react';

type MobileNav = 'home' | 'record' | 'settlement' | 'settings' | 'new';

interface MobileShellProps {
  title: string;
  subtitle?: string;
  canBack: boolean;
  onBack: () => void;
  activeNav: MobileNav;
  canOpenRecord: boolean;
  canOpenSettlement: boolean;
  canOpenSettings: boolean;
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
  canOpenSettings,
  onChangeNav,
  children,
}: MobileShellProps): JSX.Element {
  const showCenterAddSlot = activeNav === 'record' && canOpenRecord;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
      <header
        className="safe-top shrink-0 border-b border-slate-200 bg-white px-6 pb-4 shadow-sm"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        {canBack ? (
          <div className="mb-3 flex items-center">
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-slate-100"
            >
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
          </div>
        ) : null}
        <div>
          <h1 className="line-clamp-1 text-xl font-bold tracking-tight text-slate-800">{title}</h1>
          {subtitle ? <p className="mt-1 text-[10px] font-bold tracking-wider text-slate-400">{subtitle}</p> : null}
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto bg-slate-50">{children}</main>

      <nav
        className={`pb-safe-bottom grid h-[92px] shrink-0 items-center border-t border-slate-200 bg-white px-4 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] ${
          showCenterAddSlot ? 'grid-cols-5' : 'grid-cols-4'
        }`}
      >
        <NavItem label="홈" icon={<Home size={22} />} active={activeNav === 'home'} onClick={() => onChangeNav('home')} />
        <NavItem
          label="지출"
          icon={<FileText size={22} />}
          active={activeNav === 'record'}
          onClick={() => onChangeNav('record')}
          disabled={!canOpenRecord}
        />
        {showCenterAddSlot ? <div aria-hidden="true" className="h-16" /> : null}
        <NavItem
          label="정산"
          icon={<Wallet size={22} />}
          active={activeNav === 'settlement'}
          onClick={() => onChangeNav('settlement')}
          disabled={!canOpenSettlement}
        />
        <NavItem
          label="설정"
          icon={<Settings size={22} />}
          active={activeNav === 'settings'}
          onClick={() => onChangeNav('settings')}
          disabled={!canOpenSettings}
        />
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
      className={`flex w-full flex-col items-center gap-1 transition-all ${
        disabled ? 'opacity-20 grayscale' : active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-500'
      }`}
    >
      <div className={`rounded-xl p-1.5 transition-colors ${active ? 'bg-indigo-50' : ''}`}>{icon}</div>
      <span className="text-[10px] font-bold tracking-tight">{label}</span>
    </button>
  );
}
