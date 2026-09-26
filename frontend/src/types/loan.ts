/** 借阅用途 */
export const LOAN_PURPOSES = ['取样化验', '地质复查', '对外展示', '教学培训', '科研借阅', '其他'] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

/**
 * 岩芯箱借阅记录：每次借出生成一条，归还后补登归还信息。
 * 记录只追加、不覆盖：同一箱重新借出会产生新记录，历史借还按箱永久保留。
 * 借出时对箱号/孔号/库架位做快照，之后箱位调整不影响历史记录。
 */
export interface CoreLoan {
  id: string;
  /** 被借阅的岩芯箱 id */
  boxId: string;
  /** 借出时箱号快照 */
  boxNo: string;
  /** 借出时所属钻孔快照 */
  holeId: string;
  /** 借出时库架位快照 */
  shelfPos: string;
  /** 领用人 */
  borrower: string;
  /** 用途 */
  purpose: LoanPurpose;
  /** 应还日期（YYYY-MM-DD） */
  dueDate: string;
  /** 借出时间 ISO */
  borrowedAt: string;
  /** 借出登记人 */
  registrar: string;
  /** 借出备注 */
  remark?: string;
  /** 归还时间 ISO；为空表示仍在借 */
  returnedAt?: string;
  /** 归还验收时登记的破损格（格序号，从 1 开始） */
  returnedDamagedSlots?: number[];
  /** 归还验收人 */
  receiver?: string;
  /** 归还备注（破损情况说明等） */
  returnRemark?: string;
}
