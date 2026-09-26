import { create } from 'zustand';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { isActive } from '../utils/loan';
import { useBoxStore } from './boxStore';
import type { CoreBox } from '../types/core-box';
import type { CoreLoan, LoanPurpose } from '../types/loan';

export interface LoanInput {
  boxId: string;
  borrower: string;
  purpose: LoanPurpose;
  /** 应还日期 YYYY-MM-DD */
  dueDate: string;
  registrar: string;
  remark?: string;
}

export interface ReturnInput {
  /** 归还时新登记的破损格（与箱台账已有破损格取并集） */
  damagedSlots: number[];
  receiver: string;
  returnRemark?: string;
}

interface LoanState {
  loans: CoreLoan[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** 某箱当前未归还的借阅记录（在借期间最多一条） */
  activeLoanOfBox: (boxId: string) => CoreLoan | undefined;
  /** 某箱全部借还记录，按借出时间正序（历史借还按箱保留） */
  historyOfBox: (boxId: string) => CoreLoan[];
  /** 借出登记：在借箱不能重复借出 */
  lend: (input: LoanInput) => Promise<CoreLoan>;
  /** 归还登记：补登归还信息与破损格，并恢复入库 */
  giveBack: (loanId: string, input: ReturnInput) => Promise<void>;
}

/** 岩芯箱借阅登记：借出/归还与历史查询 */
export const useLoanStore = create<LoanState>()((set, get) => ({
  loans: [],
  hydrated: false,

  hydrate: async () => {
    const loans = await db.loans.orderBy('borrowedAt').toArray();
    set({ loans, hydrated: true });
  },

  activeLoanOfBox: (boxId) => get().loans.find((loan) => loan.boxId === boxId && isActive(loan)),

  historyOfBox: (boxId) => get().loans.filter((loan) => loan.boxId === boxId).sort((a, b) => a.borrowedAt.localeCompare(b.borrowedAt)),

  lend: async (input) => {
    const box = await db.boxes.get(input.boxId);
    if (!box) {
      throw new Error('岩芯箱不存在，可能已被删除');
    }
    const openLoan = await db.loans.where('boxId').equals(input.boxId).filter(isActive).first();
    if (openLoan) {
      throw new Error(`箱 ${box.boxNo} 仍在借（领用人 ${openLoan.borrower}），请先归还再借出`);
    }
    const loan: CoreLoan = {
      id: uid('loan'),
      boxId: box.id,
      boxNo: box.boxNo,
      holeId: box.holeId,
      shelfPos: box.shelfPos,
      borrower: input.borrower.trim(),
      purpose: input.purpose,
      dueDate: input.dueDate,
      borrowedAt: new Date().toISOString(),
      registrar: input.registrar.trim(),
      remark: input.remark?.trim() || undefined,
    };
    await db.loans.put(loan);
    set({ loans: [...get().loans, loan] });
    return loan;
  },

  giveBack: async (loanId, input) => {
    const current = get().loans.find((loan) => loan.id === loanId);
    if (!current) {
      throw new Error('借阅记录不存在');
    }
    if (!isActive(current)) {
      throw new Error('该借阅记录已归还，不能重复登记');
    }
    const returnedDamagedSlots = [...new Set(input.damagedSlots)].sort((a, b) => a - b);
    const next: CoreLoan = {
      ...current,
      returnedAt: new Date().toISOString(),
      returnedDamagedSlots: returnedDamagedSlots.length ? returnedDamagedSlots : undefined,
      receiver: input.receiver.trim(),
      returnRemark: input.returnRemark?.trim() || undefined,
    };
    let nextBox: CoreBox | undefined;
    // 归还与破损格并入箱台账在同一事务内完成：箱恢复入库，破损格永久保留
    await db.transaction('rw', db.loans, db.boxes, async () => {
      await db.loans.put(next);
      const box = await db.boxes.get(current.boxId);
      if (box) {
        nextBox = { ...box, damagedSlots: [...new Set([...box.damagedSlots, ...returnedDamagedSlots])].sort((a, b) => a - b) };
        await db.boxes.put(nextBox);
      }
    });
    set({ loans: get().loans.map((loan) => (loan.id === loanId ? next : loan)) });
    if (nextBox) {
      const boxStore = useBoxStore.getState();
      useBoxStore.setState({ boxes: boxStore.boxes.map((b) => (b.id === nextBox!.id ? nextBox! : b)) });
    }
  },
}));
