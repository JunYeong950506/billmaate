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
    <main className="sample-mobile-shell">
      <header className="sample-mobile-header">
        <div className="sample-mobile-header-top">
          {canBack ? (
            <button type="button" className="sample-mobile-back-btn" onClick={onBack} aria-label="뒤로 가기">
              ←
            </button>
          ) : (
            <span className="sample-mobile-back-placeholder" aria-hidden="true" />
          )}

          <div className="sample-mobile-top-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="sample-mobile-title-wrap">
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>

      <section className="sample-mobile-content">{children}</section>

      <nav className="sample-mobile-nav" aria-label="모바일 내비게이션">
        <button
          type="button"
          className={`sample-mobile-nav-item ${activeNav === 'home' ? 'sample-mobile-nav-item-active' : ''}`}
          onClick={() => onChangeNav('home')}
        >
          <span className="sample-mobile-nav-icon" aria-hidden="true">
            ⌂
          </span>
          <span>목록</span>
        </button>

        <button
          type="button"
          className={`sample-mobile-nav-item ${activeNav === 'record' ? 'sample-mobile-nav-item-active' : ''}`}
          onClick={() => onChangeNav('record')}
          disabled={!canOpenRecord}
        >
          <span className="sample-mobile-nav-icon" aria-hidden="true">
            ◎
          </span>
          <span>지출</span>
        </button>

        <div className="sample-mobile-create-wrap">
          <button
            type="button"
            className={`sample-mobile-create-btn ${activeNav === 'new' ? 'sample-mobile-create-btn-active' : ''}`}
            onClick={() => onChangeNav('new')}
            aria-label="새 여행 만들기"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`sample-mobile-nav-item ${activeNav === 'settlement' ? 'sample-mobile-nav-item-active' : ''}`}
          onClick={() => onChangeNav('settlement')}
          disabled={!canOpenSettlement}
        >
          <span className="sample-mobile-nav-icon" aria-hidden="true">
            ₩
          </span>
          <span>정산</span>
        </button>

        <button type="button" className="sample-mobile-nav-item sample-mobile-nav-item-disabled" disabled aria-hidden="true">
          <span className="sample-mobile-nav-icon">⋯</span>
          <span>더보기</span>
        </button>
      </nav>
    </main>
  );
}