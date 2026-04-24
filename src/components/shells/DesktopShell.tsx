import { ReactNode } from 'react';
import { Trip, TripSummary } from '../../types';
import { formatDateRange, formatKrw } from '../../utils/format';

interface DesktopShellProps {
  trips: Trip[];
  summaries: Record<string, TripSummary>;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  onRemoveTrip: (tripId: string) => void;
  onShowHome: () => void;
  onShowNewTrip: () => void;
  children: ReactNode;
}

export function DesktopShell({
  trips,
  summaries,
  selectedTripId,
  onSelectTrip,
  onRemoveTrip,
  onShowHome,
  onShowNewTrip,
  children,
}: DesktopShellProps): JSX.Element {
  return (
    <main className="sample-desktop-shell">
      <aside className="sample-desktop-sidebar">
        <button type="button" className="sample-brand" onClick={onShowHome}>
          <span className="sample-brand-icon" aria-hidden="true">
            ₩
          </span>
          <span className="sample-brand-text">
            <strong>BillMate</strong>
            <small>여행 경비 정산</small>
          </span>
        </button>

        <section className="sample-sidebar-section">
          <p className="sample-sidebar-label">여행 목록</p>
          <div className="sample-side-trip-list">
            {trips.length === 0 ? <p className="sample-empty-trips">등록된 여행이 없습니다.</p> : null}
            {trips.map((trip) => {
              const summary = summaries[trip.id] ?? { tripId: trip.id, totalKrw: 0, expenseCount: 0 };
              const active = selectedTripId === trip.id;
              return (
                <div key={trip.id} className={`sample-side-trip-row ${active ? 'sample-side-trip-row-active' : ''}`}>
                  <button
                    type="button"
                    className={`sample-side-trip-item ${active ? 'sample-side-trip-item-active' : ''}`}
                    onClick={() => onSelectTrip(trip.id)}
                  >
                    <span className="sample-side-trip-main">
                      <strong>{trip.name}</strong>
                      <small>{formatDateRange(trip.startDate, trip.endDate)}</small>
                    </span>
                    <span className="sample-side-trip-meta">
                      <small>{summary.expenseCount}건</small>
                      <small>{formatKrw(summary.totalKrw)}</small>
                    </span>
                    {active ? <span className="sample-side-trip-dot" aria-hidden="true" /> : null}
                  </button>
                  <button type="button" className="sample-side-trip-delete" onClick={() => onRemoveTrip(trip.id)}>
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <button type="button" className="sample-new-trip-btn" onClick={onShowNewTrip}>
          + 새 여행 만들기
        </button>
      </aside>

      <section className="sample-desktop-content">
        <div className="sample-desktop-content-inner">{children}</div>
      </section>
    </main>
  );
}