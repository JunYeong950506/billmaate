import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Expense, NewExpenseInput, NewTripInput, Trip } from '../types';
import { formatDateRange, formatKrw } from '../utils/format';
import { resolveAppliedKrwAmount } from '../utils/expenseAmount';
import { getCurrencyMeta } from '../constants/currencies';
import { ExpenseComposer } from './ExpenseComposer';
import { ExpenseList } from './ExpenseList';
import { SettlementView } from './SettlementView';
import { CurrencyPicker } from './CurrencyPicker';

type TripTab = 'record' | 'settlementDetail' | 'settlementResult';
type ForceTab = 'record' | 'settlement';

interface TripDetailProps {
  trip: Trip;
  expenses: Expense[];
  layoutMode: 'mobile' | 'desktop';
  onSaveExpense: (payload: NewExpenseInput, expenseId?: string) => void;
  onRemoveExpense: (expenseId: string) => void;
  onSetExpenseFinalKrwAmount: (expenseId: string, finalKrwAmount?: number) => void;
  onUpdateTrip: (tripId: string, payload: NewTripInput) => void;
  onRequestRecordTab?: () => void;
  forceTab?: ForceTab;
  defaultTab?: TripTab;
}

function parseMembers(value: string): string[] {
  const tokens = value
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const seen = new Set<string>();
  return tokens.filter((name) => {
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}

export function TripDetail({
  trip,
  expenses,
  layoutMode,
  onSaveExpense,
  onRemoveExpense,
  onSetExpenseFinalKrwAmount,
  onUpdateTrip,
  onRequestRecordTab,
  forceTab,
  defaultTab = 'record',
}: TripDetailProps): JSX.Element {
  const [tab, setTab] = useState<TripTab>(defaultTab);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [composerRenderKey, setComposerRenderKey] = useState(0);

  const [isTripEditing, setTripEditing] = useState(false);
  const [tripName, setTripName] = useState(trip.name);
  const [tripStartDate, setTripStartDate] = useState(trip.startDate);
  const [tripEndDate, setTripEndDate] = useState(trip.endDate);
  const [membersText, setMembersText] = useState(trip.members.map((member) => member.name).join(', '));
  const [tripDefaultCurrency, setTripDefaultCurrency] = useState(trip.defaultCurrency);
  const [defaultPayerName, setDefaultPayerName] = useState('');
  const [tripEditError, setTripEditError] = useState<string | null>(null);

  const activeTab: TripTab = forceTab === 'record' ? 'record' : tab;
  const isMobileRecord = layoutMode === 'mobile' && activeTab === 'record';

  const total = useMemo(() => expenses.reduce((sum, item) => sum + resolveAppliedKrwAmount(item).amount, 0), [expenses]);
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    [expenses],
  );

  const tripDefaultPayerName = useMemo(() => {
    return trip.members.find((member) => member.id === trip.defaultPayerId)?.name ?? trip.members[0]?.name ?? '';
  }, [trip.defaultPayerId, trip.members]);

  const editingExpense = useMemo(() => {
    if (!editingExpenseId) {
      return null;
    }
    return sortedExpenses.find((expense) => expense.id === editingExpenseId) ?? null;
  }, [editingExpenseId, sortedExpenses]);

  const parsedMembers = useMemo(() => parseMembers(membersText), [membersText]);

  useEffect(() => {
    setTab(defaultTab);
    setEditingExpenseId(null);
    setComposerOpen(false);
    setTripEditing(false);
    setTripName(trip.name);
    setTripStartDate(trip.startDate);
    setTripEndDate(trip.endDate);
    setMembersText(trip.members.map((member) => member.name).join(', '));
    setTripDefaultCurrency(trip.defaultCurrency);
    setDefaultPayerName(tripDefaultPayerName);
    setTripEditError(null);
  }, [defaultTab, trip, tripDefaultPayerName]);

  useEffect(() => {
    if (!editingExpenseId) {
      return;
    }

    if (!sortedExpenses.some((expense) => expense.id === editingExpenseId)) {
      setEditingExpenseId(null);
    }
  }, [editingExpenseId, sortedExpenses]);

  useEffect(() => {
    if (forceTab === 'record') {
      if (tab !== 'record') {
        setTab('record');
      }
      return;
    }

    if (forceTab === 'settlement' && tab === 'record') {
      setTab('settlementResult');
    }
  }, [forceTab, tab]);


  useEffect(() => {
    if (layoutMode !== 'mobile' || !isComposerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [isComposerOpen, layoutMode]);

  useEffect(() => {
    if (parsedMembers.length === 0) {
      if (defaultPayerName) {
        setDefaultPayerName('');
      }
      return;
    }

    if (!parsedMembers.includes(defaultPayerName)) {
      setDefaultPayerName(parsedMembers[0]);
    }
  }, [parsedMembers, defaultPayerName]);

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
    if (layoutMode === 'mobile') {
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

    if (layoutMode === 'mobile') {
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

  function handleCreateExpenseFromSettlement(): void {
    if (forceTab === 'settlement') {
      if (layoutMode === 'mobile') {
        openComposerForCreate();
        return;
      }
      onRequestRecordTab?.();
      return;
    }

    if (!forceTab) {
      setTab('record');
    }
    openComposerForCreate();
  }

  function handleEditExpenseFromSettlement(expenseId: string): void {
    if (forceTab === 'settlement') {
      if (layoutMode === 'mobile') {
        setEditingExpenseId(expenseId);
        setComposerOpen(true);
        return;
      }
      onRequestRecordTab?.();
      return;
    }

    if (!forceTab) {
      setTab('record');
    }
    handleEditExpense(expenseId);
  }

  function handleOpenTripEdit(): void {
    setTripName(trip.name);
    setTripStartDate(trip.startDate);
    setTripEndDate(trip.endDate);
    setMembersText(trip.members.map((member) => member.name).join(', '));
    setTripDefaultCurrency(trip.defaultCurrency);
    setDefaultPayerName(tripDefaultPayerName);
    setTripEditError(null);
    setTripEditing(true);
  }

  function handleCancelTripEdit(): void {
    setTripEditing(false);
    setTripEditError(null);
    setTripName(trip.name);
    setTripStartDate(trip.startDate);
    setTripEndDate(trip.endDate);
    setMembersText(trip.members.map((member) => member.name).join(', '));
    setTripDefaultCurrency(trip.defaultCurrency);
    setDefaultPayerName(tripDefaultPayerName);
  }

  function handleSubmitTripEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!tripName.trim()) {
      setTripEditError('여행 이름을 입력해주세요.');
      return;
    }

    if (!tripStartDate || !tripEndDate) {
      setTripEditError('여행 날짜를 입력해주세요.');
      return;
    }

    if (tripStartDate > tripEndDate) {
      setTripEditError('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    if (parsedMembers.length < 2) {
      setTripEditError('멤버는 최소 2명 이상 입력해주세요.');
      return;
    }

    if (!defaultPayerName) {
      setTripEditError('기본 결제자를 선택해주세요.');
      return;
    }

    try {
      onUpdateTrip(trip.id, {
        name: tripName,
        startDate: tripStartDate,
        endDate: tripEndDate,
        members: parsedMembers,
        defaultCurrency: tripDefaultCurrency,
        defaultPayerName,
      });
      setTripEditError(null);
      setTripEditing(false);
    } catch (error) {
      setTripEditError(error instanceof Error ? error.message : '여행 정보 수정 중 오류가 발생했습니다.');
    }
  }

  const settlementMode = activeTab === 'settlementDetail' ? 'detail' : 'result';

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
        <div className="panel-header">
          <h3>여행 정보</h3>
          {isTripEditing ? null : (
            <button type="button" className="secondary-btn" onClick={handleOpenTripEdit}>
              수정
            </button>
          )}
        </div>

        {isTripEditing ? (
          <form className="form-grid" onSubmit={handleSubmitTripEdit}>
            <label className="field">
              <span>여행 이름</span>
              <input value={tripName} onChange={(event) => setTripName(event.target.value)} placeholder="예: 7월 도쿄 여행" />
            </label>

            <div className="inline-fields">
              <label className="field">
                <span>시작일</span>
                <input type="date" value={tripStartDate} onChange={(event) => setTripStartDate(event.target.value)} />
              </label>
              <label className="field">
                <span>종료일</span>
                <input type="date" value={tripEndDate} onChange={(event) => setTripEndDate(event.target.value)} />
              </label>
            </div>

            <label className="field">
              <span>멤버 (쉼표 또는 줄바꿈)</span>
              <textarea
                value={membersText}
                onChange={(event) => setMembersText(event.target.value)}
                placeholder={'예: 민수, 지은, 태호'}
                rows={3}
              />
            </label>

            <div className="field">
              <span>기본 통화</span>
              <CurrencyPicker value={tripDefaultCurrency} onChange={setTripDefaultCurrency} modalTitle="기본 통화 선택" />
            </div>

            <div className="field">
              <span>기본 결제자</span>
              <div className="chip-scroll">
                {parsedMembers.length === 0 ? <p className="hint-text">멤버 입력 후 선택할 수 있습니다.</p> : null}
                {parsedMembers.map((memberName) => (
                  <button
                    key={memberName}
                    type="button"
                    className={`chip ${defaultPayerName === memberName ? 'chip-active' : ''}`}
                    onClick={() => setDefaultPayerName(memberName)}
                  >
                    {memberName}
                  </button>
                ))}
              </div>
            </div>

            {tripEditError ? <p className="error-text">{tripEditError}</p> : null}

            <div className="actions-row">
              <button type="button" className="secondary-btn" onClick={handleCancelTripEdit}>
                취소
              </button>
              <button type="submit" className="primary-btn">
                여행 정보 저장
              </button>
            </div>
          </form>
        ) : (
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
              <span>{tripDefaultPayerName || '미지정'}</span>
            </p>
          </div>
        )}
      </section>

      {forceTab === 'record' ? null : (
        <div className="tab-row">
          {forceTab === 'settlement' ? null : (
            <button
              type="button"
              className={`tab-btn ${activeTab === 'record' ? 'tab-btn-active' : ''}`}
              onClick={() => setTab('record')}
            >
              지출 내역
            </button>
          )}
          <button
            type="button"
            className={`tab-btn ${activeTab === 'settlementDetail' ? 'tab-btn-active' : ''}`}
            onClick={() => setTab('settlementDetail')}
          >
            정산 내역
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'settlementResult' ? 'tab-btn-active' : ''}`}
            onClick={() => setTab('settlementResult')}
          >
            정산 결과
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


        </>
      ) : (
        <SettlementView
          trip={trip}
          expenses={sortedExpenses}
          layoutMode={layoutMode}
          onSetExpenseFinalKrwAmount={onSetExpenseFinalKrwAmount}
          onRequestAddExpense={handleCreateExpenseFromSettlement}
          onRequestEditExpense={handleEditExpenseFromSettlement}
          mode={settlementMode}
        />
      )}

      {layoutMode === 'mobile' && isComposerOpen ? (
        <div className="sheet-overlay expense-composer-overlay" role="presentation" onClick={closeComposer}>
          <section
            className="bottom-sheet expense-composer-sheet"
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
    </div>
  );
}












