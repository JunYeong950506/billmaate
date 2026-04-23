import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { Expense, Member, NewExpenseInput, NewTripInput, Trip } from '../types';
import { createId } from '../utils/ids';

interface TravelStore {
  trips: Trip[];
  expenses: Expense[];
  createTrip: (input: NewTripInput) => Trip;
  addExpense: (input: NewExpenseInput) => void;
  updateExpense: (expenseId: string, input: NewExpenseInput) => void;
  setExpenseFinalKrwAmount: (expenseId: string, finalKrwAmount?: number) => void;
  removeExpense: (expenseId: string) => void;
}

const STORAGE_KEY = 'billmate-prototype-v1';

function normalizeMemberNames(rawNames: string[]): string[] {
  const trimmed = rawNames.map((name) => name.trim()).filter((name) => name.length > 0);
  const seen = new Set<string>();
  return trimmed.filter((name) => {
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}

function buildMembers(names: string[]): Member[] {
  return names.map((name) => ({
    id: createId(),
    name,
  }));
}

function normalizeAmount(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

export const useTravelStore = create<TravelStore>()(
  persist(
    (set) => ({
      trips: [],
      expenses: [],
      createTrip: (input) => {
        const names = normalizeMemberNames(input.members);
        if (names.length < 2) {
          throw new Error('멤버는 최소 2명 이상이어야 합니다.');
        }

        const members = buildMembers(names);
        const defaultPayer = members.find((member) => member.name === input.defaultPayerName) ?? members[0];

        const nextTrip: Trip = {
          id: createId(),
          name: input.name.trim(),
          startDate: input.startDate,
          endDate: input.endDate,
          members,
          defaultCurrency: input.defaultCurrency,
          defaultPayerId: defaultPayer.id,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          trips: [nextTrip, ...state.trips],
        }));

        return nextTrip;
      },
      addExpense: (input) => {
        const estimatedKrwAmount = normalizeAmount(input.estimatedKrwAmount) ?? 0;
        const finalKrwAmount = normalizeAmount(input.finalKrwAmount);

        const nextExpense: Expense = {
          id: createId(),
          tripId: input.tripId,
          place: input.place.trim(),
          date: input.date,
          paymentMethod: input.paymentMethod?.trim() || undefined,
          payerId: input.payerId,
          originalAmount: input.originalAmount,
          originalCurrency: input.originalCurrency,
          estimatedKrwAmount,
          finalKrwAmount,
          krwAmount: estimatedKrwAmount,
          exchangeRate: normalizeAmount(input.exchangeRate),
          participants: [...input.participants],
          extraAllocations: input.extraAllocations.map((item) => ({ ...item })),
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          expenses: [...state.expenses, nextExpense],
        }));
      },
      updateExpense: (expenseId, input) => {
        const estimatedKrwAmount = normalizeAmount(input.estimatedKrwAmount) ?? 0;
        const finalKrwAmount = normalizeAmount(input.finalKrwAmount);

        set((state) => ({
          expenses: state.expenses.map((expense) => {
            if (expense.id !== expenseId) {
              return expense;
            }

            return {
              ...expense,
              tripId: input.tripId,
              place: input.place.trim(),
              date: input.date,
              paymentMethod: input.paymentMethod?.trim() || undefined,
              payerId: input.payerId,
              originalAmount: input.originalAmount,
              originalCurrency: input.originalCurrency,
              estimatedKrwAmount,
              finalKrwAmount,
              krwAmount: estimatedKrwAmount,
              exchangeRate: normalizeAmount(input.exchangeRate),
              participants: [...input.participants],
              extraAllocations: input.extraAllocations.map((item) => ({ ...item })),
            };
          }),
        }));
      },
      setExpenseFinalKrwAmount: (expenseId, finalKrwAmount) => {
        const normalized = normalizeAmount(finalKrwAmount);
        set((state) => ({
          expenses: state.expenses.map((expense) => {
            if (expense.id !== expenseId) {
              return expense;
            }

            return {
              ...expense,
              finalKrwAmount: normalized,
            };
          }),
        }));
      },
      removeExpense: (expenseId) => {
        set((state) => ({
          expenses: state.expenses.filter((expense) => expense.id !== expenseId),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        trips: state.trips,
        expenses: state.expenses,
      }),
    },
  ),
);

