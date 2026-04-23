import { Expense, Member } from '../types';
import { getEstimatedKrwAmount, getFinalKrwAmount } from '../utils/expenseAmount';
import { formatKrw, formatNumber2 } from '../utils/format';

interface ExpenseListProps {
  expenses: Expense[];
  members: Member[];
  editingExpenseId: string | null;
  onEdit: (expenseId: string) => void;
  onRemove: (expenseId: string) => void;
}

export function ExpenseList({
  expenses,
  members,
  editingExpenseId,
  onEdit,
  onRemove,
}: ExpenseListProps): JSX.Element {
  const memberMap = new Map(members.map((member) => [member.id, member.name]));

  if (expenses.length === 0) {
    return (
      <section className="panel empty-state">
        <h3>등록된 지출이 없습니다</h3>
        <p>직접 입력 또는 CSV 업로드로 지출을 기록해보세요.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h3>지출 목록</h3>
      <ul className="expense-list">
        {expenses.map((expense) => {
          const payerName = memberMap.get(expense.payerId) ?? '알 수 없음';
          const participantNames = expense.participants.map((id) => memberMap.get(id) ?? id).join(', ');
          const isEditing = editingExpenseId === expense.id;
          const isForeign = expense.originalCurrency !== 'KRW';
          const estimatedKrwAmount = getEstimatedKrwAmount(expense);
          const finalKrwAmount = getFinalKrwAmount(expense);

          return (
            <li key={expense.id} className={`expense-item ${isEditing ? 'expense-item-editing' : ''}`}>
              <div className="expense-main">
                <strong>{expense.place}</strong>
                <p>{expense.date}</p>
                {expense.paymentMethod ? <p>결제수단: {expense.paymentMethod}</p> : null}

                {isForeign ? (
                  <div className="expense-amount-stack">
                    <strong className="expense-amount-primary">
                      {expense.originalCurrency} {formatNumber2(expense.originalAmount)}
                    </strong>
                    {finalKrwAmount === null ? (
                      <p className="expense-amount-secondary">예상 ~ {formatKrw(estimatedKrwAmount)}</p>
                    ) : (
                      <p className="expense-amount-secondary">
                        실제 {formatKrw(finalKrwAmount)} · 예상 {formatKrw(estimatedKrwAmount)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="expense-amount-stack">
                    <strong className="expense-amount-primary">KRW {formatNumber2(expense.originalAmount)}</strong>
                    {finalKrwAmount !== null && Math.abs(finalKrwAmount - estimatedKrwAmount) > 0.0001 ? (
                      <p className="expense-amount-secondary">실제 {formatKrw(finalKrwAmount)}</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="expense-meta">
                <p>결제자: {payerName}</p>
                <p>참여자: {participantNames}</p>
                {expense.extraAllocations.length > 0 ? (
                  <p>
                    추가할당:{' '}
                    {expense.extraAllocations
                      .map((item) => `${memberMap.get(item.memberId) ?? item.memberId} ${formatKrw(item.amount)}`)
                      .join(' / ')}
                  </p>
                ) : null}
              </div>

              <div className="expense-actions">
                <button type="button" className="text-btn" onClick={() => onEdit(expense.id)}>
                  수정
                </button>
                <button type="button" className="text-btn" onClick={() => onRemove(expense.id)}>
                  삭제
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
