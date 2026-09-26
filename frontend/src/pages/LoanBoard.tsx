import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Input, Row, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import StatBadge from '../components/common/StatBadge';
import BorrowModal from '../components/common/BorrowModal';
import ReturnModal from '../components/common/ReturnModal';
import LoanHistoryDrawer from '../components/common/LoanHistoryDrawer';
import LoanStatusTag from '../components/common/LoanStatusTag';
import { useBoxStore } from '../stores/boxStore';
import { useHoleStore } from '../stores/holeStore';
import { useLoanStore } from '../stores/loanStore';
import { isActive, isOverdue, loanStatus, overdueDays, type LoanStatus } from '../utils/loan';
import type { CoreLoan } from '../types/loan';

const { Title, Paragraph, Text } = Typography;

type StatusFilter = 'all' | LoanStatus;

interface LoanRow {
  loan: CoreLoan;
  boxNo: string;
  holeNo: string;
}

/** 借阅登记：在借/逾期清单、借出与归还登记、按箱借还历史 */
export default function LoanBoard() {
  const loans = useLoanStore((s) => s.loans);
  const boxes = useBoxStore((s) => s.boxes);
  const holes = useHoleStore((s) => s.holes);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [holeFilter, setHoleFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [returningLoan, setReturningLoan] = useState<CoreLoan | null>(null);
  const [historyBoxId, setHistoryBoxId] = useState<string | null>(null);

  const holeNoOf = (holeId: string) => holes.find((h) => h.id === holeId)?.holeNo ?? '已删除孔';
  const boxOf = (loan: CoreLoan) => boxes.find((b) => b.id === loan.boxId);

  const rows: LoanRow[] = useMemo(
    () =>
      loans
        .map((loan) => {
          const box = boxOf(loan);
          return { loan, boxNo: box?.boxNo ?? loan.boxNo, holeNo: holeNoOf(loan.holeId) };
        })
        .sort((a, b) => {
          // 在借优先，其次按借出时间倒序
          const activeDiff = Number(isActive(b.loan)) - Number(isActive(a.loan));
          if (activeDiff !== 0) return activeDiff;
          return b.loan.borrowedAt.localeCompare(a.loan.borrowedAt);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loans, boxes, holes],
  );

  const activeLoans = loans.filter(isActive);
  const overdueLoans = activeLoans.filter((loan) => isOverdue(loan));
  const returnedToday = loans.filter((loan) => loan.returnedAt && dayjs(loan.returnedAt).isSame(dayjs(), 'day'));

  const filtered = rows.filter(({ loan }) => {
    if (statusFilter !== 'all' && loanStatus(loan) !== statusFilter) return false;
    if (holeFilter !== 'all' && loan.holeId !== holeFilter) return false;
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      const haystack = [loan.boxNo, holeNoOf(loan.holeId), loan.borrower, loan.purpose, loan.registrar, loan.receiver ?? '']
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });

  const columns: TableColumnsType<LoanRow> = [
    {
      title: '状态',
      width: 120,
      render: (_, row) => <LoanStatusTag loan={row.loan} />,
    },
    { title: '箱号', width: 120, render: (_, row) => <Text strong>{row.boxNo}</Text> },
    { title: '孔号', width: 100, render: (_, row) => row.holeNo },
    { title: '领用人', dataIndex: ['loan', 'borrower'], width: 90 },
    { title: '用途', dataIndex: ['loan', 'purpose'], width: 90 },
    {
      title: '借出时间',
      width: 110,
      render: (_, row) => dayjs(row.loan.borrowedAt).format('YYYY-MM-DD'),
    },
    {
      title: '应还日期',
      width: 120,
      sorter: (a, b) => a.loan.dueDate.localeCompare(b.loan.dueDate),
      render: (_, row) => (
        <Text type={isOverdue(row.loan) ? 'danger' : undefined}>
          {row.loan.dueDate}
          {overdueDays(row.loan) > 0 ? `（逾期 ${overdueDays(row.loan)} 天）` : ''}
        </Text>
      ),
    },
    {
      title: '归还时间',
      width: 110,
      render: (_, row) => (row.loan.returnedAt ? dayjs(row.loan.returnedAt).format('YYYY-MM-DD') : '—'),
    },
    {
      title: '归还破损格',
      width: 110,
      render: (_, row) =>
        row.loan.returnedDamagedSlots?.length ? <Tag color="red">{row.loan.returnedDamagedSlots.join(',')}</Tag> : <Tag>{row.loan.returnedAt ? '无破损' : '待验收'}</Tag>,
    },
    { title: '借出登记人', dataIndex: ['loan', 'registrar'], width: 100 },
    { title: '归还验收人', width: 100, render: (_, row) => row.loan.receiver ?? '—' },
    {
      title: '操作',
      width: 170,
      fixed: 'right',
      render: (_, row) => (
        <Space size={2}>
          {isActive(row.loan) ? (
            <Button size="small" type="link" onClick={() => setReturningLoan(row.loan)}>
              归还
            </Button>
          ) : (
            <Button size="small" type="link" onClick={() => setHistoryBoxId(row.loan.boxId)}>
              查看历史
            </Button>
          )}
          <Button size="small" type="link" onClick={() => setHistoryBoxId(row.loan.boxId)}>
            借还记录
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        岩芯箱借阅登记
      </Title>
      <Paragraph type="secondary">
        借出时登记领用人、用途与应还日期；在借箱不能重复借出、调整箱位或移除。归还时验收破损格并恢复入库，历史借还按箱保留，重新借出不冲销旧记录。
      </Paragraph>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <StatBadge label="在借箱" value={activeLoans.length} unit="箱" status="warning" hint="当前未归还的岩芯箱总数" />
        </Col>
        <Col xs={12} md={6}>
          <StatBadge label="其中逾期" value={overdueLoans.length} unit="箱" status={overdueLoans.length ? 'error' : 'success'} hint="超过应还日期仍未归还" />
        </Col>
        <Col xs={12} md={6}>
          <StatBadge label="今日已还" value={returnedToday.length} unit="箱" status="default" hint="今日完成归还入库的箱数" />
        </Col>
        <Col xs={12} md={6}>
          <StatBadge label="累计借阅" value={loans.length} unit="次" status="default" hint="历史借阅登记总条数（含同一箱多次借出）" />
        </Col>
      </Row>

      {overdueLoans.length > 0 ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message={`逾期提醒：${overdueLoans.length} 箱超过应还日期仍未归还`}
          description={
            <Space wrap>
              {overdueLoans.map((loan) => (
                <Tag key={loan.id} color="red">
                  {loan.boxNo} · {loan.borrower} · 应还 {loan.dueDate}（逾期 {overdueDays(loan)} 天）
                </Tag>
              ))}
            </Space>
          }
        />
      ) : null}

      <Card
        size="small"
        title="借阅台账"
        extra={
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { label: '全部', value: 'all' },
                { label: '在借', value: 'active' },
                { label: '逾期', value: 'overdue' },
                { label: '已归还', value: 'returned' },
              ]}
            />
            <Select
              style={{ width: 150 }}
              value={holeFilter}
              onChange={setHoleFilter}
              options={[{ label: '全部钻孔', value: 'all' }, ...holes.map((h) => ({ label: h.holeNo, value: h.id }))]}
            />
            <Input.Search allowClear placeholder="箱号 / 领用人 / 用途" style={{ width: 200 }} onSearch={setKeyword} onChange={(e) => !e.target.value && setKeyword('')} />
            <Button type="primary" onClick={() => setBorrowOpen(true)}>
              借出登记
            </Button>
          </Space>
        }
      >
        <Table
          rowKey={(row) => row.loan.id}
          size="small"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1500 }}
          locale={{ emptyText: '暂无借阅记录，点击右上角「借出登记」开始登记' }}
        />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          箱位调整、破损格标记请在<Link to="/boxes">岩芯箱台账</Link>办理（在借箱相关操作会被锁定）。
        </Paragraph>
      </Card>

      <BorrowModal open={borrowOpen} onClose={() => setBorrowOpen(false)} />
      <ReturnModal open={Boolean(returningLoan)} loan={returningLoan} onClose={() => setReturningLoan(null)} />
      <LoanHistoryDrawer open={Boolean(historyBoxId)} boxId={historyBoxId} onClose={() => setHistoryBoxId(null)} />
    </div>
  );
}
