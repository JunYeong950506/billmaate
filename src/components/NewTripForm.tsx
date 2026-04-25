import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Globe, Users } from 'lucide-react';

import { getCurrencyMeta } from '../constants/currencies';
import { CurrencyCode, NewTripInput } from '../types';
import { todayIso } from '../utils/format';
import { CurrencyPicker } from './CurrencyPicker';

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
  const defaultDate = todayIso();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [membersText, setMembersText] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>('KRW');
  const [defaultPayerName, setDefaultPayerName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(() => parseMembers(membersText), [membersText]);

  useEffect(() => {
    if (members.length === 0) {
      setDefaultPayerName('');
      return;
    }

    if (!members.includes(defaultPayerName)) {
      setDefaultPayerName(members[0]);
    }
  }, [defaultPayerName, members]);

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
      name: name.trim(),
      startDate,
      endDate,
      members,
      defaultCurrency,
      defaultPayerName,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-10 py-10">
      <div className="space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/20">
          <Globe size={24} className="text-white" />
        </div>
        <h2 className="text-4xl font-bold tracking-tighter text-slate-900">어디로 떠나시나요?</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">새 여행의 핵심 정보를 입력해주세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Trip Name</label>
            <input
              type="text"
              required
              placeholder="예: 4월 가정 방문"
              className="w-full rounded-2xl border-2 border-slate-100 bg-white p-5 text-xl font-bold text-slate-900 outline-none transition-all placeholder:text-slate-200 focus:border-indigo-500 shadow-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Departure</label>
              <div className="trip-date-field">
                <span className="trip-field-icon" aria-hidden="true">
                  <Calendar size={18} className="text-slate-300" />
                </span>
                <input
                  type="date"
                  required
                  className="trip-date-input"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Return</label>
              <div className="trip-date-field">
                <span className="trip-field-icon" aria-hidden="true">
                  <Calendar size={18} className="text-slate-300" />
                </span>
                <input
                  type="date"
                  required
                  className="trip-date-input"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Base Currency</label>
              <div className="rounded-2xl border-2 border-slate-100 bg-white p-2 shadow-sm">
                <CurrencyPicker value={defaultCurrency} onChange={setDefaultCurrency} modalTitle="기본 통화 선택" />
              </div>
              <p className="ml-1 text-xs font-medium text-slate-400">{getCurrencyMeta(defaultCurrency).name}</p>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Members</label>
              <div className="trip-textarea-field">
                <span className="trip-field-icon trip-field-icon-top" aria-hidden="true">
                  <Users size={18} className="text-slate-300" />
                </span>
                <textarea
                  rows={4}
                  value={membersText}
                  onChange={(event) => setMembersText(event.target.value)}
                  placeholder="예: 민수, 지은, 태호"
                  className="trip-textarea-input"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Default Payer</label>
            <div className="flex flex-wrap gap-2">
              {members.length === 0 ? <p className="text-sm font-medium text-slate-400">멤버 입력 후 선택할 수 있습니다.</p> : null}
              {members.map((memberName) => (
                <button
                  key={memberName}
                  type="button"
                  onClick={() => setDefaultPayerName(memberName)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
                    defaultPayerName === memberName ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {memberName}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">{error}</div>
        ) : null}

        <div className="flex gap-4 pt-4">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-2xl border-2 border-slate-100 px-6 py-5 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-all hover:bg-slate-50"
            >
              Cancel
            </button>
          ) : null}

          <button
            type="submit"
            className="flex-[2] rounded-2xl bg-slate-900 px-6 py-5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl shadow-slate-900/10 transition-all hover:bg-indigo-600 active:scale-95"
          >
            <span className="inline-flex items-center gap-2">
              Deploy Trip
              <ArrowRight size={18} />
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
