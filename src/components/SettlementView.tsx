import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import { Expense, Trip } from '../types';
import { getEstimatedKrwAmount, getFinalKrwAmount, resolveAppliedKrwAmount } from '../utils/expenseAmount';
import { formatKrw, formatNumber2, todayIso } from '../utils/format';
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
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [finalDraftMap, setFinalDraftMap] = useState<Record<string, string>>({});

  const sortedExpenses = useMemo(() => sortExpenses(expenses), [expenses]);
  const result = useMemo(() => calculateSettlement(sortedExpenses, trip.members), [sortedExpenses, trip.members]);

  const nameMap = useMemo(
    () => new Map(trip.members.map((member) => [member.id, member.name])),
    [trip.members],
  );

  const hasForeignExpense = useMemo(
    () => sortedExpenses.some((expense) => expense.originalCurrency !== 'KRW'),
    [sortedExpenses],
  );
  const compactKrwView = trip.defaultCurrency === 'KRW' && !hasForeignExpense;

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

  function handleExport(): void {
    const expenseHeader = [
      '날짜',
      '항목',
      '결제수단',
      '결제자',
      '원래 금액',
      '통화',
      '환율',
      '예상 원화 금액',
      '실제 원화 금액',
      '정산 기준 금액',
      '기준 상태',
      '참여 인원',
      '추가 할당',
    ];

    const expenseRows = sortedExpenses.map((expense) => {
      const estimatedKrwAmount = getEstimatedKrwAmount(expense);
      const finalKrwAmount = getFinalKrwAmount(expense);
      const applied = resolveAppliedKrwAmount(expense);

      return [
        expense.date,
        expense.place,
        expense.paymentMethod ?? '-',
        nameMap.get(expense.payerId) ?? expense.payerId,
        formatNumber2(expense.originalAmount),
        expense.originalCurrency,
        expense.exchangeRate ? formatNumber2(expense.exchangeRate) : '-',
        formatNumber2(estimatedKrwAmount),
        finalKrwAmount === null ? '-' : formatNumber2(finalKrwAmount),
        formatNumber2(applied.amount),
        applied.source === 'final' ? '실제 확정 금액' : '예상 금액(임시)',
        expense.participants.map((memberId) => nameMap.get(memberId) ?? memberId).join(', '),
        expense.extraAllocations.length > 0
          ? expense.extraAllocations
              .map(
                (allocation) =>
                  `${nameMap.get(allocation.memberId) ?? allocation.memberId} +${formatNumber2(allocation.amount)}`,
              )
              .join(' / ')
          : '-',
      ];
    });

    const settlementDetailHeader = [
      '날짜',
      '항목',
      '결제수단',
      '결제자',
      '원래 금액',
      '예상 원화',
      '실제 원화',
      '정산 기준 금액',
      '차이(실제-예상)',
      ...trip.members.map((member) => `${member.name} 부담금`),
      '부담금 합계',
      '비고',
    ];

    const settlementDetailRows = result.detailRows.map((row) => [
      row.date,
      row.place,
      row.paymentMethod ?? '-',
      nameMap.get(row.payerId) ?? row.payerId,
      `${row.originalCurrency} ${formatNumber2(row.originalAmount)}`,
      formatNumber2(row.estimatedKrwAmount),
      row.finalKrwAmount === null ? '-' : formatNumber2(row.finalKrwAmount),
      formatNumber2(row.appliedKrwAmount),
      row.differenceFromEstimated === null ? '-' : formatNumber2(row.differenceFromEstimated),
      ...trip.members.map((member) => formatNumber2(row.memberDisplayShares[member.id] ?? 0)),
      formatNumber2(row.memberDisplayShareTotal),
      row.note,
    ]);

    const finalSummaryHeader = ['이름', '총 결제금액', '총 부담금액', '차액(net)', '상태'];
    const finalSummaryRows = result.lines.map((line) => {
      const state = getNetState(line.net);
      return [
        nameMap.get(line.memberId) ?? line.memberId,
        formatNumber2(line.paid),
        formatNumber2(line.burden),
        formatNumber2(line.net),
        state.label,
      ];
    });

    const transferHeader = ['보내는 사람', '받는 사람', '금액'];
    const transferRows =
      result.transfers.length === 0
        ? [['없음', '없음', '0.00']]
        : result.transfers.map((transfer) => [
            nameMap.get(transfer.from) ?? transfer.from,
            nameMap.get(transfer.to) ?? transfer.to,
            formatNumber2(transfer.amount),
          ]);

    const wb = XLSX.utils.book_new();

    const wsExpense = XLSX.utils.aoa_to_sheet([expenseHeader, ...expenseRows]);
    const wsSettlementDetail = XLSX.utils.aoa_to_sheet([settlementDetailHeader, ...settlementDetailRows]);
    const wsFinal = XLSX.utils.aoa_to_sheet([
      ['송금 요약'],
      transferHeader,
      ...transferRows,
      [],
      ['인원별 정산'],
      finalSummaryHeader,
      ...finalSummaryRows,
    ]);

    XLSX.utils.book_append_sheet(wb, wsExpense, '지출 내역');
    XLSX.utils.book_append_sheet(wb, wsSettlementDetail, '정산 내역');
    XLSX.utils.book_append_sheet(wb, wsFinal, '최종 정산 결과');

    XLSX.writeFile(wb, `${trip.name}-settlement-${todayIso()}.xlsx`);
    setExportMessage('지출 내역/정산 내역/최종 정산 결과 3개 시트를 내보냈습니다.');
  }

  const headerTitle = mode === 'detail' ? '정산 내역' : mode === 'result' ? '정산 결과' : '정산';
  const showResultSection = mode !== 'detail';
  const showDetailSection = mode !== 'result';

  return (
    <section className="panel settlement-panel">
      <div className="panel-header settlement-head">
        <h3>{headerTitle}</h3>
        <button type="button" className="primary-btn" onClick={handleExport}>
          엑셀 내보내기(.xlsx)
        </button>
      </div>

      <p className="hint-text">
        {showResultSection && showDetailSection
          ? '상단에서 송금 요약과 인원별 차액을 확인하고, 하단에서 지출별 금액 확정/분배 근거를 검토할 수 있습니다.'
          : showResultSection
            ? '송금 요약과 인원별 차액을 확인해 최종 정산 결과를 검토하세요.'
            : compactKrwView
              ? '기본 통화가 원화인 여행은 지출별 분배 근거를 중심으로 검토할 수 있습니다.'
              : '지출별 실제 원화 금액을 확정하고 멤버별 분배 근거를 검토하세요.'}
      </p>
      {exportMessage ? <p className="hint-text">{exportMessage}</p> : null}
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
                  <th>지출 수정</th>
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
                                <strong>{row.originalCurrency} {formatNumber2(memberLocalShare)}</strong>
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
                            <strong>{row.originalCurrency} {formatNumber2(row.originalAmount)}</strong>
                            <p className="hint-text">{row.amountSource === 'final' ? '실제' : '예상'} {formatKrw(row.memberDisplayShareTotal)}</p>
                          </div>
                        ) : (
                          formatKrw(row.memberDisplayShareTotal)
                        )}
                      </td>
                      <td>{row.note}</td>
                      <td>
                        {onRequestEditExpense ? (
                          <button type="button" className="text-btn" onClick={() => onRequestEditExpense(row.expenseId)}>
                            수정
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
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



