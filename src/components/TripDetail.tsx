import { useEffect, useMemo, useState } from 'react';

import { Expense, NewExpenseInput, Trip } from '../types';
import { formatDateRange, formatKrw } from '../utils/format';
import { resolveAppliedKrwAmount } from '../utils/expenseAmount';
import { getCurrencyMeta } from '../constants/currencies';
import { ExpenseComposer } from './ExpenseComposer';
import { ExpenseList } from './ExpenseList';
import { SettlementView } from './SettlementView';

type TripTab = 'record' | 'settlement';

interface TripDetailProps {
  trip: Trip;
  expenses: Expense[];
  layoutMode: 'mobile' | 'desktop';
  onSaveExpense: (payload: NewExpenseInput, expenseId?: string) => void;
  onRemoveExpense: (expenseId: string) => void;
  onSetExpenseFinalKrwAmount: (expenseId: string, finalKrwAmount?: number) => void;
  forceTab?: TripTab;
  defaultTab?: TripTab;
}

export function TripDetail({
  trip,
  expenses,
  layoutMode,
  onSaveExpense,
  onRemoveExpense,
  onSetExpenseFinalKrwAmount,
  forceTab,
  defaultTab = 'record',
}: TripDetailProps): JSX.Element {
  const [tab, setTab] = useState<TripTab>(defaultTab);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [composerRenderKey, setComposerRenderKey] = useState(0);

  const activeTab = forceTab ?? tab;
  const isMobileRecord = layoutMode === 'mobile' && activeTab === 'record';

  const total = useMemo(() => expenses.reduce((sum, item) => sum + resolveAppliedKrwAmount(item).amount, 0), [expenses]);
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    [expenses],
  );

  const defaultPayerName = useMemo(() => {
    return trip.members.find((member) => member.id === trip.defaultPayerId)?.name ?? '미지정';
  }, [trip.defaultPayerId, trip.members]);

  const editingExpense = useMemo(() => {
    if (!editingExpenseId) {
      return null;
    }
    return sortedExpenses.find((expense) => expense.id === editingExpenseId) ?? null;
  }, [editingExpenseId, sortedExpenses]);

  useEffect(() => {
    setTab(defaultTab);
    setEditingExpenseId(null);
    setComposerOpen(false);
  }, [defaultTab, trip.id]);

  useEffect(() => {
    if (!editingExpenseId) {
      return;
    }

    if (!sortedExpenses.some((expense) => expense.id === editingExpenseId)) {
      setEditingExpenseId(null);
    }
  }, [editingExpenseId, sortedExpenses]);

  useEffect(() => {
    if (!isMobileRecord) {
      setComposerOpen(false);
    }
  }, [isMobileRecord]);

  function closeComposer(): void {
    setComposerOpen(false);
    setEditingExpenseId(null);
    setComposerRenderKey((prev) => prev + 1);
  }

  function openComposerForCreate(): void {
    setEditingExpenseId(null);
    setComposerOpen(true);
  }

  function handleEditExpense(expenseId: string): void {
    setEditingExpenseId(expenseId);
    if (isMobileRecord) {
      setComposerOpen(true);
      return;
    }

    if (!forceTab) {
      setTab('record');
    }
  }

  function handleSaveExpense(payload: NewExpenseInput, expenseId?: string): void {
    onSaveExpense(payload, expenseId);
    setEditingExpenseId(null);

    if (isMobileRecord) {
      setComposerOpen(false);
      setComposerRenderKey((prev) => prev + 1);
    }
  }

  function handleRemoveExpense(expenseId: string): void {
    onRemoveExpense(expenseId);
    if (editingExpenseId === expenseId) {
      setEditingExpenseId(null);
    }
  }

  return (
    <div className="trip-detail-stack">
      <section className="panel trip-head-panel">
        <div className="trip-head-main">
          <h2>{trip.name}</h2>
          <p>{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        <div className="trip-head-metrics">
          <span>{trip.members.length}명</span>
          <strong>{formatKrw(total)}</strong>
          <span>{expenses.length}건</span>
        </div>
      </section>

      <section className="panel trip-info-panel">
        <h3>여행 정보</h3>
        <div className="trip-info-grid">
          <p>
            <b>멤버</b>
            <span>{trip.members.map((member) => member.name).join(', ')}</span>
          </p>
          <p>
            <b>기본 통화</b>
            <span>
              {trip.defaultCurrency} ({getCurrencyMeta(trip.defaultCurrency).name})
            </span>
          </p>
          <p>
            <b>기본 결제자</b>
            <span>{defaultPayerName}</span>
          </p>
        </div>
      </section>

      {forceTab ? null : (
        <div className="tab-row">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'record' ? 'tab-btn-active' : ''}`}
            onClick={() => setTab('record')}
          >
            기록 탭
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'settlement' ? 'tab-btn-active' : ''}`}
            onClick={() => setTab('settlement')}
          >
            정산 탭
          </button>
        </div>
      )}

      {activeTab === 'record' ? (
        <>
          {isMobileRecord ? (
            <section className="panel record-role-panel">
              <h3>기록 모드</h3>
              <p className="hint-text">여행 중에는 + 지출 추가 버튼으로 빠르게 기록하세요.</p>
            </section>
          ) : (
            <ExpenseComposer
              trip={trip}
              quickMode={false}
              editingExpense={editingExpense}
              onSaveExpense={handleSaveExpense}
              onCancelEdit={() => setEditingExpenseId(null)}
            />
          )}

          <ExpenseList
            expenses={sortedExpenses}
            members={trip.members}
            editingExpenseId={editingExpenseId}
            onEdit={handleEditExpense}
            onRemove={handleRemoveExpense}
          />

          {isMobileRecord ? (
            <button type="button" className="floating-add-btn" onClick={openComposerForCreate}>
              + 지출 추가
            </button>
          ) : null}

          {isMobileRecord && isComposerOpen ? (
            <div className="sheet-overlay" role="presentation" onClick={closeComposer}>
              <section
                className="bottom-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="지출 추가"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="bottom-sheet-head">
                  <strong>{editingExpense ? '지출 수정' : '지출 추가'}</strong>
                  <button type="button" className="text-btn" onClick={closeComposer}>
                    닫기
                  </button>
                </div>

                <div className="bottom-sheet-body">
                  <ExpenseComposer
                    key={`mobile-composer-${trip.id}-${composerRenderKey}-${editingExpenseId ?? 'new'}`}
                    trip={trip}
                    quickMode
                    editingExpense={editingExpense}
                    onSaveExpense={handleSaveExpense}
                    onCancelEdit={() => setEditingExpenseId(null)}
                  />
                </div>
              </section>
            </div>
          ) : null}
        </>
      ) : (
        <SettlementView
          trip={trip}
          expenses={sortedExpenses}
          layoutMode={layoutMode}
          onSetExpenseFinalKrwAmount={onSetExpenseFinalKrwAmount}
        />
      )}
    </div>
  );
}
