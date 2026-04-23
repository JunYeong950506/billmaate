import { Expense, Member, Transfer } from '../types';
import {
  AppliedKrwSource,
  getEstimatedKrwAmount,
  getFinalKrwAmount,
  resolveAppliedKrwAmount,
} from './expenseAmount';

export interface SettlementLine {
  memberId: string;
  paid: number;
  burden: number;
  net: number;
}

export interface SettlementDetailRow {
  expenseId: string;
  date: string;
  place: string;
  paymentMethod?: string;
  payerId: string;
  originalAmount: number;
  originalCurrency: string;
  estimatedKrwAmount: number;
  finalKrwAmount: number | null;
  appliedKrwAmount: number;
  amountSource: AppliedKrwSource;
  differenceFromEstimated: number | null;
  memberShares: Record<string, number>;
  memberDisplayShares: Record<string, number>;
  memberDisplayShareTotal: number;
  note: string;
}

export interface SettlementResult {
  lines: SettlementLine[];
  transfers: Transfer[];
  detailRows: SettlementDetailRow[];
}

const EPSILON = 1e-9;

function nearZero(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function buildDisplayShareMap(
  memberIds: string[],
  rawShares: Record<string, number>,
  targetAmount: number,
): Record<string, number> {
  const entries = memberIds.map((memberId) => ({
    memberId,
    raw: Math.max(0, nearZero(rawShares[memberId] ?? 0)),
  }));

  if (entries.length === 0) {
    return {};
  }

  const targetCents = Math.round(targetAmount * 100);
  const rawCents = entries.map((entry) => entry.raw * 100);
  const floorCents = rawCents.map((value) => Math.floor(value + EPSILON));
  const cents = [...floorCents];

  const fractionalOrderDesc = entries
    .map((entry, index) => ({
      index,
      frac: rawCents[index] - floorCents[index],
      raw: entry.raw,
    }))
    .sort((a, b) => b.frac - a.frac || b.raw - a.raw);

  const fractionalOrderAsc = [...fractionalOrderDesc].sort((a, b) => a.frac - b.frac || b.raw - a.raw);

  let diff = targetCents - sum(cents);

  if (diff > 0 && fractionalOrderDesc.length > 0) {
    let pointer = 0;
    while (diff > 0) {
      const candidate = fractionalOrderDesc[pointer % fractionalOrderDesc.length];
      cents[candidate.index] += 1;
      diff -= 1;
      pointer += 1;
    }
  }

  if (diff < 0 && fractionalOrderAsc.length > 0) {
    let pointer = 0;
    while (diff < 0) {
      const candidate = fractionalOrderAsc[pointer % fractionalOrderAsc.length];
      if (cents[candidate.index] > 0) {
        cents[candidate.index] -= 1;
        diff += 1;
      }
      pointer += 1;
      if (pointer > 10000) {
        break;
      }
    }
  }

  const result: Record<string, number> = {};
  entries.forEach((entry, index) => {
    result[entry.memberId] = cents[index] / 100;
  });
  return result;
}

export function calculateSettlement(expenses: Expense[], members: Member[]): SettlementResult {
  const memberIds = members.map((member) => member.id);
  const memberNameMap = new Map(members.map((member) => [member.id, member.name]));

  const burden: Record<string, number> = {};
  const paid: Record<string, number> = {};

  memberIds.forEach((memberId) => {
    burden[memberId] = 0;
    paid[memberId] = 0;
  });

  const detailRows: SettlementDetailRow[] = expenses.map((expense) => {
    const rawShares: Record<string, number> = {};
    memberIds.forEach((memberId) => {
      rawShares[memberId] = 0;
    });

    const estimatedKrwAmount = getEstimatedKrwAmount(expense);
    const finalKrwAmount = getFinalKrwAmount(expense);
    const applied = resolveAppliedKrwAmount(expense);
    const appliedKrwAmount = applied.amount;

    if (paid[expense.payerId] === undefined) {
      paid[expense.payerId] = 0;
    }
    paid[expense.payerId] += appliedKrwAmount;

    const noteParts: string[] = [];

    if (applied.source === 'final') {
      noteParts.push('실제 원화 금액 기준');
    } else {
      noteParts.push('예상 원화 금액 임시 사용');
    }

    if (expense.participants.length === 0) {
      rawShares[expense.payerId] = (rawShares[expense.payerId] ?? 0) + appliedKrwAmount;
      noteParts.push('참여 인원이 없어 결제자에게 전액 배분');
    } else {
      const extraMap = new Map(expense.extraAllocations.map((item) => [item.memberId, item.amount]));
      const extraTotal = expense.extraAllocations.reduce((acc, item) => acc + item.amount, 0);
      const splitBase = appliedKrwAmount - extraTotal;
      const perPerson = splitBase / expense.participants.length;

      expense.participants.forEach((memberId) => {
        rawShares[memberId] = (rawShares[memberId] ?? 0) + perPerson + (extraMap.get(memberId) ?? 0);
      });

      if (expense.extraAllocations.length > 0) {
        const extraSummary = expense.extraAllocations
          .map((item) => `${memberNameMap.get(item.memberId) ?? item.memberId} +${roundTo2(item.amount).toFixed(2)}`)
          .join(', ');
        noteParts.push(`추가 할당 반영 (${extraSummary})`);
      } else {
        noteParts.push('균등 분배');
      }
    }

    memberIds.forEach((memberId) => {
      burden[memberId] += rawShares[memberId] ?? 0;
    });

    const memberDisplayShares = buildDisplayShareMap(memberIds, rawShares, appliedKrwAmount);
    const memberDisplayShareTotal = nearZero(sum(memberIds.map((memberId) => memberDisplayShares[memberId] ?? 0)));

    return {
      expenseId: expense.id,
      date: expense.date,
      place: expense.place,
      paymentMethod: expense.paymentMethod,
      payerId: expense.payerId,
      originalAmount: expense.originalAmount,
      originalCurrency: expense.originalCurrency,
      estimatedKrwAmount,
      finalKrwAmount,
      appliedKrwAmount,
      amountSource: applied.source,
      differenceFromEstimated: finalKrwAmount === null ? null : nearZero(finalKrwAmount - estimatedKrwAmount),
      memberShares: rawShares,
      memberDisplayShares,
      memberDisplayShareTotal,
      note: noteParts.join(' / ') || '-',
    };
  });

  const lines = members.map((member) => {
    const memberPaid = paid[member.id] ?? 0;
    const memberBurden = burden[member.id] ?? 0;

    return {
      memberId: member.id,
      paid: memberPaid,
      burden: memberBurden,
      net: nearZero(memberPaid - memberBurden),
    };
  });

  const netAmounts = Object.fromEntries(lines.map((line) => [line.memberId, line.net]));

  return {
    lines,
    transfers: minimumTransfers(netAmounts),
    detailRows,
  };
}

export function minimumTransfers(netAmounts: Record<string, number>): Transfer[] {
  const debtors = Object.entries(netAmounts)
    .filter(([, amount]) => amount < -EPSILON)
    .map(([memberId, amount]) => ({ memberId, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = Object.entries(netAmounts)
    .filter(([, amount]) => amount > EPSILON)
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];

    if (debtor.amount <= EPSILON) {
      debtorIndex += 1;
      continue;
    }

    if (creditor.amount <= EPSILON) {
      creditorIndex += 1;
      continue;
    }

    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > EPSILON) {
      transfers.push({
        from: debtor.memberId,
        to: creditor.memberId,
        amount,
      });
    }

    debtor.amount = nearZero(debtor.amount - amount);
    creditor.amount = nearZero(creditor.amount - amount);

    if (debtor.amount <= EPSILON) {
      debtorIndex += 1;
    }

    if (creditor.amount <= EPSILON) {
      creditorIndex += 1;
    }
  }

  return transfers;
}
