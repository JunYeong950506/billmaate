export type CurrencyCode =
  | 'KRW'
  | 'JPY'
  | 'CNY'
  | 'TWD'
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'AED'
  | 'AUD'
  | 'HKD'
  | 'SGD'
  | 'THB'
  | 'VND';

export interface Member {
  id: string;
  name: string;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  members: Member[];
  defaultCurrency: CurrencyCode;
  defaultPayerId: string;
  createdAt: string;
}

export interface ExtraAllocation {
  memberId: string;
  amount: number;
}

export interface Expense {
  id: string;
  tripId: string;
  place: string;
  date: string;
  paymentMethod?: string;
  payerId: string;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  estimatedKrwAmount: number;
  finalKrwAmount?: number;
  krwAmount?: number;
  exchangeRate?: number;
  participants: string[];
  extraAllocations: ExtraAllocation[];
  createdAt: string;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface NewTripInput {
  name: string;
  startDate: string;
  endDate: string;
  members: string[];
  defaultCurrency: CurrencyCode;
  defaultPayerName: string;
}

export interface NewExpenseInput {
  tripId: string;
  place: string;
  date: string;
  paymentMethod?: string;
  payerId: string;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  estimatedKrwAmount: number;
  finalKrwAmount?: number;
  exchangeRate?: number;
  participants: string[];
  extraAllocations: ExtraAllocation[];
}

export interface TripSummary {
  tripId: string;
  expenseCount: number;
  totalKrw: number;
}
