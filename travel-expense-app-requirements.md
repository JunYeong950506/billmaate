# 여행 경비 정산 웹앱 — AI Agent 구현 요구사항

## 프로젝트 개요

여행별로 지출 내역을 기록하고, 인원별 경비를 자동 정산하는 웹앱.
단발성이 아닌 여행 단위로 관리되며, 다양한 입력 방식(직접 입력, 영수증 OCR, CSV 업로드)을 지원한다.

---

## 기술 스택

- **Frontend**: React (Vite) + TypeScript
- **Styling**: Tailwind CSS
- **상태 관리**: Zustand
- **저장소**: localStorage (Phase 1) → Supabase (Phase 2)
- **AI API**: Anthropic Claude API (claude-sonnet-4-20250514)
  - 영수증 OCR (Vision)
  - CSV 컬럼 자동 매핑
  - 외화 → 원화 환율 계산
- **환율 API**: 한국은행 OpenAPI 또는 ExchangeRate-API (결제 시점 환율)
- **배포**: Vercel 또는 Netlify

---

## 화면 구조 (IA)

```
/                       → 홈 (여행 목록)
/trips/new              → 새 여행 만들기
/trips/:id              → 여행 상세 (지출 내역 탭 / 정산 결과 탭)
/trips/:id/expenses/new → 지출 추가 (하단 시트 or 별도 페이지)
```

---

## 기능 명세

### 1. 여행 관리

#### 1-1. 여행 목록 (홈)
- 여행 카드 목록 표시
- 카드 항목: 여행 이름, 날짜 범위, 인원 수, 총 지출 금액, 지출 항목 수
- 최신 여행이 상단에 표시
- `+ 새 여행 만들기` 버튼

#### 1-2. 여행 생성
필수 입력값:
- `name`: 여행 이름 (예: "7월 여름휴가")
- `startDate` / `endDate`: 날짜 범위
- `members`: 멤버 이름 배열 (2명 이상, 중복 불가)
- `defaultCurrency`: 주 통화 선택 (지출 입력 시 기본값으로 사용)
- `defaultPayer`: 주 결제자 선택 (멤버 중 1명, 지출 입력 시 결제자 기본값)

저장 데이터 구조:
```typescript
interface Trip {
  id: string;               // uuid
  name: string;
  startDate: string;        // YYYY-MM-DD
  endDate: string;
  members: Member[];
  defaultCurrency: string;  // 예: "JPY" — 지출 입력 기본 통화
  defaultPayerId: string;   // 주 결제자 멤버 id
  createdAt: string;
}

interface Member {
  id: string;
  name: string;
}
```

---

### 2. 지출 내역

#### 2-1. 지출 목록
- 날짜 오름차순 정렬
- 항목별 표시: 사용처, 원화 금액, 외화 병기(외화일 경우), 참여 인원 태그, 추가 할당 태그
- 항목 탭 시 수정/삭제 가능

저장 데이터 구조:
```typescript
interface Expense {
  id: string;
  tripId: string;
  place: string;            // 사용처
  date: string;             // YYYY-MM-DD
  payerId: string;          // 실제 결제한 멤버 id (기본값: trip.defaultPayerId)
  originalAmount: number;   // 원래 입력 금액
  originalCurrency: string; // 지원 통화 코드 (아래 목록 참고)
  krwAmount: number;        // 원화 환산 금액 (KRW이면 동일)
  exchangeRate?: number;    // 적용된 환율
  participants: string[];   // 부담 대상 멤버 id 배열 (기본값: 전체)
  extraAllocations: ExtraAllocation[]; // 추가 할당
  createdAt: string;
}

interface ExtraAllocation {
  memberId: string;
  amount: number;  // 원화 기준 추가 금액
}
```

---

### 3. 지출 입력 — 3가지 방식

#### 3-1. 직접 입력

UI 구성:
- 결제자 선택 (기본값: `trip.defaultPayerId`, 다른 멤버로 변경 가능)
- 사용처 (text input)
- 날짜 (date picker, 기본값: 오늘)
- 금액 (number input) + 통화 선택 (기본값: `trip.defaultCurrency`)
- 원화 환산 금액 실시간 미리보기 (외화 선택 시)
- 참여 인원 체크박스 (기본값: 전체 선택)
- 추가 할당 (선택): 특정 인원에게 금액 추가 입력

지원 통화 목록 (13개):

| 코드 | 통화명 | 기호 |
|------|--------|------|
| KRW | 한국 원 | ₩ |
| JPY | 일본 엔 | ¥ |
| CNY | 중국 위안 | ¥ |
| TWD | 대만 달러 | NT$ |
| USD | 미국 달러 | $ |
| EUR | 유로 | € |
| GBP | 영국 파운드 | £ |
| AED | 아랍에미리트 디르함 | د.إ |
| AUD | 호주 달러 | A$ |
| HKD | 홍콩 달러 | HK$ |
| SGD | 싱가포르 달러 | S$ |
| THB | 태국 바트 | ฿ |
| VND | 베트남 동 | ₫ |

통화 선택 UI:
- 드롭다운이 아닌 **가로 스크롤 칩 선택** 방식 권장
- 여행 주 통화가 맨 앞에 표시, KRW는 항상 두 번째
- 선택된 통화 기호가 금액 입력창 왼쪽에 자동 표시 (예: `¥ [    ]`)
- 외화 선택 시 입력 즉시 원화 환산 금액 실시간 표시 (예: `≈ 57,600원`)

외화 처리:
- KRW 외 통화 선택 시 입력 시점 환율 API 호출
- 환율 구매 기준 적용
- 환율 조회 실패 시 수동 환율 입력 필드 표시
- 환율 정보 저장 (지출 상세에서 확인 가능)

결제자 선택:
- 기본값: `trip.defaultPayerId` (주 결제자)
- 멤버 칩 형태로 선택 변경 가능 (1명만 선택)
- 결제자는 정산 계산에서 "결제한 금액" 집계에 반영됨

추가 할당 계산 로직:
```
총 원화금액 = krwAmount
추가 할당 합계 = sum(extraAllocations.amount)
N빵 대상 금액 = 총 원화금액 - 추가 할당 합계
참여 인원별 기본 부담 = N빵 대상 금액 / participants.length
최종 부담 = 기본 부담 + 해당 인원의 extraAllocation (없으면 0)
```

#### 3-2. 영수증 OCR

흐름:
1. 입력 방식 탭에서 "영수증 OCR" 선택
2. 두 가지 버튼 제공:
   - `📷 카메라 촬영` → `<input type="file" accept="image/*" capture="environment">` (1장)
   - `🖼 앨범에서 선택` → `<input type="file" accept="image/*" multiple>` (다중)
3. 이미지 업로드 후 Claude Vision API 호출
4. 파싱 결과를 직접 입력 폼에 자동 채움
5. 사용자가 인원/추가 할당만 확인·수정 후 저장

Claude API 프롬프트 (영수증 OCR):
```
다음 영수증 이미지에서 정보를 추출해서 JSON으로만 응답해줘.
{
  "place": "가맹점명 또는 상호",
  "amount": 숫자만,
  "currency": "KRW|JPY|USD|EUR 등 ISO 4217",
  "date": "YYYY-MM-DD 형식, 모르면 null"
}
이미지에서 확인할 수 없는 필드는 null로 반환해.
```

다중 이미지 처리:
- 이미지 개수만큼 순서대로 API 호출 (병렬 처리)
- 각 결과를 항목 리스트로 표시
- 파싱 실패한 항목은 별도 표시 → 수동 입력 유도

#### 3-3. CSV / 엑셀 업로드

흐름:
1. `.xlsx` 또는 `.csv` 파일 업로드
2. 파일 파싱 (SheetJS 또는 PapaParse)
3. 컬럼 구조를 Claude API에 전달 → 자동 매핑
4. 매핑 결과 미리보기 (수정 가능)
5. 일괄 저장

Claude API 프롬프트 (CSV 컬럼 매핑):
```
다음은 카드사 거래내역 CSV의 첫 3행이야:
[헤더행]
[데이터행1]
[데이터행2]

아래 필드에 맞는 컬럼명을 매핑해서 JSON으로만 응답해줘:
{
  "place": "가맹점/사용처 컬럼명",
  "amount": "금액 컬럼명",
  "currency": "통화 컬럼명 (없으면 null)",
  "date": "날짜 컬럼명"
}
```

---

### 4. 정산 계산

#### 4-1. 인원별 총 부담금액 및 결제금액

```typescript
function calculateSettlement(expenses: Expense[], members: Member[]) {
  const burden: Record<string, number> = {};  // 각자 부담해야 할 금액
  const paid: Record<string, number> = {};    // 각자 실제로 결제한 금액

  members.forEach(m => { burden[m.id] = 0; paid[m.id] = 0; });

  expenses.forEach(expense => {
    const { krwAmount, participants, extraAllocations, payerId } = expense;

    // 결제자 집계
    paid[payerId] += krwAmount;

    // 부담 계산 (N빵 + 추가 할당)
    const extraTotal = extraAllocations.reduce((s, e) => s + e.amount, 0);
    const baseAmount = krwAmount - extraTotal;
    const perPerson = baseAmount / participants.length;

    participants.forEach(memberId => {
      const extra = extraAllocations.find(e => e.memberId === memberId)?.amount ?? 0;
      burden[memberId] += perPerson + extra;
    });
  });

  // 순 금액 = 결제금액 - 부담금액 (양수: 받아야 함, 음수: 줘야 함)
  const net: Record<string, number> = {};
  members.forEach(m => { net[m.id] = paid[m.id] - burden[m.id]; });

  return { burden, paid, net };
}
```

#### 4-2. 최소 이체 계산 (Minimum Transfer Algorithm)

```typescript
function minimumTransfers(netAmounts: Record<string, number>): Transfer[] {
  // 순 금액 계산 (결제한 금액 - 부담 금액)
  // 양수: 받아야 할 사람, 음수: 줘야 할 사람
  // 그리디 알고리즘으로 최소 이체 횟수 계산
}

interface Transfer {
  from: string;  // memberId
  to: string;    // memberId
  amount: number;
}
```

정산 결과 화면 표시:
- 인원별 카드: 이름, 총 결제금액, 총 부담금액, 차액
- 최소 이체 목록: "A → B: 30,000원"

---

### 5. 환율 처리

- 외화 입력 시 해당 날짜의 환율 API 호출
- API: `https://api.exchangerate-api.com/v4/latest/{currency}` (무료 플랜)
- 또는 한국은행 OPEN API (`https://ecos.bok.or.kr/api/`)
- **구매 기준 환율** 적용 (매매기준율 × 1.0175 근사치 또는 API에서 직접 조회)
- 환율 조회 실패 시 사용자에게 수동 입력 폼 제공

---

## Phase 2 — 추후 구현 (기획만)

### 토스 연동
- OAuth 2.0 인증 (백엔드 서버 필요)
- 토스 오픈뱅킹 거래내역 조회 API
- 자동 지출 파싱 및 여행 기간 필터링
- 별도 백엔드 서버 (Node.js + Express) 필요

---

## 컴포넌트 구조 (권장)

```
src/
├── components/
│   ├── TripCard.tsx
│   ├── ExpenseItem.tsx
│   ├── ExpenseForm/
│   │   ├── DirectInput.tsx
│   │   ├── OcrInput.tsx
│   │   └── CsvInput.tsx
│   ├── SettlementResult.tsx
│   └── MemberChip.tsx
├── pages/
│   ├── Home.tsx
│   ├── TripDetail.tsx
│   └── NewTrip.tsx
├── store/
│   ├── tripStore.ts      (Zustand)
│   └── expenseStore.ts
├── utils/
│   ├── settlement.ts     (정산 계산 로직)
│   ├── exchangeRate.ts   (환율 API)
│   └── claudeApi.ts      (OCR, CSV 매핑)
└── types/
    └── index.ts
```

---

## 구현 우선순위

| Phase | 기능 | 비고 |
|-------|------|------|
| P1 | 여행 생성/목록 | localStorage |
| P1 | 직접 입력 + N빵 계산 | 핵심 기능 |
| P1 | 정산 결과 (최소 이체) | 핵심 기능 |
| P2 | 외화 환율 API 연동 | ExchangeRate-API |
| P2 | 영수증 OCR | Claude Vision |
| P3 | CSV/엑셀 업로드 | SheetJS + Claude |
| P4 | 토스 연동 | 백엔드 별도 필요 |

---

## 주요 엣지케이스 처리

| 케이스 | 처리 방법 |
|--------|----------|
| OCR 파싱 실패 | 실패 항목만 수동 입력 폼으로 전환 |
| 환율 API 실패 | 수동 환율 입력 폼 표시 |
| 인원 0명 선택 | 저장 버튼 비활성화 + 안내 메시지 |
| 추가 할당 합계 > 총금액 | 유효성 검사 에러 표시 |
| CSV 컬럼 매핑 실패 | 사용자가 직접 드롭다운으로 매핑 |
| 멤버 이름 중복 | 생성 시 중복 체크 |
| 결제자가 participants에 없는 경우 | 결제자는 부담과 무관 — 별도 집계, 경고 없음 |
| 주 통화 미설정 | 여행 생성 시 필수값, 미입력 시 저장 불가 |
| VND 등 소액 단위 통화 | 원화 환산 후 1원 미만 반올림 처리 |
