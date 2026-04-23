import { FormEvent, useEffect, useMemo, useState } from 'react';

import { getOrderedCurrencies, getCurrencyMeta } from '../constants/currencies';
import { CurrencyCode, NewTripInput } from '../types';
import { todayIso } from '../utils/format';

interface NewTripFormProps {
  onSubmit: (payload: NewTripInput) => void;
  onCancel?: () => void;
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

export function NewTripForm({ onSubmit, onCancel }: NewTripFormProps): JSX.Element {
  const defaultStartDate = todayIso();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultStartDate);
  const [membersText, setMembersText] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>('KRW');
  const [defaultPayerName, setDefaultPayerName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(() => parseMembers(membersText), [membersText]);
  const currencies = useMemo(() => getOrderedCurrencies(defaultCurrency), [defaultCurrency]);

  useEffect(() => {
    if (members.length === 0) {
      setDefaultPayerName('');
      return;
    }

    if (!members.includes(defaultPayerName)) {
      setDefaultPayerName(members[0]);
    }
  }, [members, defaultPayerName]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!name.trim()) {
      setError('여행 이름을 입력해주세요.');
      return;
    }

    if (!startDate || !endDate) {
      setError('여행 날짜를 입력해주세요.');
      return;
    }

    if (startDate > endDate) {
      setError('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    if (members.length < 2) {
      setError('멤버는 최소 2명 이상 입력해주세요.');
      return;
    }

    if (!defaultPayerName) {
      setError('기본 결제자를 선택해주세요.');
      return;
    }

    setError(null);

    onSubmit({
      name,
      startDate,
      endDate,
      members,
      defaultCurrency,
      defaultPayerName,
    });
  }

  return (
    <section className="panel">
      <h2>새 여행 만들기</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>여행 이름</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 7월 도쿄 여행" />
        </label>

        <div className="inline-fields">
          <label className="field">
            <span>시작일</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            <span>종료일</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
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
          <div className="chip-scroll">
            {currencies.map((currency) => (
              <button
                key={currency.code}
                type="button"
                className={`chip ${defaultCurrency === currency.code ? 'chip-active' : ''}`}
                onClick={() => setDefaultCurrency(currency.code)}
              >
                {currency.code}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>기본 결제자</span>
          <div className="chip-scroll">
            {members.length === 0 ? <p className="hint-text">멤버 입력 후 선택할 수 있습니다.</p> : null}
            {members.map((memberName) => (
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

        <div className="panel-muted">
          <strong>{getCurrencyMeta(defaultCurrency).code}</strong>
          <p>지출 입력 기본 통화는 {getCurrencyMeta(defaultCurrency).name}으로 설정됩니다.</p>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="actions-row">
          {onCancel ? (
            <button type="button" className="secondary-btn" onClick={onCancel}>
              취소
            </button>
          ) : null}
          <button type="submit" className="primary-btn">
            여행 저장
          </button>
        </div>
      </form>
    </section>
  );
}
