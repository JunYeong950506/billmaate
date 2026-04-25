import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Expense, NewExpenseInput, NewTripInput, Trip, TripSummary } from './types';
import { resolveAppliedKrwAmount } from './utils/expenseAmount';
import { useLayoutMode } from './hooks/useLayoutMode';
import { useTravelStore } from './store/useTravelStore';
import { NewTripForm } from './components/NewTripForm';
import { TripList } from './components/TripList';
import { TripDetail } from './components/TripDetail';
import { DesktopShell } from './components/shells/DesktopShell';
import { MobileShell } from './components/shells/MobileShell';

type DesktopView = 'home' | 'new' | 'detail';
type MobileNav = 'home' | 'record' | 'settlement' | 'new';

interface RemovedTripSnapshot {
  trip: Trip;
  expenses: Expense[];
}

function buildTripSummaries(tripIds: string[], expenses: Expense[]): Record<string, TripSummary> {
  const initial = tripIds.reduce<Record<string, TripSummary>>((acc, tripId) => {
    acc[tripId] = { tripId, expenseCount: 0, totalKrw: 0 };
    return acc;
  }, {});

  expenses.forEach((expense) => {
    const summary = initial[expense.tripId] ?? { tripId: expense.tripId, expenseCount: 0, totalKrw: 0 };
    summary.expenseCount += 1;
    summary.totalKrw += resolveAppliedKrwAmount(expense).amount;
    initial[expense.tripId] = summary;
  });

  return initial;
}

export default function App(): JSX.Element {
  const layoutMode = useLayoutMode();

  const trips = useTravelStore((state) => state.trips);
  const expenses = useTravelStore((state) => state.expenses);
  const createTrip = useTravelStore((state) => state.createTrip);
  const addExpense = useTravelStore((state) => state.addExpense);
  const updateTrip = useTravelStore((state) => state.updateTrip);
  const updateExpense = useTravelStore((state) => state.updateExpense);
  const removeExpense = useTravelStore((state) => state.removeExpense);
  const removeTrip = useTravelStore((state) => state.removeTrip);
  const restoreTripWithExpenses = useTravelStore((state) => state.restoreTripWithExpenses);
  const setExpenseFinalKrwAmount = useTravelStore((state) => state.setExpenseFinalKrwAmount);

  const sortedTrips = useMemo(() => [...trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [trips]);
  const summaries = useMemo(() => buildTripSummaries(sortedTrips.map((trip) => trip.id), expenses), [expenses, sortedTrips]);

  const [desktopView, setDesktopView] = useState<DesktopView>('home');
  const [mobileNav, setMobileNav] = useState<MobileNav>('home');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removedTripSnapshot, setRemovedTripSnapshot] = useState<RemovedTripSnapshot | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const selectedTrip = useMemo(
    () => sortedTrips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, sortedTrips],
  );

  const selectedTripExpenses = useMemo(() => {
    if (!selectedTrip) {
      return [];
    }

    return expenses.filter((expense) => expense.tripId === selectedTrip.id);
  }, [expenses, selectedTrip]);

  useEffect(() => {
    if (!selectedTripId) {
      return;
    }

    if (!sortedTrips.some((trip) => trip.id === selectedTripId)) {
      setSelectedTripId(null);
      setDesktopView('home');
      setMobileNav('home');
    }
  }, [selectedTripId, sortedTrips]);

  useEffect(() => {
    if (!selectedTrip && (desktopView === 'detail' || mobileNav === 'record' || mobileNav === 'settlement')) {
      setDesktopView('home');
      setMobileNav('home');
    }
  }, [desktopView, mobileNav, selectedTrip]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  function handleCreateTrip(payload: NewTripInput): void {
    try {
      const created = createTrip(payload);
      setSelectedTripId(created.id);
      setDesktopView('detail');
      setMobileNav('record');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '여행 생성 중 오류가 발생했습니다.');
    }
  }

  function handleOpenTrip(tripId: string): void {
    setSelectedTripId(tripId);
    setDesktopView('detail');
    setMobileNav('record');
    setErrorMessage(null);
  }

  function handleUpdateTrip(tripId: string, payload: NewTripInput): void {
    try {
      updateTrip(tripId, payload);
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '여행 수정 중 오류가 발생했습니다.';
      setErrorMessage(message);
      throw error;
    }
  }

  function handleSaveExpense(payload: NewExpenseInput, expenseId?: string): void {
    if (expenseId) {
      updateExpense(expenseId, payload);
    } else {
      addExpense(payload);
    }

    setErrorMessage(null);
  }

  function handleRemoveExpense(expenseId: string): void {
    removeExpense(expenseId);
  }

  function handleSetExpenseFinalKrwAmount(expenseId: string, finalKrwAmount?: number): void {
    setExpenseFinalKrwAmount(expenseId, finalKrwAmount);
  }

  function handleRemoveTrip(tripId: string): void {
    const removedTrip = sortedTrips.find((trip) => trip.id === tripId);
    if (!removedTrip) {
      return;
    }

    const removedExpenses = expenses.filter((expense) => expense.tripId === tripId);
    removeTrip(tripId);

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }

    setRemovedTripSnapshot({
      trip: removedTrip,
      expenses: removedExpenses,
    });

    undoTimerRef.current = window.setTimeout(() => {
      setRemovedTripSnapshot(null);
      undoTimerRef.current = null;
    }, 3000);

    if (selectedTripId === tripId) {
      setSelectedTripId(null);
      setDesktopView('home');
      setMobileNav('home');
    }

    setErrorMessage(null);
  }

  function handleUndoRemoveTrip(): void {
    if (!removedTripSnapshot) {
      return;
    }

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    restoreTripWithExpenses(removedTripSnapshot.trip, removedTripSnapshot.expenses);
    setRemovedTripSnapshot(null);
    setErrorMessage(null);
  }

  function renderDesktopContent(): JSX.Element {
    if (desktopView === 'new') {
      return (
        <NewTripForm
          onSubmit={handleCreateTrip}
          onCancel={() => {
            setDesktopView(selectedTrip ? 'detail' : 'home');
          }}
        />
      );
    }

    if (desktopView === 'detail' && selectedTrip) {
      return (
        <TripDetail
          trip={selectedTrip}
          expenses={selectedTripExpenses}
          layoutMode="desktop"
          onSaveExpense={handleSaveExpense}
          onRemoveExpense={handleRemoveExpense}
          onSetExpenseFinalKrwAmount={handleSetExpenseFinalKrwAmount}
          onUpdateTrip={handleUpdateTrip}
          defaultTab="settlementResult"
        />
      );
    }

    return (
      <TripList
        trips={sortedTrips}
        summaries={summaries}
        onOpen={handleOpenTrip}
        onCreate={() => setDesktopView('new')}
        onRemove={handleRemoveTrip}
        showCreateAction={false}
      />
    );
  }

  function renderMobileContent(): JSX.Element {
    if (mobileNav === 'new') {
      return (
        <NewTripForm
          onSubmit={handleCreateTrip}
          onCancel={() => {
            setMobileNav(selectedTrip ? 'record' : 'home');
          }}
        />
      );
    }

    if (mobileNav === 'record' && selectedTrip) {
      return (
        <TripDetail
          trip={selectedTrip}
          expenses={selectedTripExpenses}
          layoutMode="mobile"
          onSaveExpense={handleSaveExpense}
          onRemoveExpense={handleRemoveExpense}
          onSetExpenseFinalKrwAmount={handleSetExpenseFinalKrwAmount}
          onUpdateTrip={handleUpdateTrip}
          onRequestRecordTab={() => setMobileNav('record')}
          forceTab="record"
        />
      );
    }

    if (mobileNav === 'settlement' && selectedTrip) {
      return (
        <TripDetail
          trip={selectedTrip}
          expenses={selectedTripExpenses}
          layoutMode="mobile"
          onSaveExpense={handleSaveExpense}
          onRemoveExpense={handleRemoveExpense}
          onSetExpenseFinalKrwAmount={handleSetExpenseFinalKrwAmount}
          onUpdateTrip={handleUpdateTrip}
          onRequestRecordTab={() => setMobileNav('record')}
          forceTab="settlement"
        />
      );
    }

    return (
      <TripList
        trips={sortedTrips}
        summaries={summaries}
        onOpen={handleOpenTrip}
        onCreate={() => setMobileNav('new')}
        onRemove={handleRemoveTrip}
      />
    );
  }

  function renderUndoToast(): JSX.Element {
    return (
      <AnimatePresence>
        {removedTripSnapshot ? (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-24 left-1/2 z-[100] w-[calc(100%-48px)] max-w-md -translate-x-1/2"
          >
            <div className="flex items-center justify-between rounded-[24px] border border-white/10 bg-slate-900/95 p-6 text-white shadow-2xl backdrop-blur-2xl">
              <div className="flex flex-col">
                <span className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Archived State</span>
                <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold tracking-tight">
                  {removedTripSnapshot.trip.name} was removed.
                </span>
              </div>
              <button
                type="button"
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 hover:bg-indigo-500"
                onClick={handleUndoRemoveTrip}
              >
                Restore
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  if (layoutMode === 'desktop') {
    return (
      <>
        <AnimatePresence>
          {errorMessage ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="fixed right-8 top-8 z-[200] max-w-xs"
            >
              <div className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-5 shadow-xl">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                <p className="text-xs font-bold uppercase tracking-tighter text-orange-800">{errorMessage}</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <DesktopShell
          trips={sortedTrips}
          summaries={summaries}
          selectedTripId={selectedTrip?.id ?? null}
          onSelectTrip={handleOpenTrip}
          onRemoveTrip={handleRemoveTrip}
          onShowHome={() => setDesktopView('home')}
          onShowNewTrip={() => setDesktopView('new')}
        >
          {renderDesktopContent()}
        </DesktopShell>
        {renderUndoToast()}
      </>
    );
  }

  const mobileTitle =
    mobileNav === 'new'
      ? '새 여행 만들기'
      : mobileNav === 'settlement'
        ? selectedTrip?.name
          ? `${selectedTrip.name} 정산`
          : '정산'
        : mobileNav === 'record'
          ? selectedTrip?.name
            ? `${selectedTrip.name} 기록`
            : '기록'
          : '여행 목록';

  const mobileSubtitle =
    selectedTrip && (mobileNav === 'record' || mobileNav === 'settlement') ? `${selectedTrip.startDate} ~ ${selectedTrip.endDate}` : undefined;

  return (
    <>
      <AnimatePresence>
        {errorMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-6 right-6 top-24 z-[200]"
          >
            <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-center shadow-xl">
              <p className="text-xs font-bold uppercase tracking-tighter text-orange-800">{errorMessage}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MobileShell
        title={mobileTitle}
        subtitle={mobileSubtitle}
        canBack={mobileNav === 'new'}
        onBack={() => setMobileNav('home')}
        activeNav={mobileNav}
        canOpenRecord={Boolean(selectedTrip)}
        canOpenSettlement={Boolean(selectedTrip)}
        onChangeNav={(nextNav) => {
          if ((nextNav === 'record' || nextNav === 'settlement') && !selectedTrip) {
            return;
          }
          setMobileNav(nextNav);
        }}
      >
        {renderMobileContent()}
      </MobileShell>
      {renderUndoToast()}
    </>
  );
}
