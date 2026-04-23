import { ReactNode } from 'react';

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
    <main className="mobile-shell">
      <header className="mobile-header">
        <div className="mobile-header-top">
          {canBack ? (
            <button type="button" className="icon-btn" onClick={onBack} aria-label="뒤로 가기">
              ←
            </button>
          ) : (
            <span className="icon-btn-placeholder" aria-hidden="true" />
          )}
          <div>
            <strong>{title}</strong>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
      </header>

      <section className="mobile-content">{children}</section>

      <nav className="mobile-bottom-nav" aria-label="모바일 내비게이션">
        <button
          type="button"
          className={`mobile-nav-btn ${activeNav === 'home' || activeNav === 'new' ? 'mobile-nav-btn-active' : ''}`}
          onClick={() => onChangeNav('home')}
        >
          목록
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${activeNav === 'record' ? 'mobile-nav-btn-active' : ''}`}
          onClick={() => onChangeNav('record')}
          disabled={!canOpenRecord}
        >
          기록
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${activeNav === 'settlement' ? 'mobile-nav-btn-active' : ''}`}
          onClick={() => onChangeNav('settlement')}
          disabled={!canOpenSettlement}
        >
          정산
        </button>
      </nav>
    </main>
  );
}
