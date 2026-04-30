import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PencilLine } from 'lucide-react';

import { Expense, Trip } from '../types';
import { getFinalKrwAmount } from '../utils/expenseAmount';
import { formatDateRange, formatKrw, formatNumber2 } from '../utils/format';
import { calculateSettlement } from '../utils/settlement';

type SettlementViewMode = 'all' | 'detail' | 'result';

interface SettlementViewProps {
  trip: Trip;
  expenses: Expense[];
  layoutMode: 'mobile' | 'desktop';
  onSetExpenseFinalKrwAmount: (expenseId: string, finalKrwAmount?: number) => void;
  onRequestAddExpense?: () => void;
  onRequestEditExpense?: (expenseId: string) => void;
  mode?: SettlementViewMode;
}

interface NetState {
  className: 'status-positive' | 'status-negative' | 'status-neutral';
  label: string;
}

interface BreakdownItem {
  key: string;
  label: string;
  amount: number;
  chartValue: number;
  ratio: number;
  color: string;
}

const BREAKDOWN_COLORS = ['#6366f1', '#1e293b', '#f97316', '#3b82f6', '#8b5cf6', '#0ea5e9', '#10b981'];

function sortExpenses(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function getNetState(net: number): NetState {
  if (net > 0) {
    return {
      className: 'status-positive',
      label: '받을 금액',
    };
  }

  if (net < 0) {
    return {
      className: 'status-negative',
      label: '보낼 금액',
    };
  }

  return {
    className: 'status-neutral',
    label: '정산 완료',
  };
}

function formatSignedKrw(value: number): string {
  if (value > 0) {
    return `+${formatKrw(value)}`;
  }
  return formatKrw(value);
}

function parseDraftAmount(value: string): number | undefined | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function getLocalShare(appliedKrwAmount: number, originalAmount: number, memberKrwShare: number): number {
  if (appliedKrwAmount <= 0 || originalAmount <= 0 || memberKrwShare <= 0) {
    return 0;
  }
  return (memberKrwShare / appliedKrwAmount) * originalAmount;
}

export function SettlementView({
  trip,
  expenses,
  layoutMode,
  onSetExpenseFinalKrwAmount,
  onRequestAddExpense,
  onRequestEditExpense,
  mode = 'all',
}: SettlementViewProps): JSX.Element {
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [finalDraftMap, setFinalDraftMap] = useState<Record<string, string>>({});

  const sortedExpenses = useMemo(() => sortExpenses(expenses), [expenses]);
  const result = useMemo(() => calculateSettlement(sortedExpenses, trip.members), [sortedExpenses, trip.members]);

  const nameMap = useMemo(
    () => new Map(trip.members.map((member) => [member.id, member.name])),
    [trip.members],
  );

  const totalAppliedKrw = useMemo(
    () => result.detailRows.reduce((sum, row) => sum + row.appliedKrwAmount, 0),
    [result.detailRows],
  );

  const hasForeignExpense = useMemo(
    () => sortedExpenses.some((expense) => expense.originalCurrency !== 'KRW'),
    [sortedExpenses],
  );
  const compactKrwView = trip.defaultCurrency === 'KRW' && !hasForeignExpense;

  const breakdownItems = useMemo<BreakdownItem[]>(() => {
    const paidLines = result.lines.filter((line) => line.paid > 0);
    if (paidLines.length === 0 || totalAppliedKrw <= 0) {
      return [
        {
          key: 'empty',
          label: '기록 없음',
          amount: 0,
          chartValue: 1,
          ratio: 1,
          color: '#d9dff0',
        },
      ];
    }

    return [...paidLines]
      .sort((a, b) => b.paid - a.paid)
      .map((line, index) => ({
        key: line.memberId,
        label: nameMap.get(line.memberId) ?? line.memberId,
        amount: line.paid,
        chartValue: line.paid,
        ratio: line.paid / totalAppliedKrw,
        color: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
      }));
  }, [nameMap, result.lines, totalAppliedKrw]);

  useEffect(() => {
    const nextDraftMap: Record<string, string> = {};
    sortedExpenses.forEach((expense) => {
      const finalKrwAmount = getFinalKrwAmount(expense);
      nextDraftMap[expense.id] = finalKrwAmount === null ? '' : String(finalKrwAmount);
    });
    setFinalDraftMap(nextDraftMap);
  }, [sortedExpenses]);

  function handleChangeFinalDraft(expenseId: string, value: string): void {
    setFinalDraftMap((prev) => ({
      ...prev,
      [expenseId]: value,
    }));

    const parsed = parseDraftAmount(value);
    if (parsed === null) {
      return;
    }

    onSetExpenseFinalKrwAmount(expenseId, parsed);
    setEditMessage(null);
  }

  function applyFinalAmount(expenseId: string): void {
    const parsed = parseDraftAmount(finalDraftMap[expenseId] ?? '');
    if (parsed === null) {
      setEditMessage('실제 원화 금액은 0 이상의 숫자로 입력해주세요.');
      return;
    }

    onSetExpenseFinalKrwAmount(expenseId, parsed);
    setEditMessage(null);
  }

  function handleFinalAmountKeyDown(expenseId: string, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyFinalAmount(expenseId);
    }
  }

  function resetFinalAmount(expenseId: string): void {
    setFinalDraftMap((prev) => ({
      ...prev,
      [expenseId]: '',
    }));
    onSetExpenseFinalKrwAmount(expenseId, undefined);
    setEditMessage(null);
  }

  const showResultSection = mode !== 'detail';
  const showDetailSection = mode !== 'result';

  return (
    <section className="panel settlement-panel space-y-6">
      {showDetailSection ? (
        <section className="space-y-10 bg-slate-50/60 px-6 py-6 md:px-8 md:py-8">
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">{trip.name}</h2>
            <p className="text-sm font-bold tracking-wide text-slate-400">{formatDateRange(trip.startDate, trip.endDate)}</p>
          </div>

          <div className="-mx-6 border-t border-slate-200 md:-mx-8" />

          <div className="space-y-2 text-center">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">최종 정산</h3>
            <div className="text-5xl font-black tracking-tighter text-slate-900 md:text-7xl">
              <span className="mr-2 text-indigo-600">₩</span>
              {formatNumber2(totalAppliedKrw)}
            </div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">
              총 {sortedExpenses.length}건{trip.members.length > 0 ? ` · ${trip.members.length}명` : ''}
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm md:grid md:grid-cols-2 md:items-center md:gap-12 md:p-10">
            <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-indigo-50/70 transition-transform duration-1000 group-hover:scale-150" />

            <div className="relative z-10 h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    key={`payment-detail-donut-${trip.id}-${sortedExpenses.length}-${totalAppliedKrw}`}
                    data={breakdownItems}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={4}
                    dataKey="chartValue"
                    stroke="none"
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    {breakdownItems.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(_, __, item) => formatKrw(((item?.payload as BreakdownItem | undefined)?.amount ?? 0))}
                    contentStyle={{
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                      fontWeight: 'bold',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-slate-100 bg-white/90 text-center shadow-inner backdrop-blur-sm">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">합계</span>
                  <span className="mt-1 text-base font-black text-indigo-600">100%</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-8 space-y-6 md:mt-0">
              <h4 className="flex items-center gap-2 border-b border-slate-100 pb-4 text-lg font-bold text-slate-800">
                <div className="h-4 w-1.5 rounded-full bg-indigo-600" />
                결제자별 분포
              </h4>
              <div className="grid gap-3">
                {breakdownItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-lg font-bold text-slate-700">{item.label}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="whitespace-nowrap font-mono text-lg font-black text-slate-900">
                        ₩{formatNumber2(item.amount)}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-tight text-slate-300">
                        {item.amount > 0 ? `전체의 ${(item.ratio * 100).toFixed(1)}%` : '지출 없음'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {editMessage ? <p className="error-text">{editMessage}</p> : null}

      {showResultSection ? (
        <>
          <section className="settlement-transfer-summary">
            <h4>송금 요약</h4>
            {result.transfers.length === 0 ? (
              <p className="hint-text">현재 송금이 필요한 항목이 없습니다.</p>
            ) : (
              <ul className="settlement-transfer-list">
                {result.transfers.map((transfer, index) => (
                  <li key={`${transfer.from}-${transfer.to}-${index}`}>
                    <span>
                      {nameMap.get(transfer.from) ?? transfer.from} → {nameMap.get(transfer.to) ?? transfer.to}
                    </span>
                    <strong>{formatKrw(transfer.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="settlement-member-section">
            <h4>인원별 정산</h4>
            <div className="settlement-cards">
              {result.lines.map((line) => {
                const state = getNetState(line.net);
                return (
                  <article key={line.memberId} className="settlement-card">
                    <h5>{nameMap.get(line.memberId) ?? line.memberId}</h5>
                    <p>총 결제: {formatKrw(line.paid)}</p>
                    <p>총 부담: {formatKrw(line.burden)}</p>
                    <p className={`settlement-net-line ${state.className}`}>
                      {formatSignedKrw(line.net)}
                      <span className="status-label">{state.label}</span>
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {showDetailSection ? (
        <section className="settlement-detail-section">
          <div className="settlement-detail-head">
            <h4>정산 내역</h4>
            {onRequestAddExpense ? (
              <button type="button" className="secondary-btn" onClick={onRequestAddExpense}>
                + 지출 추가
              </button>
            ) : null}
          </div>
          <div className="settlement-detail-wrap">
            <table className="settlement-detail-table">
              <thead>
                <tr>
                  <th>수정</th>
                  <th>날짜</th>
                  <th>항목</th>
                  <th>결제수단</th>
                  <th>결제자</th>
                  <th>금액</th>
                  {compactKrwView ? null : <th>실제 원화 입력</th>}
                  <th>정산 기준 금액</th>
                  {compactKrwView ? null : <th>차이(실제-예상)</th>}
                  {trip.members.map((member) => (
                    <th key={`head-${member.id}`}>{member.name} 부담금</th>
                  ))}
                  <th>부담금 합계</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {result.detailRows.map((row) => {
                  const diffClass =
                    row.differenceFromEstimated === null
                      ? 'status-neutral'
                      : row.differenceFromEstimated > 0
                        ? 'status-positive'
                        : row.differenceFromEstimated < 0
                          ? 'status-negative'
                          : 'status-neutral';

                  const isForeign = row.originalCurrency !== 'KRW';

                  return (
                    <tr key={row.expenseId}>
                      <td>
                        {onRequestEditExpense ? (
                          <button
                            type="button"
                            className="settlement-edit-icon"
                            onClick={() => onRequestEditExpense(row.expenseId)}
                            aria-label={`${row.place} 지출 수정`}
                            title="지출 수정"
                          >
                            <PencilLine size={15} />
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{row.date}</td>
                      <td>{row.place}</td>
                      <td>{row.paymentMethod ?? '-'}</td>
                      <td>{nameMap.get(row.payerId) ?? row.payerId}</td>
                      <td>
                        <div className="settlement-original-amount">
                          <strong>
                            {row.originalCurrency} {formatNumber2(row.originalAmount)}
                          </strong>
                          {isForeign ? (
                            <>
                              <p className="hint-text">예상 {formatKrw(row.estimatedKrwAmount)}</p>
                              {row.finalKrwAmount !== null ? <p className="hint-text">실제 {formatKrw(row.finalKrwAmount)}</p> : null}
                            </>
                          ) : null}
                        </div>
                      </td>

                      {compactKrwView ? null : (
                        <td>
                          <div className="final-amount-editor">
                            <input
                              value={finalDraftMap[row.expenseId] ?? ''}
                              onChange={(event) => handleChangeFinalDraft(row.expenseId, event.target.value)}
                              onBlur={() => applyFinalAmount(row.expenseId)}
                              onKeyDown={(event) => handleFinalAmountKeyDown(row.expenseId, event)}
                              inputMode="decimal"
                              placeholder="직접입력"
                              aria-label="실제 원화 금액"
                            />
                            <button
                              type="button"
                              className="text-btn final-amount-reset"
                              onClick={() => resetFinalAmount(row.expenseId)}
                            >
                              초기화
                            </button>
                          </div>
                        </td>
                      )}

                      <td>
                        <strong>{formatKrw(row.appliedKrwAmount)}</strong>
                        {compactKrwView ? null : (
                          <p className="hint-text">{row.amountSource === 'final' ? '실제 확정 금액 사용' : '예상 금액 임시 사용'}</p>
                        )}
                      </td>

                      {compactKrwView ? null : (
                        <td className={diffClass}>
                          {row.differenceFromEstimated === null ? '-' : formatSignedKrw(row.differenceFromEstimated)}
                        </td>
                      )}

                      {trip.members.map((member) => {
                        const memberKrwShare = row.memberDisplayShares[member.id] ?? 0;
                        const memberLocalShare = isForeign
                          ? getLocalShare(row.appliedKrwAmount, row.originalAmount, memberKrwShare)
                          : 0;

                        return (
                          <td key={`${row.expenseId}-${member.id}`} className="settlement-member-share-cell">
                            {isForeign ? (
                              <div className="settlement-member-share">
                                <strong>
                                  {row.originalCurrency} {formatNumber2(memberLocalShare)}
                                </strong>
                                <p className="hint-text">{row.amountSource === 'final' ? '실제' : '예상'} {formatKrw(memberKrwShare)}</p>
                              </div>
                            ) : (
                              formatKrw(memberKrwShare)
                            )}
                          </td>
                        );
                      })}
                      <td>
                        {isForeign ? (
                          <div className="settlement-member-share">
                            <strong>
                              {row.originalCurrency} {formatNumber2(row.originalAmount)}
                            </strong>
                            <p className="hint-text">{row.amountSource === 'final' ? '실제' : '예상'} {formatKrw(row.memberDisplayShareTotal)}</p>
                          </div>
                        ) : (
                          formatKrw(row.memberDisplayShareTotal)
                        )}
                      </td>
                      <td>{row.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {layoutMode === 'mobile' ? (
            <p className="hint-text">
              {compactKrwView ? '모바일에서는 표를 가로로 스크롤해 멤버별 부담금과 분배 근거를 확인하세요.' : '모바일에서는 표를 가로로 스크롤해 실제 금액 입력과 멤버별 부담금을 확인하세요.'}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
