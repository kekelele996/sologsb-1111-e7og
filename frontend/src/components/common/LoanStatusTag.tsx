import { Tag, Tooltip } from 'antd';
import { LOAN_STATUS_TEXT, loanStatus, overdueDays } from '../../utils/loan';
import type { CoreLoan } from '../../types/loan';

export interface LoanStatusTagProps {
  loan: CoreLoan;
  /** 逾期天数提示注入当前时间（默认取当前系统时间） */
  now?: number;
}

/** 借阅状态标签：逾期未还（红）/ 在借（蓝）/ 已归还（绿） */
export default function LoanStatusTag({ loan, now = Date.now() }: LoanStatusTagProps) {
  const status = loanStatus(loan, now);
  if (status === 'overdue') {
    return (
      <Tooltip title={`应还 ${loan.dueDate}，已逾期 ${overdueDays(loan, now)} 天`}>
        <Tag color="red">{LOAN_STATUS_TEXT.overdue} {overdueDays(loan, now)} 天</Tag>
      </Tooltip>
    );
  }
  if (status === 'active') {
    return <Tag color="blue">{LOAN_STATUS_TEXT.active}</Tag>;
  }
  return <Tag color="green">{LOAN_STATUS_TEXT.returned}</Tag>;
}
