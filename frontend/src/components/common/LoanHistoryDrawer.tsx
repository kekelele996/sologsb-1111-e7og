import { useMemo } from 'react';
import { Descriptions, Drawer, Empty, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { useBoxStore } from '../../stores/boxStore';
import { useHoleStore } from '../../stores/holeStore';
import { useLoanStore } from '../../stores/loanStore';
import LoanStatusTag from './LoanStatusTag';
import { overdueDays } from '../../utils/loan';
import type { CoreLoan } from '../../types/loan';

const { Text } = Typography;

export interface LoanHistoryDrawerProps {
  open: boolean;
  boxId: string | null;
  onClose: () => void;
}

/** 某箱的历史借还记录：记录追加保存，重新借出不会冲掉以前记录 */
export default function LoanHistoryDrawer({ open, boxId, onClose }: LoanHistoryDrawerProps) {
  const boxes = useBoxStore((s) => s.boxes);
  const holes = useHoleStore((s) => s.holes);
  const historyOfBox = useLoanStore((s) => s.historyOfBox);

  const box = useMemo(() => boxes.find((b) => b.id === boxId), [boxes, boxId]);
  const loans = useMemo(() => (boxId ? historyOfBox(boxId) : []), [historyOfBox, boxId]);
  const holeNo = box ? holes.find((h) => h.id === box.holeId)?.holeNo ?? '未知孔' : '';

  const columns: TableColumnsType<CoreLoan> = [
    { title: '借出时间', width: 110, render: (_, row) => dayjs(row.borrowedAt).format('YYYY-MM-DD') },
    { title: '领用人', dataIndex: 'borrower', width: 90 },
    { title: '用途', dataIndex: 'purpose', width: 90 },
    {
      title: '应还日期',
      dataIndex: 'dueDate',
      width: 110,
      render: (v: string, row) => (
        <Text type={overdueDays(row) > 0 ? 'danger' : undefined}>{v}</Text>
      ),
    },
    { title: '登记人', dataIndex: 'registrar', width: 90 },
    {
      title: '归还时间',
      width: 110,
      render: (_, row) => (row.returnedAt ? dayjs(row.returnedAt).format('YYYY-MM-DD') : '—'),
    },
    {
      title: '归还破损格',
      width: 100,
      render: (_, row) =>
        row.returnedDamagedSlots?.length ? <Tag color="red">{row.returnedDamagedSlots.join(',')}</Tag> : <Tag>{row.returnedAt ? '无' : '待验收'}</Tag>,
    },
    { title: '验收人', width: 90, render: (_, row) => row.receiver ?? '—' },
    {
      title: '状态',
      width: 120,
      render: (_, row) => <LoanStatusTag loan={row} />,
    },
    {
      title: '备注',
      render: (_, row) => (
        <Text type="secondary">
          {[row.remark, row.returnRemark].filter(Boolean).join('；') || '—'}
        </Text>
      ),
    },
  ];

  return (
    <Drawer open={open} title={box ? `借还历史 · ${box.boxNo}` : '借还历史'} width={980} onClose={onClose} destroyOnClose>
      {box ? (
        <Descriptions size="small" style={{ marginBottom: 12 }}>
          <Descriptions.Item label="钻孔">{holeNo}</Descriptions.Item>
          <Descriptions.Item label="深度区间">{box.fromDepth}~{box.toDepth}m</Descriptions.Item>
          <Descriptions.Item label="库架位">{box.shelfPos}</Descriptions.Item>
          <Descriptions.Item label="累计借阅">{loans.length} 次</Descriptions.Item>
        </Descriptions>
      ) : null}
      {loans.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该箱暂无借阅记录" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={[...loans].reverse()}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      )}
    </Drawer>
  );
}
