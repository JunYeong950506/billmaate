import { ChangeEvent, FormEvent, useEffect, useState } from 'react';

import { Camera, FileSpreadsheet, ReceiptText, RefreshCw, Users, Wallet } from 'lucide-react';
import { SUPPORTED_CURRENCIES, getCurrencyMeta } from '../constants/currencies';
import { CurrencyCode, Expense, NewExpenseInput, Trip } from '../types';
import { fetchAiStatus, requestCsvAutoMapping, requestOcrExtraction } from '../utils/ai';
import { getFinalKrwAmount, resolveEffectiveExchangeRate } from '../utils/expenseAmount';
import { fetchLatestRateToKrw } from '../utils/exchangeRate';
import { normalizeCsvDate, parseCsvText, parseNumberText } from '../utils/csv';
import { clampToNonNegativeNumber, formatKrw, formatNumber2, todayIso } from '../utils/format';
import { CurrencyPicker } from './CurrencyPicker';

type InputMode = 'direct' | 'ocr' | 'csv';

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
  const rate = resolveEffectiveExchangeRate(expense);
  const divisor = expense.originalCurrency === 'KRW' ? 1 : rate;

  return expense.extraAllocations.reduce<Record<string, string>>((acc, item) => {
    const localAmount = divisor > 0 ? item.amount / divisor : item.amount;
    acc[item.memberId] = String(localAmount);
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
  const [quickStep, setQuickStep] = useState<1 | 2 | 3>(1);
  const [payerId, setPayerId] = useState(trip.defaultPayerId);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(trip.defaultCurrency);
  const [rateText, setRateText] = useState(defaultRateText(trip.defaultCurrency));
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
  const [csvAutoMappingLoading, setCsvAutoMappingLoading] = useState(false);

  const amount = clampToNonNegativeNumber(amountText);
  const rate = clampToNonNegativeNumber(rateText);
  const effectiveRate = currency === 'KRW' ? 1 : rate;
  const estimatedKrw = currency === 'KRW' ? amount : amount * effectiveRate;

  const defaultForeignCurrency: CurrencyCode = trip.defaultCurrency === 'KRW' ? 'USD' : trip.defaultCurrency;
  const defaultForeignMeta = getCurrencyMeta(defaultForeignCurrency);
  const currentForeignCurrency: CurrencyCode = currency === 'KRW' ? defaultForeignCurrency : currency;
  const resolvedRateForExtra = currency === 'KRW' ? 1 : rate > 0 ? rate : amount > 0 ? estimatedKrw / amount : 0;

  const extraTotalInput = participants.reduce((sum, memberId) => {
    return sum + clampToNonNegativeNumber(extraMap[memberId] ?? '0');
  }, 0);

  const extraTotalKrw = extraTotalInput * resolvedRateForExtra;

  const csvMissingRequiredMappings = [
    csvMapping.place ? null : 'place(사용처)',
    csvMapping.amount ? null : 'amount(금액)',
    csvMapping.date ? null : 'date(날짜)',
  ].filter((value): value is string => value !== null);
  const csvNeedsManualMapping = csvMissingRequiredMappings.length > 0;
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
      setRateMessage('환율 조회에 실패했습니다. 환율을 직접 입력하거나 환율 없이 현지 화폐로 저장할 수 있습니다.');
    }
  }
  useEffect(() => {
    void refreshAiStatus();
  }, []);

  useEffect(() => {
    setMode('direct');
    setQuickStep(1);
    setPayerId(trip.defaultPayerId);
    setCurrency(trip.defaultCurrency);
    setRateText(defaultRateText(trip.defaultCurrency));
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
    setCsvAutoMappingLoading(false);
  }, [quickMode, trip]);

  useEffect(() => {
    if (!editingExpense) {
      return;
    }

    setMode('direct');
    setQuickStep(1);
    setPayerId(editingExpense.payerId);
    setPlace(editingExpense.place);
    setDate(editingExpense.date);
    setPaymentMethod(editingExpense.paymentMethod ?? '');
    setAmountText(String(editingExpense.originalAmount));
    setCurrency(editingExpense.originalCurrency);
    setRateText(editingExpense.exchangeRate ? String(editingExpense.exchangeRate) : defaultRateText(editingExpense.originalCurrency));
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
    setQuickStep(1);
    setPlace('');
    setAmountText('');
    setDate(todayIso());
    setPaymentMethod('');
    setCurrency(trip.defaultCurrency);
    setRateText(defaultRateText(trip.defaultCurrency));
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

  function validateQuickStep1(): boolean {
    if (!place.trim()) {
      setError('사용처를 입력해주세요.');
      return false;
    }

    if (!date) {
      setError('날짜를 입력해주세요.');
      return false;
    }

    if (amount <= 0) {
      setError('금액은 0보다 커야 합니다.');
      return false;
    }


    setError(null);
    return true;
  }

  function moveQuickStepNext(): void {
    if (!quickMode) {
      return;
    }

    if (quickStep === 1) {
      if (!validateQuickStep1()) {
        return;
      }
      setQuickStep(2);
      return;
    }

    if (quickStep === 2) {
      if (!payerId) {
        setError('결제자를 선택해주세요.');
        return;
      }
      setError(null);
      setQuickStep(3);
    }
  }

  function moveQuickStepPrev(): void {
    if (!quickMode) {
      return;
    }

    if (quickStep === 2) {
      setQuickStep(1);
      setError(null);
      return;
    }

    if (quickStep === 3) {
      setQuickStep(2);
      setError(null);
    }
  }

  function handleCurrencyChange(nextCurrency: CurrencyCode): void {
    setCurrency(nextCurrency);
    setError(null);
  }

  function renderCurrencySelector(label = '통화'): JSX.Element {
    const selectedMeta = getCurrencyMeta(currentForeignCurrency);

    return (
      <div className="field">
        <span>{label}</span>
        <div className="foreign-currency-row">
          <button
            type="button"
            className={`foreign-currency-default-btn ${currency === defaultForeignCurrency ? 'foreign-currency-default-btn-active' : ''}`}
            onClick={() => handleCurrencyChange(defaultForeignCurrency)}
          >
            <span className="foreign-currency-default-badge">기본 외화</span>
            <span className="foreign-currency-default-main">
              <img className="currency-option-flag" src={defaultForeignMeta.flag} alt="" loading="lazy" />
              <span className="foreign-currency-default-text">
                <strong>{defaultForeignMeta.name}</strong>
                <span>
                  {defaultForeignMeta.code} · {defaultForeignMeta.symbol}
                </span>
              </span>
            </span>
          </button>

          <CurrencyPicker
            value={currentForeignCurrency}
            onChange={handleCurrencyChange}
            includeKrw={false}
            grouped={false}
            modalTitle="다른 외화 선택"
            triggerVariant="guide"
            triggerLabel="다른 외화 고르기"
            triggerHint={`현재: ${selectedMeta.name}`}
          />
        </div>

        <div className="foreign-currency-footer">
          <button
            type="button"
            className={`text-btn foreign-currency-krw-btn ${currency === 'KRW' ? 'foreign-currency-krw-btn-active' : ''}`}
            onClick={() => handleCurrencyChange('KRW')}
          >
            원화(KRW)로 입력
          </button>
          <p className="hint-text">
            {currency === 'KRW' ? '현재 원화 입력 모드입니다.' : `현재 선택: ${getCurrencyMeta(currency).name} (${currency})`}
          </p>
        </div>
      </div>
    );
  }
  function submitExpense(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (quickMode && quickStep < 3) {
      moveQuickStepNext();
      return;
    }

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

    if (currency !== 'KRW' && extraTotalInput > 0 && resolvedRateForExtra <= 0) {
      setError('추가 부담금을 반영하려면 환율을 입력해주세요. 환율 없이 저장하려면 추가 부담금을 0으로 두세요.');
      return;
    }

    if (extraTotalKrw > estimatedKrw) {
      setError('추가 할당 합계가 총 금액보다 클 수 없습니다.');
      return;
    }

    const extraAllocations = participants
      .map((memberId) => ({
        memberId,
        amount: clampToNonNegativeNumber(extraMap[memberId] ?? '0') * resolvedRateForExtra,
      }))
      .filter((item) => item.amount > 0);

    const resolvedRate = currency === 'KRW' ? undefined : rate > 0 ? rate : undefined;

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

  async function applyCsvAutoMapping(headers: string[], dataRows: string[][], fallback: CsvMapping): Promise<CsvMapping> {
    if (!aiReady) {
      if (!fallback.place || !fallback.amount || !fallback.date) {
        setCsvMessage('자동 매핑이 불완전합니다. 아래에서 컬럼을 수동 지정해주세요.');
      } else {
        setCsvMessage('자동 매핑을 제안했습니다. 필요 시 수정 후 가져오세요.');
      }
      return fallback;
    }

    setCsvAutoMappingLoading(true);

    try {
      const aiMapping = await requestCsvAutoMapping(headers, dataRows.slice(0, 3));

      const mergedMapping: CsvMapping = {
        place: headers.includes(aiMapping.place) ? aiMapping.place : fallback.place,
        amount: headers.includes(aiMapping.amount) ? aiMapping.amount : fallback.amount,
        date: headers.includes(aiMapping.date) ? aiMapping.date : fallback.date,
        currency: aiMapping.currency && headers.includes(aiMapping.currency) ? aiMapping.currency : fallback.currency,
      };

      if (!mergedMapping.place || !mergedMapping.amount || !mergedMapping.date) {
        setCsvMessage('AI 매핑 결과가 일부 비어 있습니다. 누락 컬럼을 수동으로 지정해주세요.');
      } else {
        setCsvMessage('AI 자동 매핑을 적용했습니다. 필요 시 수정 후 가져오세요.');
      }

      return mergedMapping;
    } catch {
      if (!fallback.place || !fallback.amount || !fallback.date) {
        setCsvMessage('AI 매핑 실패 + 기본 매핑 불완전입니다. 아래에서 수동 지정해주세요.');
      } else {
        setCsvMessage('AI 매핑은 실패했지만 기본 자동 매핑을 적용했습니다. 수동 수정 후 계속 진행할 수 있습니다.');
      }

      return fallback;
    } finally {
      setCsvAutoMappingLoading(false);
    }
  }

  async function retryCsvAutoMapping(): Promise<void> {
    if (csvHeaders.length === 0 || csvRows.length === 0) {
      setCsvMessage('먼저 CSV 파일을 불러와주세요.');
      return;
    }

    const fallback = suggestCsvMapping(csvHeaders);
    const merged = await applyCsvAutoMapping(csvHeaders, csvRows, fallback);
    setCsvMapping(merged);
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
      const mergedMapping = await applyCsvAutoMapping(headers, dataRows, fallback);

      setCsvHeaders(headers);
      setCsvRows(dataRows);
      setCsvMapping(mergedMapping);
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
      setCsvAutoMappingLoading(false);
    } catch {
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(initialCsvMapping());
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
      setCsvAutoMappingLoading(false);
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
      setCsvAutoMappingLoading(false);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(initialCsvMapping());
      setCsvMissingRateCurrencies([]);
      setCsvRateOverrideMap({});
      setCsvAutoMappingLoading(false);
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
      setCsvMessage(`필수 컬럼 매핑 누락: ${csvMissingRequiredMappings.join(', ')}. 먼저 지정해주세요.`);
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
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <ReceiptText size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate">Log Expense</h3>
            <p className="hint-text">직접 입력을 중심으로 기록하고, 보조 기능은 같은 화면에서 이어서 사용합니다.</p>
          </div>
        </div>
        {editingExpense ? <span className="editing-pill">수정 중</span> : null}
      </div>

      <div className="tab-row">
        <button
          type="button"
          className={`tab-btn ${mode === 'direct' ? 'tab-btn-active' : ''}`}
          onClick={() => setMode('direct')}
        >
          <span className="inline-flex items-center gap-2">
            <ReceiptText size={16} />
            직접 입력
          </span>
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'ocr' ? 'tab-btn-active' : ''}`}
          onClick={() => setMode('ocr')}
        >
          <span className="inline-flex items-center gap-2">
            <Camera size={16} />
            영수증 사진
          </span>
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'csv' ? 'tab-btn-active' : ''}`}
          onClick={() => setMode('csv')}
        >
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet size={16} />
            매출전표 등록
          </span>
        </button>
      </div>

      {mode === 'ocr' ? (
        <div className="prototype-pane">
          <p>영수증 사진 촬영은 보조기능입니다. AI 연결이 없으면 사용이 불가능합니다.</p>
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
          <p>매출전표 등록은 AI 없이 등록 시 수동으로 진행합니다.</p>
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

              {aiReady ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void retryCsvAutoMapping()}
                  disabled={csvAutoMappingLoading}
                >
                  {csvAutoMappingLoading ? 'AI 매핑 재시도 중...' : 'AI 자동 매핑 다시 시도'}
                </button>
              ) : null}

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
                <p className="error-text">필수 컬럼 매핑 누락: {csvMissingRequiredMappings.join(', ')}</p>
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
          {quickMode ? (
            <div className="quick-step-shell">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="quick-step-head">
                  <div className="quick-step-head-main">
                    <strong>모바일 빠른 기록</strong>
                    <span>Step {quickStep}/3</span>
                  </div>
                  <p className="hint-text">한 번에 다 입력하지 않고, 핵심 정보부터 순서대로 기록합니다.</p>
                  <div className="quick-step-indicator" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={quickStep}>
                    {[1, 2, 3].map((step) => (
                      <span
                        key={`quick-step-indicator-${step}`}
                        className={`quick-step-dot ${quickStep >= step ? 'quick-step-dot-active' : ''}`}
                      />
                    ))}
                  </div>
                </div>

                {quickStep === 1 ? (
                  <div className="quick-step-section">
                    <div className="field">
                      <span>금액 및 통화</span>
                      <div className="amount-input-wrap">
                        <b>{getCurrencyMeta(currency).symbol}</b>
                        <input
                          value={amountText}
                          onChange={(event) => setAmountText(event.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {renderCurrencySelector('통화 선택')}

                    <label className="field">
                      <span>지출 내용</span>
                      <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="예: 공항택시, 점심식사" />
                    </label>

                    <div className="inline-fields">
                      <label className="field">
                        <span>날짜</span>
                        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>결제수단 (선택)</span>
                        <input
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                          placeholder="예: 트래블카드, 현금"
                        />
                      </label>
                    </div>

                    {currency !== 'KRW' ? (
                      <>
                        <div className="quick-rate-row">
                          <label className="field">
                            <span>환율 (1 {currency} = KRW)</span>
                            <input
                              value={rateText}
                              onChange={(event) => setRateText(event.target.value)}
                              inputMode="decimal"
                              placeholder="환율 입력"
                            />
                          </label>
                          <button
                            type="button"
                            className="secondary-btn refresh-rate-btn"
                            onClick={() => void loadLatestRate(currency)}
                            aria-label="무료 환율 새로고침"
                            title="무료 환율 새로고침"
                          >
                            <RefreshCw size={18} />
                          </button>
                        </div>

                        {rateMessage ? <p className={rateStatus === 'error' ? 'error-text' : 'hint-text'}>{rateMessage}</p> : null}

                        <div className="panel-muted">
                          <strong>예상 원화 금액 (참고)</strong>
                          <p>~ {formatKrw(estimatedKrw)}</p>
                          <p className="hint-text">환율 없이도 저장할 수 있고, 정산 내역에서 실제 원화를 나중에 확정할 수 있습니다.</p>
                        </div>
                      </>
                    ) : (
                      <div className="panel-muted">
                        <strong>원화 입력 모드</strong>
                        <p>입력한 금액이 바로 정산 기준 금액으로 사용됩니다.</p>
                      </div>
                    )}
                  </div>
                ) : null}

                {quickStep === 2 ? (
                  <div className="quick-step-section">
                    <div className="field">
                      <span className="inline-flex items-center gap-2">
                        <Wallet size={14} />
                        결제자
                      </span>
                      <p className="hint-text">실제로 결제한 사람을 선택합니다.</p>
                      <div className="chip-scroll">
                        {trip.members.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className={`chip ${payerId === member.id ? 'chip-active' : ''}`}
                            onClick={() => {
                              setPayerId(member.id);
                              setError(null);
                            }}
                          >
                            {member.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {quickStep === 3 ? (
                  <div className="quick-step-section">
                    <div className="field">
                      <span className="inline-flex items-center gap-2">
                        <Users size={14} />
                        참여 인원
                      </span>
                      <p className="hint-text">같이 사용한 멤버를 선택하고, 필요하면 추가 부담금을 입력합니다.</p>
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
                      <div className="quick-step-inline-actions">
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => {
                            setParticipants(trip.members.map((member) => member.id));
                            setError(null);
                          }}
                        >
                          전체 선택
                        </button>
                        <button type="button" className="text-btn" onClick={() => setParticipants([])}>
                          전체 해제
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <span>추가 부담금 (선택)</span>
                      <div className="extra-grid">
                        {trip.members
                          .filter((member) => participants.includes(member.id))
                          .map((member) => (
                            <label key={member.id} className="field">
                              <span>{member.name}</span>
                              <div className="amount-input-wrap">
                                <b>{currency}</b>
                                <input
                                  value={extraMap[member.id] ?? ''}
                                  onChange={(event) => handleExtraChange(member.id, event.target.value)}
                                  placeholder="0"
                                  inputMode="decimal"
                                />
                              </div>
                            </label>
                          ))}
                      </div>
                      <p className="hint-text">
                        추가 부담금 합계: {currency} {formatNumber2(extraTotalInput)}
                        {currency !== 'KRW' ? ` (≈ ${formatKrw(extraTotalKrw)})` : ''}
                      </p>
                    </div>
                  </div>
                ) : null}

                {error ? <p className="error-text">{error}</p> : null}

                <div className="quick-step-nav">
                  <div className="quick-step-nav-left">
                    {editingExpense ? (
                      <button type="button" className="secondary-btn" onClick={onCancelEdit}>
                        수정 취소
                      </button>
                    ) : null}

                    {quickStep > 1 ? (
                      <button type="button" className="secondary-btn" onClick={moveQuickStepPrev}>
                        이전
                      </button>
                    ) : (
                      <button type="button" className="secondary-btn" onClick={resetDirectFields}>
                        초기화
                      </button>
                    )}
                  </div>

                  {quickStep < 3 ? (
                    <button type="button" className="primary-btn" onClick={moveQuickStepNext}>
                      다음
                    </button>
                  ) : (
                    <button type="submit" className="primary-btn">
                      {editingExpense ? '지출 수정 저장' : '지출 저장'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
                <div className="space-y-6">
                  <div className="panel-muted">
                    <strong>직접 입력</strong>
                    <p>샘플 폼 배치를 기준으로 금액, 지출 내용, 일정 순서로 바로 기록합니다.</p>
                  </div>

                  <div className="field">
                    <span>금액 및 통화</span>
                    <div className="amount-input-wrap">
                      <b>{getCurrencyMeta(currency).symbol}</b>
                      <input
                        value={amountText}
                        onChange={(event) => setAmountText(event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <label className="field">
                    <span>지출 내용</span>
                    <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="예: 공항택시, 저녁 식사" />
                  </label>

                  <div className="inline-fields">
                    <label className="field">
                      <span>날짜</span>
                      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>결제수단 (선택)</span>
                      <input
                        value={paymentMethod}
                        onChange={(event) => setPaymentMethod(event.target.value)}
                        placeholder="예: 트래블카드, 현금"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-6">
                  {renderCurrencySelector('통화 선택')}

                  {currency !== 'KRW' ? (
                    <>
                      <div className="quick-rate-row">
                        <label className="field">
                          <span>환율 (1 {currency} = KRW)</span>
                          <input
                            value={rateText}
                            onChange={(event) => setRateText(event.target.value)}
                            inputMode="decimal"
                            placeholder="환율 입력"
                          />
                        </label>
                        <button
                          type="button"
                          className="secondary-btn refresh-rate-btn"
                          onClick={() => void loadLatestRate(currency)}
                          aria-label="무료 환율 새로고침"
                          title="무료 환율 새로고침"
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>

                      {rateMessage ? <p className={rateStatus === 'error' ? 'error-text' : 'hint-text'}>{rateMessage}</p> : null}

                      <div className="panel-muted">
                        <strong>예상 원화 금액 (참고)</strong>
                        <p>~ {formatKrw(estimatedKrw)}</p>
                        {rate <= 0 ? <p className="hint-text">환율 없이 저장하면 예상 원화는 0원으로 저장됩니다.</p> : null}
                        {editingExpense && getFinalKrwAmount(editingExpense) !== null ? (
                          <p className="hint-text">현재 실제 확정 금액: {formatKrw(getFinalKrwAmount(editingExpense) ?? 0)}</p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="panel-muted">
                      <strong>원화 입력 모드</strong>
                      <p>환율 없이 바로 저장되며, 정산 내역에서는 실제 원화 금액만 검토하면 됩니다.</p>
                    </div>
                  )}

                  <div className="panel-muted">
                    <strong>보류 UI 유지</strong>
                    <p>결제자, 참여 인원, 추가 부담금은 아래 고급 설정 영역에서 그대로 사용할 수 있습니다.</p>
                  </div>
                </div>
              </div>

              <button type="button" className="secondary-btn" onClick={() => setShowAdvanced((prev) => !prev)}>
                {showAdvanced ? '고급 설정 접기' : '결제자/참여자/추가 부담금 설정'}
              </button>

              {showAdvanced ? (
                <>
                  <div className="prototype-pane">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Wallet size={16} />
                      결제자
                    </div>
                    <p className="hint-text">실제로 결제한 사람입니다.</p>
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

                  <div className="prototype-pane">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Users size={16} />
                      참여 인원 및 추가 부담금
                    </div>
                    <p className="hint-text">기존 분배 기능은 삭제하지 않고 이 보조 영역에 유지합니다.</p>
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
                    <div className="quick-step-inline-actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => {
                          setParticipants(trip.members.map((member) => member.id));
                          setError(null);
                        }}
                      >
                        전체 선택
                      </button>
                      <button type="button" className="text-btn" onClick={() => setParticipants([])}>
                        전체 해제
                      </button>
                    </div>
                    <div className="extra-grid">
                      {trip.members
                        .filter((member) => participants.includes(member.id))
                        .map((member) => (
                          <label key={member.id} className="field">
                            <span>{member.name}</span>
                            <div className="amount-input-wrap">
                              <b>{currency}</b>
                              <input
                                value={extraMap[member.id] ?? ''}
                                onChange={(event) => handleExtraChange(member.id, event.target.value)}
                                placeholder="0"
                                inputMode="decimal"
                              />
                            </div>
                          </label>
                        ))}
                    </div>
                    <p className="hint-text">
                      추가 부담금 합계: {currency} {formatNumber2(extraTotalInput)}
                      {currency !== 'KRW' ? ` (≈ ${formatKrw(extraTotalKrw)})` : ''}
                    </p>
                  </div>
                </>
              ) : (
                <div className="panel-muted">
                  <strong>고급 분배 UI 보류</strong>
                  <p>현재는 핵심 기록 입력을 먼저 노출하고, 세부 분배 입력은 필요할 때만 펼쳐 사용합니다.</p>
                </div>
              )}

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
            </>
          )}
        </form>
      ) : null}
    </section>
  );
}























