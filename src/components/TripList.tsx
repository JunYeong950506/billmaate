import { motion } from 'motion/react';
import { ArrowRight, Calendar, Map as MapIcon, Plus, Trash2 } from 'lucide-react';

import { Trip, TripSummary } from '../types';
import { formatDateRange, formatKrw } from '../utils/format';

interface TripListProps {
  trips: Trip[];
  summaries: Record<string, TripSummary>;
  onOpen: (tripId: string) => void;
  onCreate: () => void;
  onRemove: (tripId: string) => void;
  showCreateAction?: boolean;
}

export function TripList({
  trips,
  summaries,
  onOpen,
  onCreate,
  onRemove,
  showCreateAction = true,
}: TripListProps): JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-8 py-8 pb-32">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">Your Trips</h2>
          <p className="text-sm font-medium text-slate-500">Manage and settle your travel expenses effortlessly.</p>
        </div>
        {showCreateAction ? (
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 hover:bg-indigo-500"
          >
            <Plus size={20} />
            <span>New Trip</span>
          </button>
        ) : null}
      </div>

      <div className="grid gap-6">
        {trips.map((trip, idx) => {
          const summary = summaries[trip.id] ?? { tripId: trip.id, totalKrw: 0, expenseCount: 0 };

          return (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => onOpen(trip.id)}
              className="group flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className="min-w-0 flex-1 pr-8">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-500">
                    <MapIcon size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-slate-800 transition-colors group-hover:text-indigo-600">{trip.name}</h3>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <Calendar size={12} />
                      <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-2 md:grid-cols-3">
                  <div className="flex flex-col">
                    <span className="mb-1 text-[10px] font-bold uppercase text-slate-400">Total Spent</span>
                    <span className="font-bold text-slate-900">{formatKrw(summary.totalKrw)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="mb-1 text-[10px] font-bold uppercase text-slate-400">Items</span>
                    <span className="text-sm font-semibold text-slate-600">{summary.expenseCount} entries</span>
                  </div>
                  <div className="hidden flex-col md:flex">
                    <span className="mb-1 text-[10px] font-bold uppercase text-slate-400">Base Currency</span>
                    <span className="text-sm font-semibold text-slate-600">{trip.defaultCurrency}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(trip.id);
                  }}
                  className="rounded-xl p-3 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={20} />
                </button>
                <div className="rounded-xl bg-slate-900 p-3 text-white transition-all group-hover:bg-indigo-600">
                  <ArrowRight size={20} />
                </div>
              </div>
            </motion.div>
          );
        })}

        {trips.length === 0 ? (
          <div className="rounded-[32px] border-2 border-dashed border-slate-200 bg-slate-50 py-24 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
              <MapIcon size={32} className="text-slate-300" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-slate-800">No trips recorded yet</h3>
            <p className="mx-auto mb-8 max-w-xs text-slate-500">Create your first trip to start tracking and settling expenses with your friends.</p>
            <button
              type="button"
              onClick={onCreate}
              className="rounded-xl bg-slate-900 px-8 py-3 font-bold text-white shadow-lg shadow-slate-900/10 transition-all hover:bg-indigo-600"
            >
              Start New Trip
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
