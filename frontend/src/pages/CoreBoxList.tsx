import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Col, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import BoxGrid from '../components/common/BoxGrid';
import DepthRangeInput from '../components/common/DepthRangeInput';
import EmptyPanel from '../components/common/EmptyPanel';
import BorrowModal from '../components/common/BorrowModal';
import ReturnModal from '../components/common/ReturnModal';
import LoanHistoryDrawer from '../components/common/LoanHistoryDrawer';
import { useHoleStore } from '../stores/holeStore';
import { useRunStore } from '../stores/runStore';
import { useBoxStore } from '../stores/boxStore';
import { useLoanStore } from '../stores/loanStore';
import { SHELF_POSITIONS, type CoreBox, type BoxContinuity } from '../types/core-box';
import type { CoreLoan } from '../types/loan';
import { isActive, overdueDays } from '../utils/loan';
import { parseSlots } from '../utils/slots';
import { boxCapacityOk, checkBoxContinuity, validateRange } from '../utils/recovery';

const { Title, Paragraph, Text } = Typography;

interface BoxFormValues {
  boxNo: string;
  holeId: string;
  fromDepth: number;
  toDepth: number;
  slots: number;
  slotLength: number;
  boxedAt: Dayjs;
  shelfPos: string;
  operator: string;
  damagedText?: string;
  remark?: string;
}

/** 岩芯箱编目与格位分配：校验深度连续性 */
export default function CoreBoxList() {
  const { message } = AntApp.useApp();
  const holes = useHoleStore((s) => s.holes);
  const currentHoleId = useHoleStore((s) => s.currentHoleId);
  const setCurrentHole = useHoleStore((s) => s.setCurrentHole);
  const runs = useRunStore((s) => s.runs);
  const boxes = useBoxStore((s) => s.boxes);
  const addBox = useBoxStore((s) => s.addBox);
  const updateBox = useBoxStore((s) => s.updateBox);
  const removeBox = useBoxStore((s) => s.removeBox);
  const toggleDamagedSlot = useBoxStore((s) => s.toggleDamagedSlot);
  const loans = useLoanStore((s) => s.loans);

  const [form] = Form.useForm<BoxFormValues>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CoreBox | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState('');
  const [borrowBox, setBorrowBox] = useState<CoreBox | null>(null);
  const [returningLoan, setReturningLoan] = useState<CoreLoan | null>(null);
  const [historyBoxId, setHistoryBoxId] = useState<string | null>(null);
  /** 深度区间以本地 state 为唯一数据源（Form.useWatch 在弹窗挂载前可能读不到值） */
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 0, to: 0 });

  const holeOptions = holes.map((hole) => ({ label: `${hole.holeNo} · ${hole.rigNo}`, value: hole.id }));
  const activeHoleId = currentHoleId || holes[0]?.id || '';
  const holeBoxes = useMemo(() => boxes.filter((b) => b.holeId === activeHoleId), [boxes, activeHoleId]);
  const selectedBox = useMemo(
    () => holeBoxes.find((b) => b.id === selectedBoxId) ?? holeBoxes[0],
    [holeBoxes, selectedBoxId],
  );

  const activeLoanMap = useMemo(() => {
    const map = new Map<string, CoreLoan>();
    loans.filter(isActive).forEach((loan) => map.set(loan.boxId, loan));
    return map;
  }, [loans]);
  const activeLoanOf = (boxId: string) => activeLoanMap.get(boxId);

  const continuityOf = (box: CoreBox): BoxContinuity => checkBoxContinuity(box, runs);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    const lastBox = holeBoxes.reduce<CoreBox | undefined>((acc, box) => (!acc || box.toDepth > acc.toDepth ? box : acc), undefined);
    const from = lastBox ? lastBox.toDepth : 0;
    const to = Number((from + 25).toFixed(2));
    setRange({ from, to });
    form.setFieldsValue({
      boxNo: `X-${holes.find((h) => h.id === activeHoleId)?.holeNo.replace(/^ZK-/, '') ?? '0000'}-${String(holeBoxes.length + 1).padStart(2, '0')}`,
      holeId: activeHoleId,
      fromDepth: from,
      toDepth: to,
      slots: 10,
      slotLength: 2.5,
      boxedAt: dayjs(),
      shelfPos: SHELF_POSITIONS[0],
      operator: '高振华',
      damagedText: '',
    } as unknown as BoxFormValues);
    setOpen(true);
  };

  const openEdit = (record: CoreBox) => {
    setEditing(record);
    setRange({ from: record.fromDepth, to: record.toDepth });
    form.setFieldsValue({
      boxNo: record.boxNo,
      holeId: record.holeId,
      fromDepth: record.fromDepth,
      toDepth: record.toDepth,
      slots: record.slots,
      slotLength: record.slotLength,
      boxedAt: dayjs(record.boxedAt),
      shelfPos: record.shelfPos,
      operator: record.operator,
      damagedText: record.damagedSlots.join(','),
      remark: record.remark,
    } as unknown as BoxFormValues);
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const rangeError = validateRange(range.from, range.to);
    if (rangeError) {
      message.error(rangeError);
      return;
    }
    const payload = {
      boxNo: values.boxNo,
      holeId: values.holeId,
      fromDepth: range.from,
      toDepth: range.to,
      slots: Number(values.slots) || 0,
      slotLength: Number(values.slotLength) || 0,
      boxedAt: values.boxedAt.toISOString(),
      shelfPos: values.shelfPos,
      operator: values.operator,
      damagedSlots: parseSlots(values.damagedText).filter((slot) => slot <= (Number(values.slots) || 0)),
      remark: values.remark,
    };
    const draft: CoreBox = { id: editing?.id ?? 'draft', ...payload };
    if (!boxCapacityOk(draft)) {
      message.error('格数 × 每格长度小于区间长度，格位容量不足');
      return;
    }
    const continuity = checkBoxContinuity(draft, runs);
    if (editing) {
      try {
        await updateBox(editing.id, payload);
      } catch (error) {
        message.error((error as Error).message);
        return;
      }
      message.success(`已更新箱 ${payload.boxNo}`);
    } else {
      const created = await addBox(payload);
      setSelectedBoxId(created.id);
      message.success(`已装箱 ${payload.boxNo}`);
    }
    if (!continuity.covered) {
      message.warning(continuity.message);
    }
    setOpen(false);
  };

  const columns: TableColumnsType<CoreBox> = [
    { title: '箱号', dataIndex: 'boxNo', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: '深度区间(m)', width: 130, render: (_, row) => `${row.fromDepth}~${row.toDepth}` },
    { title: '格数', dataIndex: 'slots', width: 70, align: 'right' },
    { title: '每格长度(m)', dataIndex: 'slotLength', width: 110, align: 'right' },
    { title: '库架位', dataIndex: 'shelfPos', width: 110, render: (v: string, row) => (activeLoanOf(row.id) ? <Text type="secondary">{v}（外借）</Text> : v) },
    {
      title: '借阅状态',
      width: 150,
      render: (_, row) => {
        const loan = activeLoanOf(row.id);
        if (!loan) return <Tag color="green">在库</Tag>;
        const days = overdueDays(loan);
        return (
          <Tooltip title={`领用人 ${loan.borrower} · ${loan.purpose} · 应还 ${loan.dueDate}${days > 0 ? `（逾期 ${days} 天）` : ''}`}>
            <Tag color={days > 0 ? 'red' : 'blue'}>
              {days > 0 ? `逾期 ${days} 天` : '在借'} · {loan.borrower}
            </Tag>
          </Tooltip>
        );
      },
    },
    { title: '装箱日期', dataIndex: 'boxedAt', width: 110, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '装箱人', dataIndex: 'operator', width: 90 },
    {
      title: '破损格',
      width: 100,
      render: (_, row) => (row.damagedSlots.length ? <Tag color="red">{row.damagedSlots.join(',')}</Tag> : <Tag color="green">无</Tag>),
    },
    {
      title: '深度连续性校验',
      width: 320,
      render: (_, row) => {
        const continuity = continuityOf(row);
        return continuity.covered ? (
          <Text type="success">{continuity.message}</Text>
        ) : (
          <Text type="danger">{continuity.message}</Text>
        );
      },
    },
    {
      title: '操作',
      width: 300,
      fixed: 'right',
      render: (_, record) => {
        const loan = activeLoanOf(record.id);
        return (
          <Space size={2} wrap>
            <Button size="small" type="link" onClick={() => setSelectedBoxId(record.id)}>
              查看格位
            </Button>
            {loan ? (
              <Button size="small" type="link" onClick={() => setReturningLoan(loan)}>
                归还
              </Button>
            ) : (
              <Button size="small" type="link" onClick={() => setBorrowBox(record)}>
                借出
              </Button>
            )}
            <Tooltip title={loan ? '在借箱可更正台账，但箱位须归还后才能调整' : undefined}>
              <Button size="small" type="link" onClick={() => openEdit(record)}>
                编辑
              </Button>
            </Tooltip>
            <Button size="small" type="link" onClick={() => setHistoryBoxId(record.id)}>
              借还记录
            </Button>
            {loan ? (
              <Tooltip title={`箱 ${record.boxNo} 正在借出（领用人 ${loan.borrower}），归还前不能移除`}>
                <Button size="small" type="link" danger disabled>
                  移除
                </Button>
              </Tooltip>
            ) : (
              <Popconfirm
                title={`确认移除岩芯箱 ${record.boxNo}？`}
                onConfirm={() =>
                  removeBox(record.id)
                    .then(() => message.success('已移除'))
                    .catch((error: Error) => message.error(error.message))
                }
              >
                <Button size="small" type="link" danger>
                  移除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  const formHoleId = Form.useWatch('holeId', form) ?? activeHoleId;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        岩芯箱编目与格位分配
      </Title>
      <Paragraph type="secondary">
        按深度区间分配格位，装箱时校验区间与回次是否连续；断档在格位网格中以虚线标出，破损格可点击切换标记。借出在「借阅登记」或本行「借出」办理；在借箱不能调整箱位、不能移除，破损格于归还验收时登记。
      </Paragraph>

      <Space style={{ marginBottom: 12 }} wrap>
        <span style={{ color: '#6b7a86' }}>当前钻孔</span>
        <Select style={{ width: 200 }} value={activeHoleId} onChange={setCurrentHole} options={holeOptions} placeholder="选择钻孔" />
        <Button type="primary" onClick={openCreate} disabled={!activeHoleId}>
          新建岩芯箱
        </Button>
      </Space>

      {holeBoxes.length === 0 ? (
        <EmptyPanel description="该孔暂无岩芯箱记录" actionText="新建岩芯箱" onAction={openCreate} />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card
              size="small"
              title="格位网格（点击切换破损标记）"
              extra={
                <Select
                  style={{ width: 170 }}
                  value={selectedBox?.id}
                  onChange={setSelectedBoxId}
                  options={holeBoxes.map((box) => ({ label: `${box.boxNo}（${box.fromDepth}~${box.toDepth}m）`, value: box.id }))}
                />
              }
            >
              {selectedBox ? (
                <>
                  {activeLoanOf(selectedBox.id) ? (
                    <Alert
                      style={{ marginBottom: 10 }}
                      type="warning"
                      showIcon
                      message={(() => {
                        const loan = activeLoanOf(selectedBox.id)!;
                        const days = overdueDays(loan);
                        return `该箱正在借出中：领用人 ${loan.borrower} · 用途 ${loan.purpose} · 应还 ${loan.dueDate}${days > 0 ? `（已逾期 ${days} 天）` : ''}。归还前不能调整箱位或标记破损，归还验收时统一登记破损格。`;
                      })()}
                    />
                  ) : null}
                  <BoxGrid
                    box={selectedBox}
                    runs={runs}
                    onToggleDamaged={
                      activeLoanOf(selectedBox.id)
                        ? undefined
                        : (slot) =>
                            toggleDamagedSlot(selectedBox.id, slot).catch((error: Error) => {
                              message.error(error.message);
                            })
                    }
                  />
                  <Alert
                    style={{ marginTop: 10 }}
                    type={continuityOf(selectedBox).covered ? 'success' : 'warning'}
                    showIcon
                    message={continuityOf(selectedBox).message}
                  />
                </>
              ) : null}
            </Card>
          </Col>
          <Col xs={24}>
            <Card size="small" title="岩芯箱台账">
              <Table rowKey="id" size="small" columns={columns} dataSource={holeBoxes} pagination={{ pageSize: 6 }} scroll={{ x: 1750 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Modal open={open} title={editing ? `编辑岩芯箱 · ${editing.boxNo}` : '新建岩芯箱'} onCancel={() => setOpen(false)} onOk={submit} okText="保存" cancelText="取消" width={720}>
        <Form form={form} layout="vertical">
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="boxNo" label="箱号" rules={[{ required: true, message: '请输入箱号' }]}>
              <Input style={{ width: 180 }} maxLength={24} placeholder="如：X-2401-02" />
            </Form.Item>
            <Form.Item name="holeId" label="钻孔" rules={[{ required: true, message: '请选择钻孔' }]}>
              <Select style={{ width: 200 }} options={holeOptions} />
            </Form.Item>
            <Form.Item
              name="shelfPos"
              label="库架位"
              rules={[{ required: true, message: '请选择库架位' }]}
              help={editing && activeLoanOf(editing.id) ? '该箱正在借出，归还入库后才能调整箱位' : undefined}
            >
              <Select
                style={{ width: 150 }}
                disabled={Boolean(editing && activeLoanOf(editing.id))}
                options={SHELF_POSITIONS.map((v) => ({ label: v, value: v }))}
              />
            </Form.Item>
          </Space>

          <Form.Item label="深度区间" required>
            <DepthRangeInput
              fromDepth={range.from}
              toDepth={range.to}
              referenceRuns={runs.filter((run) => run.holeId === formHoleId)}
              maxDepth={holes.find((h) => h.id === formHoleId)?.designDepth}
              onChange={(patch) => {
                setRange((prev) => ({ ...prev, ...patch }));
                form.setFieldsValue(patch as unknown as BoxFormValues);
              }}
            />
          </Form.Item>

          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="slots" label="格数" rules={[{ required: true, message: '请输入格数' }]}>
              <InputNumber min={1} max={30} style={{ width: 140 }} placeholder="格数" />
            </Form.Item>
            <Form.Item name="slotLength" label="每格长度(m)" rules={[{ required: true, message: '请输入每格长度' }]}>
              <InputNumber min={0.5} step={0.5} style={{ width: 160 }} placeholder="每格长度" />
            </Form.Item>
            <Form.Item name="boxedAt" label="装箱日期" rules={[{ required: true, message: '请选择装箱日期' }]}>
              <DatePicker style={{ width: 170 }} />
            </Form.Item>
            <Form.Item name="operator" label="装箱人" rules={[{ required: true, message: '请输入装箱人' }]}>
              <Input style={{ width: 140 }} maxLength={16} placeholder="装箱人" />
            </Form.Item>
          </Space>

          <Form.Item
            name="damagedText"
            label="破损格序号（逗号分隔，留空表示无破损）"
            help={editing && activeLoanOf(editing.id) ? '在借期间发现破损，请在「归还」验收时登记' : undefined}
          >
            <Input placeholder="如：4,7" maxLength={40} disabled={Boolean(editing && activeLoanOf(editing.id))} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={60} placeholder="岩芯缺失情况等" />
          </Form.Item>
        </Form>
      </Modal>

      <BorrowModal open={Boolean(borrowBox)} box={borrowBox} onClose={() => setBorrowBox(null)} />
      <ReturnModal open={Boolean(returningLoan)} loan={returningLoan} onClose={() => setReturningLoan(null)} />
      <LoanHistoryDrawer open={Boolean(historyBoxId)} boxId={historyBoxId} onClose={() => setHistoryBoxId(null)} />
    </div>
  );
}
