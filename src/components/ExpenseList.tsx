import { Edit2, Tag, Trash2 } from 'lucide-react';

import { Expense, Member } from '../types';
import { convertKrwToOriginalAmount, getEstimatedKrwAmount, getFinalKrwAmount, resolveAppliedKrwAmount } from '../utils/expenseAmount';
import { formatKrw, formatNumber2 } from '../utils/format';

interface ExpenseListProps {
  expenses: Expense[];
  members: Member[];
  editingExpenseId: string | null;
  onEdit: (expenseId: string) => void;
  onRemove: (expenseId: string) => void;
}

function formatExtraAllocation(expense: Expense, amountKrw: number): string {
  const originalAmount = convertKrwToOriginalAmount(expense, amountKrw);
  if (originalAmount === null || expense.originalCurrency === 'KRW') {
    return formatKrw(amountKrw);
  }

  return `${expense.originalCurrency} ${formatNumber2(originalAmount)}`;
}

export function ExpenseList({
  expenses,
  members,
  editingExpenseId,
  onEdit,
  onRemove,
}: ExpenseListProps): JSX.Element {
  const memberMap = new Map(members.map((member) => [member.id, member.name]));
  const groupedByDate = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .reduce<Record<string, Expense[]>>((acc, expense) => {
      if (!acc[expense.date]) {
        acc[expense.date] = [];
      }
      acc[expense.date].push(expense);
      return acc;
    }, {});

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[32px] border-2 border-dashed border-slate-200 bg-white py-24 text-center shadow-sm">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
          <Tag size={32} className="text-slate-300" />
        </div>
        <h3 className="mb-2 text-xl font-bold text-slate-800">No expenses logged</h3>
        <p className="max-w-xs text-slate-500">직접 입력 또는 영수증 사진/매출전표 등록으로 첫 지출을 기록해보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {Object.entries(groupedByDate).map(([date, items]) => {
        const dateTotal = items.reduce((sum, item) => sum + resolveAppliedKrwAmount(item).amount, 0);

        return (
          <div key={date} className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{date}</span>
              <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-500">
                Daily sum: <span className="ml-1 font-mono font-bold text-slate-900">{formatKrw(dateTotal)}</span>
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
              {items.map((expense) => {
                const payerName = memberMap.get(expense.payerId) ?? '알 수 없음';
                const participantNames = expense.participants.map((id) => memberMap.get(id) ?? id).join(', ');
                const isEditing = editingExpenseId === expense.id;
                const isForeign = expense.originalCurrency !== 'KRW';
                const estimatedKrwAmount = getEstimatedKrwAmount(expense);
                const finalKrwAmount = getFinalKrwAmount(expense);

                return (
                  <div
                    key={expense.id}
                    className={`group flex items-center p-5 transition-all hover:bg-slate-50/80 ${isEditing ? 'bg-indigo-50/70' : ''}`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 shadow-sm transition-colors group-hover:shadow-indigo-100">
                      <span className="text-xl">•</span>
                    </div>

                    <div className="ml-4 min-w-0 flex-1 pr-4">
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="truncate text-sm font-bold uppercase tracking-tight text-slate-800 transition-colors group-hover:text-indigo-600">
                          {expense.place}
                        </h4>
                        {expense.paymentMethod ? (
                          <span className="rounded-full bg-slate-100/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                            {expense.paymentMethod}
                          </span>
                        ) : null}
                      </div>

                      <p className="text-[11px] font-bold uppercase tracking-tighter text-slate-400">
                        {payerName} · {participantNames}
                      </p>

                      {expense.extraAllocations.length > 0 ? (
                        <p className="mt-1 text-[11px] font-medium text-slate-400">
                          추가 부담금:{' '}
                          {expense.extraAllocations
                            .map((item) => `${memberMap.get(item.memberId) ?? item.memberId} ${formatExtraAllocation(expense, item.amount)}`)
                            .join(' / ')}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end text-right">
                      <div className="font-mono font-bold tracking-tight text-slate-900">
                        {isForeign ? `${expense.originalCurrency} ${formatNumber2(expense.originalAmount)}` : formatKrw(expense.originalAmount)}
                      </div>
                      {isForeign ? (
                        <span className="mt-1 text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                          {finalKrwAmount !== null ? `실제 ${formatKrw(finalKrwAmount)}` : `예상 ${formatKrw(estimatedKrwAmount)}`}
                        </span>
                      ) : null}
                    </div>

                    <div className="ml-6 flex translate-x-2 gap-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEdit(expense.id)}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-slate-400 shadow-sm transition-all hover:bg-white hover:text-indigo-600"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(expense.id)}
                        className="rounded-xl border border-red-100 bg-red-50 p-2.5 text-red-500 shadow-sm transition-all hover:bg-red-500 hover:text-white"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
