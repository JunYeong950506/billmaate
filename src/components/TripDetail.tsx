import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CreditCard, Download, List, Plus, Settings } from 'lucide-react';

import { Expense, NewExpenseInput, NewTripInput, Trip } from '../types';
import { formatKrw } from '../utils/format';
import { resolveAppliedKrwAmount } from '../utils/expenseAmount';
import { getCurrencyMeta } from '../constants/currencies';
import { ExpenseComposer } from './ExpenseComposer';
import { ExpenseList } from './ExpenseList';
import { SettlementView } from './SettlementView';
import { CurrencyPicker } from './CurrencyPicker';

type TripTab = 'record' | 'settlementDetail' | 'settlementResult' | 'settings';
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
  forceTab,
  defaultTab = 'record',
}: TripDetailProps): JSX.Element {
  const [tab, setTab] = useState<TripTab>(defaultTab);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isComposerOpen, setComposerOpen] = useState(false);

  const [tripName, setTripName] = useState(trip.name);
  const [tripStartDate, setTripStartDate] = useState(trip.startDate);
  const [tripEndDate, setTripEndDate] = useState(trip.endDate);
  const [membersText, setMembersText] = useState(trip.members.map((member) => member.name).join(', '));
  const [tripDefaultCurrency, setTripDefaultCurrency] = useState(trip.defaultCurrency);
  const [defaultPayerName, setDefaultPayerName] = useState('');
  const [tripEditError, setTripEditError] = useState<string | null>(null);

  const activeTab: TripTab = forceTab === 'record' ? 'record' : forceTab === 'settlement' && tab === 'record' ? 'settlementResult' : tab;

  const totalKrw = useMemo(() => expenses.reduce((sum, item) => sum + resolveAppliedKrwAmount(item).amount, 0), [expenses]);
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
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
    setTripName(trip.name);
    setTripStartDate(trip.startDate);
    setTripEndDate(trip.endDate);
    setMembersText(trip.members.map((member) => member.name).join(', '));
    setTripDefaultCurrency(trip.defaultCurrency);
    setDefaultPayerName(tripDefaultPayerName);
    setTripEditError(null);
  }, [defaultTab, trip, tripDefaultPayerName]);

  useEffect(() => {
    if (parsedMembers.length === 0) {
      setDefaultPayerName('');
      return;
    }

    if (!parsedMembers.includes(defaultPayerName)) {
      setDefaultPayerName(parsedMembers[0]);
    }
  }, [defaultPayerName, parsedMembers]);

  useEffect(() => {
    if (!editingExpenseId) {
      return;
    }

    if (!sortedExpenses.some((expense) => expense.id === editingExpenseId)) {
      setEditingExpenseId(null);
    }
  }, [editingExpenseId, sortedExpenses]);

  function closeComposer(): void {
    setComposerOpen(false);
    setEditingExpenseId(null);
  }

  function openComposerForCreate(): void {
    setEditingExpenseId(null);
    setComposerOpen(true);
  }

  function handleEditExpense(expenseId: string): void {
    setEditingExpenseId(expenseId);
    setComposerOpen(true);
  }

  function handleSaveExpense(payload: NewExpenseInput, expenseId?: string): void {
    onSaveExpense(payload, expenseId);
    closeComposer();
  }

  function handleRemoveExpense(expenseId: string): void {
    onRemoveExpense(expenseId);
    if (editingExpenseId === expenseId) {
      setEditingExpenseId(null);
    }
  }

  function handleCreateExpenseFromSettlement(): void {
    openComposerForCreate();
  }

  function handleEditExpenseFromSettlement(expenseId: string): void {
    handleEditExpense(expenseId);
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
    } catch (error) {
      setTripEditError(error instanceof Error ? error.message : '여행 정보 수정 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {layoutMode === 'desktop' && !forceTab ? (
        <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-12 py-3 shadow-sm">
          <div className="flex gap-10">
            <TabButton active={activeTab === 'record'} label="Activity Log" icon={<List size={18} />} onClick={() => setTab('record')} />
            <TabButton
              active={activeTab === 'settlementDetail' || activeTab === 'settlementResult'}
              label="Settlement"
              icon={<CreditCard size={18} />}
              onClick={() => setTab('settlementResult')}
            />
            <TabButton active={activeTab === 'settings'} label="Settings" icon={<Settings size={18} />} onClick={() => setTab('settings')} />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-indigo-600"
            onClick={() => window.print()}
          >
            <Download size={14} />
            Export PDF
          </button>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="h-full"
          >
            {activeTab === 'record' ? (
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-8 py-8 pb-32">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Expenses</p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">{formatKrw(totalKrw)}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      <p className="text-[10px] font-bold uppercase tracking-tighter text-emerald-600">Active Tracking</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Expense Balance</p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">{expenses.length} Entries</p>
                    <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-1000"
                        style={{ width: `${Math.min((expenses.length / 50) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Primary Base</p>
                    <p className="text-3xl font-bold tracking-tight text-slate-900">{trip.defaultCurrency}</p>
                    <p className="mt-2 text-xs font-medium text-slate-400">{getCurrencyMeta(trip.defaultCurrency).name}</p>
                  </div>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-2 rounded-full bg-indigo-600" />
                    <h3 className="text-xl font-bold tracking-tight text-slate-800">Activity Log</h3>
                  </div>
                  <button
                    type="button"
                    onClick={openComposerForCreate}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-indigo-600"
                  >
                    <Plus size={18} />
                    <span>Add Expense</span>
                  </button>
                </div>

                <ExpenseList
                  expenses={sortedExpenses}
                  members={trip.members}
                  editingExpenseId={editingExpenseId}
                  onEdit={handleEditExpense}
                  onRemove={handleRemoveExpense}
                />
              </div>
            ) : null}

            {activeTab === 'settlementDetail' || activeTab === 'settlementResult' ? (
              <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-8 py-8 pb-32">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Settlement Workspace</h2>
                    <p className="text-sm font-medium text-slate-500">Review detail rows first, then confirm final transfers.</p>
                  </div>
                  <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setTab('settlementDetail')}
                      className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                        activeTab === 'settlementDetail' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      정산 내역
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('settlementResult')}
                      className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                        activeTab === 'settlementResult' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      정산 결과
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <SettlementView
                    trip={trip}
                    expenses={sortedExpenses}
                    layoutMode={layoutMode}
                    onSetExpenseFinalKrwAmount={onSetExpenseFinalKrwAmount}
                    onRequestAddExpense={handleCreateExpenseFromSettlement}
                    onRequestEditExpense={handleEditExpenseFromSettlement}
                    mode={activeTab === 'settlementDetail' ? 'detail' : 'result'}
                  />
                </div>
              </div>
            ) : null}

            {activeTab === 'settings' ? (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-10 py-10 pb-32">
                <div className="space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 shadow-lg shadow-slate-900/10">
                    <Settings size={22} className="text-white" />
                  </div>
                  <h2 className="text-4xl font-bold tracking-tighter text-slate-900">Trip Configuration</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Adjustment of core trip settings</p>
                </div>

                <form onSubmit={handleSubmitTripEdit} className="space-y-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Trip Name</label>
                      <input
                        value={tripName}
                        onChange={(event) => setTripName(event.target.value)}
                        className="w-full rounded-2xl border-2 border-slate-100 bg-white p-5 text-xl font-bold text-slate-900 outline-none transition-all shadow-sm focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Departure</label>
                        <input
                          type="date"
                          value={tripStartDate}
                          onChange={(event) => setTripStartDate(event.target.value)}
                          className="w-full rounded-2xl border-2 border-slate-100 bg-white p-5 font-bold outline-none shadow-sm focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Return</label>
                        <input
                          type="date"
                          value={tripEndDate}
                          onChange={(event) => setTripEndDate(event.target.value)}
                          className="w-full rounded-2xl border-2 border-slate-100 bg-white p-5 font-bold outline-none shadow-sm focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Members</label>
                      <textarea
                        rows={4}
                        value={membersText}
                        onChange={(event) => setMembersText(event.target.value)}
                        className="w-full rounded-2xl border-2 border-slate-100 bg-white p-5 font-bold outline-none shadow-sm focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Base Currency</label>
                      <div className="rounded-2xl border-2 border-slate-100 bg-white p-2 shadow-sm">
                        <CurrencyPicker value={tripDefaultCurrency} onChange={setTripDefaultCurrency} modalTitle="기본 통화 선택" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Default Payer</label>
                      <div className="flex flex-wrap gap-2">
                        {parsedMembers.map((memberName) => (
                          <button
                            key={memberName}
                            type="button"
                            onClick={() => setDefaultPayerName(memberName)}
                            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
                              defaultPayerName === memberName
                                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {memberName}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {tripEditError ? (
                    <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">{tripEditError}</div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-900 px-10 py-3 font-bold text-white shadow-xl shadow-slate-900/10 transition-all active:scale-95 hover:bg-slate-800"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isComposerOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md"
            onClick={closeComposer}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(event) => event.stopPropagation()}
              className={`w-full overflow-y-auto border border-white/20 bg-white shadow-2xl ${
                layoutMode === 'mobile' ? 'max-h-[88vh] rounded-[28px] p-5' : 'max-h-[90vh] max-w-4xl rounded-[32px] p-8'
              }`}
            >
              <div className="mb-8 flex items-center justify-between">
                <h3 className="text-2xl font-bold tracking-tight text-slate-800">{editingExpense ? 'Edit Record' : 'Log Expense'}</h3>
                <button type="button" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500" onClick={closeComposer}>
                  Close
                </button>
              </div>
              <ExpenseComposer
                trip={trip}
                quickMode={layoutMode === 'mobile'}
                editingExpense={editingExpense}
                onSaveExpense={handleSaveExpense}
                onCancelEdit={closeComposer}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  label: string;
  icon: JSX.Element;
  onClick: () => void;
}

function TabButton({ active, label, icon, onClick }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2.5 py-4 font-bold transition-all outline-none ${
        active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <span className={active ? 'text-indigo-600' : 'text-slate-300'}>{icon}</span>
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      {active ? <motion.div layoutId="trip-tab-active" className="absolute bottom-0 left-[-4px] right-[-4px] h-0.5 rounded-full bg-indigo-600" /> : null}
    </button>
  );
}
