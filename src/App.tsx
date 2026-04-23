import { useEffect, useMemo, useState } from 'react';

import { NewExpenseInput, NewTripInput, TripSummary } from './types';
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

function buildTripSummaries(
  tripIds: string[],
  expenses: ReturnType<typeof useTravelStore.getState>['expenses'],
): Record<string, TripSummary> {
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
  const updateExpense = useTravelStore((state) => state.updateExpense);
  const removeExpense = useTravelStore((state) => state.removeExpense);
  const setExpenseFinalKrwAmount = useTravelStore((state) => state.setExpenseFinalKrwAmount);

  const sortedTrips = useMemo(() => [...trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [trips]);

  const summaries = useMemo(
    () => buildTripSummaries(sortedTrips.map((trip) => trip.id), expenses),
    [expenses, sortedTrips],
  );

  const [desktopView, setDesktopView] = useState<DesktopView>('home');
  const [mobileNav, setMobileNav] = useState<MobileNav>('home');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  }, [selectedTrip, desktopView, mobileNav]);

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
          defaultTab="settlement"
        />
      );
    }

    return (
      <TripList
        trips={sortedTrips}
        summaries={summaries}
        onOpen={handleOpenTrip}
        onCreate={() => setDesktopView('new')}
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
      />
    );
  }

  if (layoutMode === 'desktop') {
    return (
      <>
        {errorMessage ? <p className="app-error-banner">{errorMessage}</p> : null}
        <DesktopShell
          trips={sortedTrips}
          summaries={summaries}
          selectedTripId={selectedTrip?.id ?? null}
          onSelectTrip={handleOpenTrip}
          onShowHome={() => setDesktopView('home')}
          onShowNewTrip={() => setDesktopView('new')}
        >
          {renderDesktopContent()}
        </DesktopShell>
      </>
    );
  }

  const mobileTitle =
    mobileNav === 'new'
      ? '새 여행 만들기'
      : mobileNav === 'settlement'
        ? selectedTrip?.name ? `${selectedTrip.name} 정산` : '정산'
        : mobileNav === 'record'
          ? selectedTrip?.name ?? '기록'
          : '여행 목록';

  const mobileSubtitle =
    selectedTrip && (mobileNav === 'record' || mobileNav === 'settlement')
      ? `${selectedTrip.startDate} ~ ${selectedTrip.endDate}`
      : undefined;

  return (
    <>
      {errorMessage ? <p className="app-error-banner">{errorMessage}</p> : null}
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
    </>
  );
}
