import { Trip, TripSummary } from '../types';
import { TripCard } from './TripCard';

interface TripListProps {
  trips: Trip[];
  summaries: Record<string, TripSummary>;
  onOpen: (tripId: string) => void;
  onCreate: () => void;
}

export function TripList({ trips, summaries, onOpen, onCreate }: TripListProps): JSX.Element {
  if (trips.length === 0) {
    return (
      <section className="panel empty-state">
        <h2>여행이 아직 없습니다</h2>
        <p>첫 여행을 만들고 지출을 기록해보세요.</p>
        <button type="button" className="primary-btn" onClick={onCreate}>
          + 새 여행 만들기
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>여행 목록</h2>
        <button type="button" className="primary-btn" onClick={onCreate}>
          + 새 여행 만들기
        </button>
      </div>

      <div className="trip-list">
        {trips.map((trip) => {
          const summary = summaries[trip.id] ?? { tripId: trip.id, expenseCount: 0, totalKrw: 0 };
          return <TripCard key={trip.id} trip={trip} summary={summary} onOpen={onOpen} />;
        })}
      </div>
    </section>
  );
}
