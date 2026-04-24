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
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <div className="brand-box">
          <div className="brand-line">
            <div>
              <p>BillMate</p>
              <h1>여행 경비 정산</h1>
            </div>
          </div>
          <span className="brand-sub">빠른 기록 · 신뢰 정산</span>
        </div>

        <div className="side-actions">
          <button type="button" className="primary-btn" onClick={onShowNewTrip}>
            + 새 여행
          </button>
          <button type="button" className="secondary-btn" onClick={onShowHome}>
            목록 보기
          </button>
        </div>

        <div className="side-trip-list">
          {trips.length === 0 ? <p className="hint-text">등록된 여행이 없습니다.</p> : null}
          {trips.map((trip) => {
            const summary = summaries[trip.id] ?? { tripId: trip.id, totalKrw: 0, expenseCount: 0 };
            const active = selectedTripId === trip.id;
            return (
              <div key={trip.id} className="side-trip-entry">
                <button
                  type="button"
                  className={`side-trip-btn ${active ? 'side-trip-btn-active' : ''}`}
                  onClick={() => onSelectTrip(trip.id)}
                >
                  <strong>{trip.name}</strong>
                  <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                  <span>
                    {summary.expenseCount}건 · {formatKrw(summary.totalKrw)}
                  </span>
                </button>
                <button type="button" className="text-btn side-trip-delete" onClick={() => onRemoveTrip(trip.id)}>
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="desktop-content">{children}</section>
    </main>
  );
}
