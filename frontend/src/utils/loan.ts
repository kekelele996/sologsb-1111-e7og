import dayjs from 'dayjs';
import type { CoreLoan } from '../types/loan';

/** 是否已归还 */
export function isReturned(loan: CoreLoan): boolean {
  return Boolean(loan.returnedAt);
}

/** 仍在借：未登记归还时间 */
export function isActive(loan: CoreLoan): boolean {
  return !isReturned(loan);
}

/**
 * 是否逾期：仅对在借记录判断，当天到期不算逾期（应还日期次日起算）。
 * `now` 可注入，便于按日比较与测试。
 */
export function isOverdue(loan: CoreLoan, now: dayjs.ConfigType = Date.now()): boolean {
  if (isReturned(loan)) return false;
  return dayjs(now).startOf('day').isAfter(dayjs(loan.dueDate).startOf('day'));
}

/** 逾期天数（未逾期返回 0） */
export function overdueDays(loan: CoreLoan, now: dayjs.ConfigType = Date.now()): number {
  if (isReturned(loan)) return 0;
  const days = dayjs(now).startOf('day').diff(dayjs(loan.dueDate).startOf('day'), 'day');
  return Math.max(0, days);
}

/** 借阅状态：逾期 / 在借 / 已还 */
export type LoanStatus = 'overdue' | 'active' | 'returned';

export function loanStatus(loan: CoreLoan, now: dayjs.ConfigType = Date.now()): LoanStatus {
  if (isReturned(loan)) return 'returned';
  return isOverdue(loan, now) ? 'overdue' : 'active';
}

export const LOAN_STATUS_TEXT: Record<LoanStatus, string> = {
  overdue: '逾期未还',
  active: '在借',
  returned: '已归还',
};
