import { create } from 'zustand';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { isActive } from '../utils/loan';
import type { CoreBox } from '../types/core-box';

export interface BoxInput {
  boxNo: string;
  holeId: string;
  fromDepth: number;
  toDepth: number;
  slots: number;
  slotLength: number;
  boxedAt: string;
  shelfPos: string;
  damagedSlots: number[];
  operator: string;
  remark?: string;
}

interface BoxState {
  boxes: CoreBox[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addBox: (input: BoxInput) => Promise<CoreBox>;
  updateBox: (id: string, patch: Partial<BoxInput>) => Promise<void>;
  removeBox: (id: string) => Promise<void>;
  /** 标记/取消破损格 */
  toggleDamagedSlot: (id: string, slot: number) => Promise<void>;
}

/** 某箱是否存在未归还的借阅记录（在借防护统一走 db 查询，避免与 loanStore 循环依赖） */
async function activeLoanOf(boxId: string) {
  return db.loans.where('boxId').equals(boxId).filter(isActive).first();
}

/** 岩芯箱与格位分配 */
export const useBoxStore = create<BoxState>()((set, get) => ({
  boxes: [],
  hydrated: false,

  hydrate: async () => {
    const boxes = await db.boxes.orderBy('boxNo').toArray();
    set({ boxes, hydrated: true });
  },

  addBox: async (input) => {
    const box: CoreBox = {
      id: uid('box'),
      boxNo: input.boxNo.trim(),
      holeId: input.holeId,
      fromDepth: Number(input.fromDepth) || 0,
      toDepth: Number(input.toDepth) || 0,
      slots: Number(input.slots) || 0,
      slotLength: Number(input.slotLength) || 0,
      boxedAt: input.boxedAt,
      shelfPos: input.shelfPos,
      damagedSlots: input.damagedSlots ?? [],
      operator: input.operator.trim(),
      remark: input.remark?.trim() || undefined,
    };
    await db.boxes.put(box);
    set({ boxes: [...get().boxes, box] });
    return box;
  },

  updateBox: async (id, patch) => {
    const current = get().boxes.find((b) => b.id === id);
    if (!current) return;
    // 在借箱不能调整箱位（其余台账信息仍可更正）
    if (patch.shelfPos !== undefined && patch.shelfPos !== current.shelfPos) {
      const openLoan = await activeLoanOf(id);
      if (openLoan) {
        throw new Error(`箱 ${current.boxNo} 正在借出中（领用人 ${openLoan.borrower}），归还前不能调整箱位`);
      }
    }
    const next: CoreBox = { ...current, ...patch };
    await db.boxes.put(next);
    set({ boxes: get().boxes.map((b) => (b.id === id ? next : b)) });
  },

  removeBox: async (id) => {
    const current = get().boxes.find((b) => b.id === id);
    const openLoan = await activeLoanOf(id);
    if (openLoan) {
      throw new Error(`箱 ${current?.boxNo ?? ''} 正在借出中（领用人 ${openLoan.borrower}），归还前不能移除`);
    }
    await db.boxes.delete(id);
    set({ boxes: get().boxes.filter((b) => b.id !== id) });
  },

  toggleDamagedSlot: async (id, slot) => {
    const current = get().boxes.find((b) => b.id === id);
    if (!current) return;
    // 在借期间破损统一在归还验收时登记，避免台账与借阅记录不一致
    const openLoan = await activeLoanOf(id);
    if (openLoan) {
      throw new Error(`箱 ${current.boxNo} 正在借出中，请在归还时登记破损格`);
    }
    const damagedSlots = current.damagedSlots.includes(slot)
      ? current.damagedSlots.filter((s) => s !== slot)
      : [...current.damagedSlots, slot].sort((a, b) => a - b);
    const next: CoreBox = { ...current, damagedSlots };
    await db.boxes.put(next);
    set({ boxes: get().boxes.map((b) => (b.id === id ? next : b)) });
  },
}));
