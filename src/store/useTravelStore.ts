import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { Expense, Member, NewExpenseInput, NewTripInput, Trip } from '../types';
import { resolveEstimatedKrwFromInput } from '../utils/expenseAmount';
import { createId } from '../utils/ids';

interface TravelStore {
  trips: Trip[];
  expenses: Expense[];
  createTrip: (input: NewTripInput) => Trip;
  updateTrip: (tripId: string, input: NewTripInput) => void;
  addExpense: (input: NewExpenseInput) => void;
  updateExpense: (expenseId: string, input: NewExpenseInput) => void;
  setExpenseFinalKrwAmount: (expenseId: string, finalKrwAmount?: number) => void;
  removeExpense: (expenseId: string) => void;
  removeTrip: (tripId: string) => void;
  restoreTripWithExpenses: (trip: Trip, expenses: Expense[]) => void;
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

function buildMembers(names: string[], previousMembers: Member[] = []): Member[] {
  const reusable = new Map<string, Member>();
  previousMembers.forEach((member) => {
    if (!reusable.has(member.name)) {
      reusable.set(member.name, member);
    }
  });

  return names.map((name) => {
    const reused = reusable.get(name);
    return reused ? { ...reused, name } : { id: createId(), name };
  });
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
    (set, get) => ({
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
      updateTrip: (tripId, input) => {
        const currentTrip = get().trips.find((trip) => trip.id === tripId);
        if (!currentTrip) {
          throw new Error('수정할 여행을 찾을 수 없습니다.');
        }

        const names = normalizeMemberNames(input.members);
        if (names.length < 2) {
          throw new Error('멤버는 최소 2명 이상이어야 합니다.');
        }

        const members = buildMembers(names, currentTrip.members);
        const defaultPayer = members.find((member) => member.name === input.defaultPayerName) ?? members[0];
        const validMemberIds = new Set(members.map((member) => member.id));

        set((state) => ({
          trips: state.trips.map((trip) => {
            if (trip.id !== tripId) {
              return trip;
            }

            return {
              ...trip,
              name: input.name.trim(),
              startDate: input.startDate,
              endDate: input.endDate,
              members,
              defaultCurrency: input.defaultCurrency,
              defaultPayerId: defaultPayer.id,
            };
          }),
          expenses: state.expenses.map((expense) => {
            if (expense.tripId !== tripId) {
              return expense;
            }

            const nextPayerId = validMemberIds.has(expense.payerId) ? expense.payerId : defaultPayer.id;
            const nextParticipants = expense.participants.filter((participantId) => validMemberIds.has(participantId));
            const participants = nextParticipants.length > 0 ? nextParticipants : [nextPayerId];

            return {
              ...expense,
              payerId: nextPayerId,
              participants,
              extraAllocations: expense.extraAllocations.filter((item) => validMemberIds.has(item.memberId)),
            };
          }),
        }));
      },
      addExpense: (input) => {
        const exchangeRate = normalizeAmount(input.exchangeRate);
        const estimatedKrwAmount = resolveEstimatedKrwFromInput({
          originalAmount: input.originalAmount,
          originalCurrency: input.originalCurrency,
          estimatedKrwAmount: input.estimatedKrwAmount,
          exchangeRate,
        });
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
          exchangeRate,
          participants: [...input.participants],
          extraAllocations: input.extraAllocations.map((item) => ({ ...item })),
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          expenses: [...state.expenses, nextExpense],
        }));
      },
      updateExpense: (expenseId, input) => {
        const exchangeRate = normalizeAmount(input.exchangeRate);
        const estimatedKrwAmount = resolveEstimatedKrwFromInput({
          originalAmount: input.originalAmount,
          originalCurrency: input.originalCurrency,
          estimatedKrwAmount: input.estimatedKrwAmount,
          exchangeRate,
        });
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
              exchangeRate,
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
      removeTrip: (tripId) => {
        set((state) => ({
          trips: state.trips.filter((trip) => trip.id !== tripId),
          expenses: state.expenses.filter((expense) => expense.tripId !== tripId),
        }));
      },
      restoreTripWithExpenses: (trip, expenses) => {
        set((state) => {
          const hasTrip = state.trips.some((item) => item.id === trip.id);
          const existingExpenseIds = new Set(state.expenses.map((item) => item.id));
          const restoredExpenses = expenses.filter((expense) => !existingExpenseIds.has(expense.id));

          return {
            trips: hasTrip ? state.trips : [trip, ...state.trips],
            expenses: restoredExpenses.length > 0 ? [...state.expenses, ...restoredExpenses] : state.expenses,
          };
        });
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



