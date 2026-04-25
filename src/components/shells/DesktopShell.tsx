import { ReactNode } from 'react';
import { Map as MapIcon, Trash2 } from 'lucide-react';

import { Trip, TripSummary } from '../../types';

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
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <aside className="flex w-72 shrink-0 flex-col bg-slate-900">
        <div className="p-6">
          <button type="button" className="mb-10 flex items-center gap-3 text-left" onClick={onShowHome}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <MapIcon size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">BillMate</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Travel Expense</p>
            </div>
          </button>

          <div className="space-y-1">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Your Trips</p>
            </div>

            <div className="max-h-[calc(100vh-250px)] space-y-1 overflow-y-auto pr-1">
              {trips.map((trip) => {
                const isSelected = selectedTripId === trip.id;
                const summary = summaries[trip.id];

                return (
                  <div
                    key={trip.id}
                    onClick={() => onSelectTrip(trip.id)}
                    className={`group flex w-full cursor-pointer items-center justify-between rounded-xl p-3 transition-all ${
                      isSelected ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className={`block truncate text-sm font-semibold ${isSelected ? 'text-white' : ''}`}>{trip.name}</span>
                      <span className="block text-[10px] opacity-60">{summary?.expenseCount ?? 0} entries</span>
                    </div>
                    {isSelected ? (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveTrip(trip.id);
                        }}
                        className="p-1.5 text-slate-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}

              {trips.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-800/30 p-4 text-center">
                  <p className="text-xs font-medium text-slate-500">기록이 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-auto p-6">
          <button
            type="button"
            onClick={onShowNewTrip}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 hover:bg-indigo-500"
          >
            + New Trip
          </button>
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        <div className="h-full w-full overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
