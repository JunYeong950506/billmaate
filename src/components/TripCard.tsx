import { Trip, TripSummary } from '../types';
import { formatDateRange, formatKrw } from '../utils/format';

interface TripCardProps {
  trip: Trip;
  summary: TripSummary;
  onOpen: (tripId: string) => void;
}

export function TripCard({ trip, summary, onOpen }: TripCardProps): JSX.Element {
  return (
    <button type="button" className="trip-card" onClick={() => onOpen(trip.id)}>
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
  );
}
