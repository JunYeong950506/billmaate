import { useEffect, useRef } from 'react';

import { Trip, TripSummary } from '../types';
import { formatDateRange, formatKrw } from '../utils/format';

interface TripCardProps {
  trip: Trip;
  summary: TripSummary;
  onOpen: (tripId: string) => void;
  onRemove: (tripId: string) => void;
}

const LONG_PRESS_MS = 700;

export function TripCard({ trip, summary, onOpen, onRemove }: TripCardProps): JSX.Element {
  const pressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  function clearPressTimer(): void {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function handlePointerDown(): void {
    longPressTriggeredRef.current = false;
    clearPressTimer();

    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onRemove(trip.id);
    }, LONG_PRESS_MS);
  }

  function handlePointerEnd(): void {
    clearPressTimer();
  }

  function handleOpen(): void {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    onOpen(trip.id);
  }

  return (
    <article className="trip-card">
      <button
        type="button"
        className="trip-card-open"
        onClick={handleOpen}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="trip-card-title-row">
          <h3>{trip.name}</h3>
          <span>{trip.members.length}명</span>
        </div>
        <p className="trip-date">{formatDateRange(trip.startDate, trip.endDate)}</p>
        <div className="trip-metrics">
          <div>
            <span className="metric-label">총 지출</span>
            <strong>{formatKrw(summary.totalKrw)}</strong>
          </div>
          <div>
            <span className="metric-label">지출 건수</span>
            <strong>{summary.expenseCount}건</strong>
          </div>
        </div>
      </button>
      <p className="trip-card-hint">길게 누르면 삭제할 수 있어요.</p>
    </article>
  );
}
