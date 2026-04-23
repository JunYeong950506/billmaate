import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { SUPPORTED_CURRENCIES, getCurrencyMeta, getOrderedCurrencies } from '../constants/currencies';
import { CurrencyCode, Expense, NewExpenseInput, Trip } from '../types';
import { fetchAiStatus, requestCsvAutoMapping, requestOcrExtraction } from '../utils/ai';
import { getEstimatedKrwAmount, getFinalKrwAmount } from '../utils/expenseAmount';
import { fetchLatestRateToKrw } from '../utils/exchangeRate';
import { normalizeCsvDate, parseCsvText, parseNumberText } from '../utils/csv';
import { clampToNonNegativeNumber, formatKrw, formatNumber2, todayIso } from '../utils/format';

type InputMode = 'direct' | 'ocr' | 'csv';
type EstimatedMode = 'rate' | 'manual';

interface CsvMapping {
  place: string;
  amount: string;
  currency: string;
  date: string;
}

interface ExpenseComposerProps {
  trip: Trip;
  quickMode: boolean;
  editingExpense: Expense | null;
  onSaveExpense: (payload: NewExpenseInput, expenseId?: string) => void;
  onCancelEdit: () => void;
}

const NONE_OPTION = '__none__';

function initialCsvMapping(): CsvMapping {
  return {
    place: '',
    amount: '',
    currency: NONE_OPTION,
    date: '',
  };
}

function findHeader(headers: string[], candidates: string[]): string {
  const lowered = headers.map((header) => header.toLowerCase());
  const foundIndex = lowered.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
  return foundIndex >= 0 ? headers[foundIndex] : '';
}

function suggestCsvMapping(headers: string[]): CsvMapping {
  return {
    place: findHeader(headers, ['place', '가맹', '상호', '사용처', '매장']),
    amount: findHeader(headers, ['amount', '금액', '결제금액', '승인금액']),
    currency: findHeader(headers, ['currency', '통화', '화폐']) || NONE_OPTION,
    date: findHeader(headers, ['date', '일자', '날짜', '결제일', '거래일']),
  };
}

function normalizeCurrencyCode(value: string, fallback: CurrencyCode): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  const isSupported = SUPPORTED_CURRENCIES.some((item) => item.code === normalized);
  return isSupported ? (normalized as CurrencyCode) : fallback;
}

function toExtraMap(expense: Expense): Record<string, string> {
  return expense.extraAllocations.reduce<Record<string, string>>((acc, item) => {
    acc[item.memberId] = String(item.amount);
    return acc;
  }, {});
}

function valueByHeader(headers: string[], row: string[], headerName: string): string {
  const index = headers.indexOf(headerName);
  if (index < 0) {
    return '';
  }
  return row[index] ?? '';
}

function defaultRateText(currency: CurrencyCode): string {
  return currency === 'KRW' ? '1' : '';
}

export function ExpenseComposer({
  trip,
  quickMode,
  editingExpense,
  onSaveExpense,
  onCancelEdit,
}: ExpenseComposerProps): JSX.Element {
  const [mode, setMode] = useState<InputMode>('direct');
  const [payerId, setPayerId] = useState(trip.defaultPayerId);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(trip.defaultCurrency);
  const [rateText, setRateText] = useState(defaultRateText(trip.defaultCurrency));
  const [estimatedMode, setEstimatedMode] = useState<EstimatedMode>('rate');
  const [manualEstimatedText, setManualEstimatedText] = useState('');
  const [rateStatus, setRateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [rateMessage, setRateMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>(trip.members.map((member) => member.id));
  const [extraMap, setExtraMap] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(!quickMode);
  const [error, setError] = useState<string | null>(null);

  const [aiReady, setAiReady] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string>('AI 연결 상태 확인 전입니다.');

  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrResults, setOcrResults] = useState<Array<{ place: string | null; amount: number | null; currency: string | null; date: string | null; rawText: string }>>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  const [csvFileName, setCsvFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvMapping>(initialCsvMapping());
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [csvMissingRateCurrencies, setCsvMissingRateCurrencies] = useState<CurrencyCode[]>([]);
  const [csvRateOverrideMap, setCsvRateOverrideMap] = useState<Partial<Record<CurrencyCode, string>>>({});

  const orderedCurrencies = useMemo(() => getOrderedCurrencies(trip.defaultCurrency), [trip.defaultCurrency]);

  const amount = clampToNonNegativeNumber(amountText);
  const rate = clampToNonNegativeNumber(rateText);
  const effectiveRate = currency === 'KRW' ? 1 : rate;
  const computedEstimatedKrw = amount * effectiveRate;
  const manualEstimatedKrw = clampToNonNegativeNumber(manualEstimatedText);

  const estimatedKrw =
    currency === 'KRW' ? amount : estimatedMode === 'manual' ? manualEstimatedKrw : computedEstimatedKrw;

  const extraTotal = participants.reduce((sum, memberId) => {
    return sum + clampToNonNegativeNumber(extraMap[memberId] ?? '0');
  }, 0);

  const csvNeedsManualMapping = !csvMapping.place || !csvMapping.amount || !csvMapping.date;
  async function refreshAiStatus(): Promise<void> {
    try {
      const status = await fetchAiStatus();
      const ready = status.available && status.authenticated;
      setAiReady(ready);

      if (ready) {
        setAiStatusMessage(`AI 연결됨 (${status.accountLogin}) · 자동 모델: ${status.selectedModel}`);
      } else {
        setAiStatusMessage(status.message || 'AI가 준비되지 않았습니다.');
      }
    } catch {
      setAiReady(false);
      setAiStatusMessage('AI 상태를 확인하지 못했습니다. OCR/AI 매핑 없이도 수동 입력은 가능합니다.');
    }
  }

  async function loadLatestRate(targetCurrency: CurrencyCode): Promise<void> {
    if (targetCurrency === 'KRW') {
      setRateStatus('idle');
      setRateMessage(null);
      setRateText('1');
      return;
    }

    setRateStatus('loading');
    setRateMessage('무료 환율 API로 현재 환율을 조회하는 중입니다.');

    try {
      const latestRate = await fetchLatestRateToKrw(targetCurrency);
      setRateText(String(latestRate));
      setRateStatus('success');
      setRateMessage(`현재 환율(1 ${targetCurrency} = KRW ${formatNumber2(latestRate)})을 적용했습니다. 예상 금액 안내용입니다.`);
    } catch {
      setRateStatus('error');
      setRateMessage('환율 조회에 실패했습니다. 수동 환율 입력 또는 예상 원화 직접 입력으로 계속 진행하세요.');
    }
  }
  useEffect(() => {
    void refreshAiStatus();
  }, []);

  useEffect(() => {
    setMode('direct');
    setPayerId(trip.defaultPayerId);
    setCurrency(trip.defaultCurrency);
    setRateText(defaultRateText(trip.defaultCurrency));
    setEstimatedMode('rate');
    setManualEstimatedText('');
    setRateStatus('idle');
    setRateMessage(null);
    setParticipants(trip.members.map((member) => member.id));
    setExtraMap({});
    setPlace('');
    setDate(todayIso());
    setPaymentMethod('');
    setAmountText('');
    setShowAdvanced(!quickMode);
    setError(null);
    setOcrFiles([]);
    setOcrResults([]);
    setOcrLoading(false);
    setOcrMessage(null);
    setCsvFileName('');
    setCsvHeaders([]);
    setCsvRows([]);
    setCsvMapping(initialCsvMapping());
    setCsvMessage(null);
    setCsvMissingRateCurrencies([]);
    setCsvRateOverrideMap({});
  }, [quickMode, trip]);

  useEffect(() => {
    if (!editingExpense) {
      return;
    }

    const estimatedFromExpense = getEstimatedKrwAmount(editingExpense);

    setMode('direct');
    setPayerId(editingExpense.payerId);
    setPlace(editingExpense.place);
    setDate(editingExpense.date);
    setPaymentMethod(editingExpense.paymentMethod ?? '');
    setAmountText(String(editingExpense.originalAmount));
    setCurrency(editingExpense.originalCurrency);
    setRateText(editingExpense.exchangeRate ? String(editingExpense.exchangeRate) : defaultRateText(editingExpense.originalCurrency));
    setEstimatedMode('rate');
    setManualEstimatedText(String(estimatedFromExpense));
    setParticipants([...editingExpense.participants]);
    setExtraMap(toExtraMap(editingExpense));
    setShowAdvanced(true);
    setError(null);
  }, [editingExpense]);

  useEffect(() => {
    if (currency === 'KRW') {
      setRateText('1');
      setRateStatus('idle');
      setRateMessage(null);
      return;
    }

    void loadLatestRate(currency);
  }, [currency]);

  function toggleParticipant(memberId: string): void {
    setParticipants((prev) => {
      if (prev.includes(memberId)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }

  function handleExtraChange(memberId: string, value: string): void {
    setExtraMap((prev) => ({
      ...prev,
      [memberId]: value,
    }));
  }

  function resetDirectFields(): void {
    setPlace('');
    setAmountText('');
    setDate(todayIso());
    setPaymentMethod('');
    setCurrency(trip.defaultCurrency);
    setRateText(defaultRateText(trip.defaultCurrency));
    setEstimatedMode('rate');
    setManualEstimatedText('');
    setRateStatus('idle');
    setRateMessage(null);
    setPayerId(trip.defaultPayerId);
    setParticipants(trip.members.map((member) => member.id));
    setExtraMap({});
    setError(null);
    if (editingExpense) {
      onCancelEdit();
    }
  }

  function submitExpense(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!place.trim()) {
      setError('사용처를 입력해주세요.');
      return;
    }

    if (!date) {
      setError('날짜를 입력해주세요.');
      return;
    }

    if (amount <= 0) {
      setError('금액은 0보다 커야 합니다.');
      return;
    }

    if (participants.length === 0) {
      setError('참여 인원을 최소 1명 선택해주세요.');
      return;
    }

    if (currency !== 'KRW' && estimatedMode === 'rate' && rate <= 0) {
      setError('외화 결제는 환율이 필요합니다.');
      return;
    }

    if (currency !== 'KRW' && estimatedMode === 'manual' && manualEstimatedKrw <= 0) {
      setError('예상 원화 금액을 직접 입력해주세요.');
      return;
    }

    if (extraTotal > estimatedKrw) {
      setError('추가 할당 합계가 총 금액보다 클 수 없습니다.');
      return;
    }

    const extraAllocations = participants
      .map((memberId) => ({
        memberId,
        amount: clampToNonNegativeNumber(extraMap[memberId] ?? '0'),
      }))
      .filter((item) => item.amount > 0);

    const resolvedRate =
      currency === 'KRW' ? undefined : rate > 0 ? rate : amount > 0 ? estimatedKrw / amount : undefined;

    const payload: NewExpenseInput = {
      tripId: trip.id,
      place,
      date,
      paymentMethod: paymentMethod.trim() || undefined,
      payerId,
      originalAmount: amount,
      originalCurrency: currency,
      estimatedKrwAmount: estimatedKrw,
      finalKrwAmount: editingExpense?.finalKrwAmount,
      exchangeRate: resolvedRate,
      participants,
      extraAllocations,
    };

    onSaveExpense(payload, editingExpense?.id);
    resetDirectFields();
  }

  function handleOcrFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    setOcrFiles(files);
    setOcrResults([]);
    setOcrMessage(null);
  }

  async function runOcrExtraction(): Promise<void> {
    if (!aiReady) {
      setOcrMessage('AI를 사용할 수 없습니다. 직접 입력으로 진행해주세요.');
      return;
    }

    if (ocrFiles.length === 0) {
      setOcrMessage('이미지를 먼저 선택해주세요.');
      return;
    }

    setOcrLoading(true);
    setOcrMessage('OCR 추출 중입니다...');

    try {
      const extracted = await requestOcrExtraction(ocrFiles);
      setOcrResults(extracted);
      setOcrMessage(`${extracted.length}건 OCR 결과를 가져왔습니다.`);
    } catch {
      setOcrResults([]);
      setOcrMessage('OCR 추출에 실패했습니다. 직접 입력을 사용해주세요.');
    } finally {
      setOcrLoading(false);
    }
  }

  function applyOcrResult(index: number): void {
    const result = ocrResults[index];
    if (!result) {
      return;
    }

    if (result.place) {
      setPlace(result.place);
    }

    if (result.amount !== null) {
      setAmountText(String(result.amount));
    }

    if (result.date) {
      setDate(result.date);
    }

    if (result.currency) {
      setCurrency(normalizeCurrencyCode(result.currency, trip.defaultCurrency));
    }

    setMode('direct');
    setError(null);
    setOcrMessage('OCR 결과를 직접 입력 폼에 반영했습니다. 필요한 값만 수정 후 저장하세요.');
  }

  async function parseCsvFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length < 2) {
        setCsvHeaders([]);
        setCsvRows([]);
        setCsvMapping(initialCsvMapping());
        setCsvMessage('데이터 행이 없는 파일입니다.');
        return;
      }

      const headers = rows[0].map((header) => header.trim());
      const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0));
      const fallback = suggestCsvMapping(headers);
      let mergedMapping = fallback;

      if (aiReady) {
        try {
          const aiMapping = await requestCsvAutoMapping(headers, dataRows.slice(0, 3));

          mergedMapping = {
            place: headers.includes(aiMapping.place) ? aiMapping.place : fallback.place,
            amount: headers.includes(aiMapping.amount) ? aiMapping.amount : fallback.amount,
            date: headers.includes(aiMapping.date) ? aiMapping.date : fallback.date,
            currency: aiMapping.currency && headers.includes(aiMapping.currency) ? aiMapping.currency : fallback.currency,
          };

          setCsvMessage('AI 자동 매핑을 적용했습니다. 필요 시 수정 후 가져오세요.');
        } catch {
          if (!fallback.place || !fallback.amount || !fallback.date) {
            setCsvMessage('AI 매핑 실패 + 기본 매핑 불완전입니다. 아래에서 수동 지정해주세요.');
          } else {
            setCsvMessage('AI 매핑은 실패했지만 기본 자동 매핑을 적용했습니다.');
          }
        }
      } else if (!fallback.place || !fallback.amount || !fallback.date) {
        setCsvMessage('자동 매핑이 불완전합니다. 아래에서 컬럼을 수동 지정해주세요.');
      } else {
        setCsvMessage('자동 매핑을 제안했습니다. 필요 시 수정 후 가져오세요.');
      }

      setCsvHeaders(headers);
      setCsvRows(dataRows);
      setCsvMapping(mergedMapping);
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
    } catch {
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(initialCsvMapping());
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
      setCsvMessage('파일을 읽지 못했습니다. CSV 형식을 확인해주세요.');
    }
  }

  function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    setCsvFileName(file?.name ?? '');

    if (!file) {
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(initialCsvMapping());
      setCsvMessage(null);
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(initialCsvMapping());
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
      setCsvMessage('현재 단계에서는 CSV 파일(.csv) 수동 매핑을 우선 지원합니다.');
      return;
    }

    void parseCsvFile(file);
  }

  function handleCsvRateOverrideChange(currencyCode: CurrencyCode, value: string): void {
    setCsvRateOverrideMap((prev) => ({
      ...prev,
      [currencyCode]: value,
    }));
  }

  async function resolveCsvRates(currencies: CurrencyCode[]): Promise<{ rates: Partial<Record<CurrencyCode, number>>; missing: CurrencyCode[] }> {
    const rates: Partial<Record<CurrencyCode, number>> = {};
    const missing: CurrencyCode[] = [];

    await Promise.all(
      currencies.map(async (currencyCode) => {
        const manualRate = clampToNonNegativeNumber(csvRateOverrideMap[currencyCode] ?? '');
        if (manualRate > 0) {
          rates[currencyCode] = manualRate;
          return;
        }

        try {
          const apiRate = await fetchLatestRateToKrw(currencyCode);
          rates[currencyCode] = apiRate;
        } catch {
          missing.push(currencyCode);
        }
      }),
    );

    return { rates, missing };
  }

  async function importCsvRows(): Promise<void> {
    if (csvRows.length === 0) {
      setCsvMessage('가져올 데이터가 없습니다.');
      return;
    }

    if (csvNeedsManualMapping) {
      setCsvMessage('필수 컬럼 매핑(place, amount, date)을 먼저 지정해주세요.');
      return;
    }

    const normalizedRows = csvRows
      .map((row) => {
        const placeValue = valueByHeader(csvHeaders, row, csvMapping.place).trim();
        const amountValue = parseNumberText(valueByHeader(csvHeaders, row, csvMapping.amount));

        if (!placeValue || amountValue <= 0) {
          return null;
        }

        const currencyRaw =
          csvMapping.currency === NONE_OPTION
            ? trip.defaultCurrency
            : valueByHeader(csvHeaders, row, csvMapping.currency) || trip.defaultCurrency;

        const normalizedCurrency = normalizeCurrencyCode(currencyRaw, trip.defaultCurrency);
        const normalizedDate = normalizeCsvDate(valueByHeader(csvHeaders, row, csvMapping.date), todayIso());

        return {
          placeValue,
          amountValue,
          normalizedCurrency,
          normalizedDate,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (normalizedRows.length === 0) {
      setCsvMessage('유효한 데이터 행이 없어 가져오지 못했습니다.');
      return;
    }

    const targetCurrencies = Array.from(
      new Set(
        normalizedRows
          .map((row) => row.normalizedCurrency)
          .filter((currencyCode): currencyCode is CurrencyCode => currencyCode !== 'KRW'),
      ),
    );

    setCsvMessage('무료 환율 API로 환율을 조회하는 중입니다.');

    const { rates, missing } = await resolveCsvRates(targetCurrencies);

    if (missing.length > 0) {
      setCsvMissingRateCurrencies(missing);
      setCsvMessage(`환율 조회 실패: ${missing.join(', ')}. 통화별 수동 환율을 입력한 뒤 다시 가져오세요.`);
      return;
    }

    setCsvMissingRateCurrencies([]);

    let importedCount = 0;

    normalizedRows.forEach((row) => {
      const resolvedRate = row.normalizedCurrency === 'KRW' ? undefined : rates[row.normalizedCurrency];
      const estimatedKrwAmount =
        row.normalizedCurrency === 'KRW' ? row.amountValue : row.amountValue * (resolvedRate ?? 0);

      if (row.normalizedCurrency !== 'KRW' && (!resolvedRate || resolvedRate <= 0)) {
        return;
      }

      const payload: NewExpenseInput = {
        tripId: trip.id,
        place: row.placeValue,
        date: row.normalizedDate,
        paymentMethod: undefined,
        payerId: trip.defaultPayerId,
        originalAmount: row.amountValue,
        originalCurrency: row.normalizedCurrency,
        estimatedKrwAmount,
        finalKrwAmount: undefined,
        exchangeRate: resolvedRate,
        participants: trip.members.map((member) => member.id),
        extraAllocations: [],
      };

      onSaveExpense(payload);
      importedCount += 1;
    });

    if (importedCount === 0) {
      setCsvMessage('환율 정보를 확보하지 못해 가져오지 못했습니다.');
      return;
    }

    setCsvMessage(`${importedCount}건을 기록 탭에 추가했습니다.`);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>기록 탭</h3>
        {editingExpense ? <span className="editing-pill">수정 중</span> : null}
      </div>

      <div className="tab-row">
        <button
          type="button"
          className={`tab-btn ${mode === 'direct' ? 'tab-btn-active' : ''}`}
          onClick={() => setMode('direct')}
        >
          직접 입력
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'ocr' ? 'tab-btn-active' : ''}`}
          onClick={() => setMode('ocr')}
        >
          OCR(선택)
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'csv' ? 'tab-btn-active' : ''}`}
          onClick={() => setMode('csv')}
        >
          CSV 업로드
        </button>
      </div>

      {mode === 'ocr' ? (
        <div className="prototype-pane">
          <p>OCR은 선택형 보조 기능입니다. AI 연결이 없으면 직접 입력으로 이어갈 수 있습니다.</p>
          <p className={aiReady ? 'hint-text' : 'error-text'}>{aiStatusMessage}</p>
          <div className="inline-fields">
            <label className="field">
              <span>카메라 촬영</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOcrFileChange}
                disabled={!aiReady || ocrLoading}
              />
            </label>
            <label className="field">
              <span>앨범에서 선택</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleOcrFileChange}
                disabled={!aiReady || ocrLoading}
              />
            </label>
          </div>

          <p className="hint-text">선택된 파일: {ocrFiles.length}개</p>

          <div className="actions-row">
            <button type="button" className="secondary-btn" onClick={() => void refreshAiStatus()}>
              AI 상태 새로고침
            </button>
            <button type="button" className="primary-btn" onClick={() => void runOcrExtraction()} disabled={!aiReady || ocrLoading}>
              OCR 추출 실행
            </button>
          </div>

          {ocrMessage ? <p className="hint-text">{ocrMessage}</p> : null}

          {ocrResults.length > 0 ? (
            <ul className="ocr-result-list">
              {ocrResults.map((item, index) => (
                <li key={`ocr-${index}`} className="ocr-result-item">
                  <p>사용처: {item.place ?? '-'}</p>
                  <p>금액: {item.amount ?? '-'}</p>
                  <p>통화: {item.currency ?? '-'}</p>
                  <p>날짜: {item.date ?? '-'}</p>
                  <button type="button" className="secondary-btn" onClick={() => applyOcrResult(index)}>
                    직접 입력 폼에 적용
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <button type="button" className="secondary-btn" onClick={() => setMode('direct')}>
            직접 입력으로 기록하기
          </button>
        </div>
      ) : null}

      {mode === 'csv' ? (
        <div className="prototype-pane">
          <p>CSV 업로드는 AI 없이도 동작합니다. AI 매핑 실패 시 수동 매핑으로 계속 진행할 수 있습니다.</p>
          <p className={aiReady ? 'hint-text' : 'error-text'}>{aiStatusMessage}</p>
          <label className="field">
            <span>CSV 파일</span>
            <input type="file" accept=".csv,.xlsx" onChange={handleCsvFileChange} />
          </label>
          {csvFileName ? <p className="hint-text">파일: {csvFileName}</p> : null}

          {csvHeaders.length > 0 ? (
            <>
              <div className="csv-mapping-grid">
                <label className="field">
                  <span>사용처 컬럼</span>
                  <select
                    value={csvMapping.place}
                    onChange={(event) =>
                      setCsvMapping((prev) => ({
                        ...prev,
                        place: event.target.value,
                      }))
                    }
                  >
                    <option value="">선택</option>
                    {csvHeaders.map((header) => (
                      <option key={`place-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>금액 컬럼</span>
                  <select
                    value={csvMapping.amount}
                    onChange={(event) =>
                      setCsvMapping((prev) => ({
                        ...prev,
                        amount: event.target.value,
                      }))
                    }
                  >
                    <option value="">선택</option>
                    {csvHeaders.map((header) => (
                      <option key={`amount-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>통화 컬럼 (없으면 기본 통화)</span>
                  <select
                    value={csvMapping.currency}
                    onChange={(event) =>
                      setCsvMapping((prev) => ({
                        ...prev,
                        currency: event.target.value,
                      }))
                    }
                  >
                    <option value={NONE_OPTION}>없음</option>
                    {csvHeaders.map((header) => (
                      <option key={`currency-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>날짜 컬럼</span>
                  <select
                    value={csvMapping.date}
                    onChange={(event) =>
                      setCsvMapping((prev) => ({
                        ...prev,
                        date: event.target.value,
                      }))
                    }
                  >
                    <option value="">선택</option>
                    {csvHeaders.map((header) => (
                      <option key={`date-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="panel-muted">
                <strong>미리보기</strong>
                <p>{csvRows.length}개 행 중 상위 3개 행을 확인합니다.</p>
                <ul className="csv-preview-list">
                  {csvRows.slice(0, 3).map((row, index) => (
                    <li key={`preview-${index}`}>
                      {valueByHeader(csvHeaders, row, csvMapping.place) || '(사용처 없음)'} /{' '}
                      {valueByHeader(csvHeaders, row, csvMapping.amount) || '(금액 없음)'} /{' '}
                      {valueByHeader(csvHeaders, row, csvMapping.date) || '(날짜 없음)'}
                    </li>
                  ))}
                </ul>
              </div>

              {csvNeedsManualMapping ? (
                <p className="error-text">필수 컬럼이 모두 선택되어야 가져오기를 실행할 수 있습니다.</p>
              ) : null}

              {csvMissingRateCurrencies.length > 0 ? (
                <div className="csv-rate-override-grid">
                  {csvMissingRateCurrencies.map((currencyCode) => (
                    <label key={`csv-rate-${currencyCode}`} className="field">
                      <span>{currencyCode} 수동 환율 (1 {currencyCode} = KRW)</span>
                      <input
                        value={csvRateOverrideMap[currencyCode] ?? ''}
                        onChange={(event) => handleCsvRateOverrideChange(currencyCode, event.target.value)}
                        placeholder="예: 41.58"
                        inputMode="decimal"
                      />
                    </label>
                  ))}
                </div>
              ) : null}

              <button type="button" className="primary-btn" onClick={() => void importCsvRows()}>
                선택 매핑으로 일괄 추가
              </button>
            </>
          ) : null}

          {csvMessage ? <p className="hint-text">{csvMessage}</p> : null}
        </div>
      ) : null}

      {mode === 'direct' ? (
        <form className="form-grid" onSubmit={submitExpense}>
          {quickMode ? <p className="hint-text">모바일 기록에 맞춰 필수 입력을 먼저 배치했습니다.</p> : null}

          <div className="inline-fields">
            <label className="field">
              <span>사용처</span>
              <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="예: 공항택시" />
            </label>
            <label className="field">
              <span>날짜</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>결제수단 (선택)</span>
            <input
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              placeholder="예: 트래블카드, 현금"
            />
          </label>

          <label className="field">
            <span>금액</span>
            <div className="amount-input-wrap">
              <b>{getCurrencyMeta(currency).symbol}</b>
              <input
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </label>

          <div className="field">
            <span>통화 선택</span>
            <div className="chip-scroll">
              {orderedCurrencies.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`chip ${currency === item.code ? 'chip-active' : ''}`}
                  onClick={() => setCurrency(item.code)}
                >
                  {item.code}
                </button>
              ))}
            </div>
          </div>

          {currency !== 'KRW' ? (
            <>
              <div className="field">
                <span>예상 원화 계산 방식</span>
                <div className="tab-row">
                  <button
                    type="button"
                    className={`tab-btn ${estimatedMode === 'rate' ? 'tab-btn-active' : ''}`}
                    onClick={() => setEstimatedMode('rate')}
                  >
                    환율 계산
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${estimatedMode === 'manual' ? 'tab-btn-active' : ''}`}
                    onClick={() => setEstimatedMode('manual')}
                  >
                    원화 직접 입력
                  </button>
                </div>
              </div>

              {estimatedMode === 'rate' ? (
                <>
                  <label className="field">
                    <span>환율 (1 {currency} = KRW)</span>
                    <input
                      value={rateText}
                      onChange={(event) => setRateText(event.target.value)}
                      inputMode="decimal"
                      placeholder="환율 입력"
                    />
                  </label>
                  <div className="actions-row">
                    <button type="button" className="secondary-btn" onClick={() => void loadLatestRate(currency)}>
                      무료 환율 다시 조회
                    </button>
                  </div>
                  {rateMessage ? (
                    <p className={rateStatus === 'error' ? 'error-text' : 'hint-text'}>{rateMessage}</p>
                  ) : null}
                </>
              ) : (
                <label className="field">
                  <span>예상 원화 금액 (직접 입력)</span>
                  <input
                    value={manualEstimatedText}
                    onChange={(event) => setManualEstimatedText(event.target.value)}
                    inputMode="decimal"
                    placeholder="예: 28140"
                  />
                </label>
              )}
            </>
          ) : null}

          <div className="panel-muted">
            <strong>
              예상 원화 금액
              {currency === 'KRW'
                ? ' (원화 입력값)'
                : estimatedMode === 'manual'
                  ? ' (직접 입력)'
                  : ' (환율 계산)'}
            </strong>
            <p>~ {formatKrw(estimatedKrw)}</p>
            {editingExpense && getFinalKrwAmount(editingExpense) !== null ? (
              <p className="hint-text">현재 실제 확정 금액: {formatKrw(getFinalKrwAmount(editingExpense) ?? 0)}</p>
            ) : null}
          </div>

          <button type="button" className="secondary-btn" onClick={() => setShowAdvanced((prev) => !prev)}>
            {showAdvanced ? '고급 설정 접기' : '결제자/참여자/추가할당 설정'}
          </button>

          {showAdvanced ? (
            <>
              <div className="field">
                <span>결제자</span>
                <div className="chip-scroll">
                  {trip.members.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className={`chip ${payerId === member.id ? 'chip-active' : ''}`}
                      onClick={() => setPayerId(member.id)}
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>참여 인원</span>
                <div className="chip-scroll">
                  {trip.members.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className={`chip ${participants.includes(member.id) ? 'chip-active' : ''}`}
                      onClick={() => toggleParticipant(member.id)}
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
                <p className="hint-text">한 명 이상은 반드시 선택되어야 합니다.</p>
              </div>

              <div className="field">
                <span>추가 할당 (선택)</span>
                <div className="extra-grid">
                  {trip.members
                    .filter((member) => participants.includes(member.id))
                    .map((member) => (
                      <label key={member.id} className="field">
                        <span>{member.name}</span>
                        <input
                          value={extraMap[member.id] ?? ''}
                          onChange={(event) => handleExtraChange(member.id, event.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </label>
                    ))}
                </div>
                <p className="hint-text">추가 할당 합계: {formatKrw(extraTotal)}</p>
              </div>
            </>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <div className="actions-row">
            {editingExpense ? (
              <button type="button" className="secondary-btn" onClick={onCancelEdit}>
                수정 취소
              </button>
            ) : null}
            <button type="button" className="secondary-btn" onClick={resetDirectFields}>
              초기화
            </button>
            <button type="submit" className="primary-btn">
              {editingExpense ? '지출 수정 저장' : '지출 저장'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}












