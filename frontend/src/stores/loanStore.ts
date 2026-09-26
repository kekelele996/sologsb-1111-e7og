import { create } from 'zustand';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { activeLoanOf, type BoxLoan } from '../types/box-loan';
import { useBoxStore } from './boxStore';

export interface LoanInput {
  boxId: string;
  borrower: string;
  purpose: string;
  loanedAt: string;
  dueAt: string;
}

export interface ReturnInput {
  returnedAt: string;
  damagedSlots: number[];
  remark?: string;
}

interface LoanState {
  loans: BoxLoan[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** 借出登记：在借箱重复借出将被拒绝 */
  loanOut: (input: LoanInput) => Promise<{ loan?: BoxLoan; error?: string }>;
  /** 归还登记：登记破损格并恢复入库（破损格合并回岩芯箱台账） */
  returnLoan: (loanId: string, input: ReturnInput) => Promise<void>;
  /** 删除岩芯箱时级联清理其借阅记录 */
  removeLoansOfBox: (boxId: string) => Promise<void>;
}

/** 岩芯箱借阅台账：借出 / 归还 / 历史记录 */
export const useLoanStore = create<LoanState>()((set, get) => ({
  loans: [],
  hydrated: false,

  hydrate: async () => {
    const loans = await db.loans.orderBy('loanedAt').toArray();
    set({ loans, hydrated: true });
  },

  loanOut: async (input) => {
    if (activeLoanOf(get().loans, input.boxId)) {
      return { error: '该箱正在借出中，归还后才能再次借出' };
    }
    const loan: BoxLoan = {
      id: uid('loan'),
      boxId: input.boxId,
      borrower: input.borrower.trim(),
      purpose: input.purpose.trim(),
      loanedAt: input.loanedAt,
      dueAt: input.dueAt,
    };
    await db.loans.put(loan);
    set({ loans: [...get().loans, loan] });
    return { loan };
  },

  returnLoan: async (loanId, input) => {
    const current = get().loans.find((loan) => loan.id === loanId);
    if (!current || current.returnedAt) return;
    const next: BoxLoan = {
      ...current,
      returnedAt: input.returnedAt,
      returnDamagedSlots: input.damagedSlots,
      returnRemark: input.remark?.trim() || undefined,
    };
    await db.loans.put(next);
    set({ loans: get().loans.map((loan) => (loan.id === loanId ? next : loan)) });
    // 归还登记的破损格并入箱台账，恢复入库
    if (input.damagedSlots.length > 0) {
      await useBoxStore.getState().mergeDamagedSlots(current.boxId, input.damagedSlots);
    }
  },

  removeLoansOfBox: async (boxId) => {
    await db.loans.where('boxId').equals(boxId).delete();
    set({ loans: get().loans.filter((loan) => loan.boxId !== boxId) });
  },
}));
