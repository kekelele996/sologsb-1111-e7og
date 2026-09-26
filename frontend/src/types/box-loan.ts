import dayjs from 'dayjs';

/** 岩芯箱借阅记录（一箱可有多条历史，同一时刻最多一条在借） */
export interface BoxLoan {
  id: string;
  /** 借出的岩芯箱 */
  boxId: string;
  /** 领用人 */
  borrower: string;
  /** 用途 */
  purpose: string;
  /** 借出日期 ISO */
  loanedAt: string;
  /** 应还日期 ISO */
  dueAt: string;
  /** 归还日期 ISO（未归还为空） */
  returnedAt?: string;
  /** 归还时登记的破损格（格序号，从 1 开始） */
  returnDamagedSlots?: number[];
  /** 归还备注 */
  returnRemark?: string;
}

/** 常用借阅用途（可自由填写） */
export const LOAN_PURPOSES: string[] = ['取样化验', '岩矿鉴定', '复查编录', '科研观察', '教学陈列'];

/** 某箱当前的在借记录（未归还即视为在借） */
export function activeLoanOf(loans: BoxLoan[], boxId: string): BoxLoan | undefined {
  return loans.find((loan) => loan.boxId === boxId && !loan.returnedAt);
}

/** 是否逾期：未归还且应还日期早于今天 */
export function isLoanOverdue(loan: BoxLoan): boolean {
  return !loan.returnedAt && dayjs(loan.dueAt).startOf('day').isBefore(dayjs().startOf('day'));
}

/** 逾期天数（已归还或未逾期为 0） */
export function overdueDaysOf(loan: BoxLoan): number {
  if (!isLoanOverdue(loan)) return 0;
  return dayjs().startOf('day').diff(dayjs(loan.dueAt).startOf('day'), 'day');
}
