import { useMemo, useState } from 'react';
import { Alert, App as AntApp, AutoComplete, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Col, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import BoxGrid from '../components/common/BoxGrid';
import DepthRangeInput from '../components/common/DepthRangeInput';
import EmptyPanel from '../components/common/EmptyPanel';
import { useHoleStore } from '../stores/holeStore';
import { useRunStore } from '../stores/runStore';
import { useBoxStore } from '../stores/boxStore';
import { useLoanStore } from '../stores/loanStore';
import { SHELF_POSITIONS, type CoreBox, type BoxContinuity } from '../types/core-box';
import { LOAN_PURPOSES, activeLoanOf, isLoanOverdue, overdueDaysOf, type BoxLoan } from '../types/box-loan';
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

interface LoanFormValues {
  borrower: string;
  purpose: string;
  loanedAt: Dayjs;
  dueAt: Dayjs;
}

interface ReturnFormValues {
  returnedAt: Dayjs;
  damagedText?: string;
  remark?: string;
}

function parseSlots(text: string | undefined): number[] {
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .split(/[,，\s]+/)
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0),
    ),
  ).sort((a, b) => a - b);
}

/** 借阅状态标签：在库 / 在借 / 逾期 */
function LoanStatusTag({ loan }: { loan: BoxLoan }) {
  if (loan.returnedAt) return <Tag color="green">已归还</Tag>;
  if (isLoanOverdue(loan)) return <Tag color="red">逾期 {overdueDaysOf(loan)} 天</Tag>;
  return <Tag color="orange">在借</Tag>;
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
  const loanOut = useLoanStore((s) => s.loanOut);
  const returnLoan = useLoanStore((s) => s.returnLoan);
  const removeLoansOfBox = useLoanStore((s) => s.removeLoansOfBox);

  const [form] = Form.useForm<BoxFormValues>();
  const [loanForm] = Form.useForm<LoanFormValues>();
  const [returnForm] = Form.useForm<ReturnFormValues>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CoreBox | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState('');
  /** 借出弹窗目标箱 */
  const [loanBox, setLoanBox] = useState<CoreBox | null>(null);
  /** 归还弹窗目标（箱 + 在借记录） */
  const [returnTarget, setReturnTarget] = useState<{ box: CoreBox; loan: BoxLoan } | null>(null);
  /** 借阅记录弹窗目标箱 */
  const [historyBox, setHistoryBox] = useState<CoreBox | null>(null);
  /** 深度区间以本地 state 为唯一数据源（Form.useWatch 在弹窗挂载前可能读不到值） */
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 0, to: 0 });

  const holeOptions = holes.map((hole) => ({ label: `${hole.holeNo} · ${hole.rigNo}`, value: hole.id }));
  const activeHoleId = currentHoleId || holes[0]?.id || '';
  const holeBoxes = useMemo(() => boxes.filter((b) => b.holeId === activeHoleId), [boxes, activeHoleId]);
  const selectedBox = useMemo(
    () => holeBoxes.find((b) => b.id === selectedBoxId) ?? holeBoxes[0],
    [holeBoxes, selectedBoxId],
  );

  const continuityOf = (box: CoreBox): BoxContinuity => checkBoxContinuity(box, runs);

  const loanOfBox = (boxId: string) => activeLoanOf(loans, boxId);
  const selectedLoan = selectedBox ? loanOfBox(selectedBox.id) : undefined;
  /** 选中箱的借还历史（新的在前），重新借出只追加记录不冲掉历史 */
  const historyLoans = useMemo(
    () =>
      historyBox
        ? loans.filter((loan) => loan.boxId === historyBox.id).sort((a, b) => b.loanedAt.localeCompare(a.loanedAt))
        : [],
    [loans, historyBox],
  );

  const openLoan = (box: CoreBox) => {
    setLoanBox(box);
    loanForm.resetFields();
    loanForm.setFieldsValue({ borrower: '', purpose: '', loanedAt: dayjs(), dueAt: dayjs().add(14, 'day') } as unknown as LoanFormValues);
  };

  const submitLoan = async () => {
    if (!loanBox) return;
    const values = await loanForm.validateFields();
    const result = await loanOut({
      boxId: loanBox.id,
      borrower: values.borrower,
      purpose: values.purpose,
      loanedAt: values.loanedAt.toISOString(),
      dueAt: values.dueAt.toISOString(),
    });
    if (result.error) {
      message.error(result.error);
      return;
    }
    message.success(`箱 ${loanBox.boxNo} 已借出给 ${values.borrower}，应还 ${values.dueAt.format('YYYY-MM-DD')}`);
    setLoanBox(null);
  };

  const openReturn = (box: CoreBox, loan: BoxLoan) => {
    setReturnTarget({ box, loan });
    returnForm.resetFields();
    returnForm.setFieldsValue({ returnedAt: dayjs(), damagedText: '', remark: '' } as unknown as ReturnFormValues);
  };

  const submitReturn = async () => {
    if (!returnTarget) return;
    const values = await returnForm.validateFields();
    const damagedSlots = parseSlots(values.damagedText).filter((slot) => slot <= returnTarget.box.slots);
    await returnLoan(returnTarget.loan.id, {
      returnedAt: values.returnedAt.toISOString(),
      damagedSlots,
      remark: values.remark,
    });
    message.success(`箱 ${returnTarget.box.boxNo} 已归还入库${damagedSlots.length ? `，登记破损格 ${damagedSlots.join(',')}` : ''}`);
    setReturnTarget(null);
  };

  const handleRemoveBox = async (box: CoreBox) => {
    await removeBox(box.id);
    await removeLoansOfBox(box.id);
    message.success('已删除岩芯箱及其借阅记录');
  };

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
      await updateBox(editing.id, payload);
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
    { title: '库架位', dataIndex: 'shelfPos', width: 110 },
    { title: '装箱日期', dataIndex: 'boxedAt', width: 110, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '装箱人', dataIndex: 'operator', width: 90 },
    {
      title: '破损格',
      width: 100,
      render: (_, row) => (row.damagedSlots.length ? <Tag color="red">{row.damagedSlots.join(',')}</Tag> : <Tag color="green">无</Tag>),
    },
    {
      title: '借阅状态',
      width: 170,
      render: (_, row) => {
        const loan = loanOfBox(row.id);
        if (!loan) return <Tag color="green">在库</Tag>;
        return (
          <Space size={4} wrap>
            <Tag color="orange">在借 · {loan.borrower}</Tag>
            {isLoanOverdue(loan) ? <Tag color="red">逾期 {overdueDaysOf(loan)} 天</Tag> : null}
          </Space>
        );
      },
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
        const loan = loanOfBox(record.id);
        return (
          <Space size={2}>
            <Button size="small" type="link" onClick={() => setSelectedBoxId(record.id)}>
              查看格位
            </Button>
            {loan ? (
              <Button size="small" type="link" onClick={() => openReturn(record, loan)}>
                归还
              </Button>
            ) : (
              <Button size="small" type="link" onClick={() => openLoan(record)}>
                借出
              </Button>
            )}
            <Button size="small" type="link" onClick={() => setHistoryBox(record)}>
              借阅记录
            </Button>
            {loan ? (
              <Tooltip title="在借中，归还后才能调整箱位">
                <Button size="small" type="link" disabled>
                  编辑
                </Button>
              </Tooltip>
            ) : (
              <Button size="small" type="link" onClick={() => openEdit(record)}>
                编辑
              </Button>
            )}
            {loan ? (
              <Tooltip title="在借中，归还后才能移除">
                <Button size="small" type="link" danger disabled>
                  删除
                </Button>
              </Tooltip>
            ) : (
              <Popconfirm title={`确认删除岩芯箱 ${record.boxNo}？`} description="将一并删除该箱的借阅记录" onConfirm={() => handleRemoveBox(record)}>
                <Button size="small" type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  const historyColumns: TableColumnsType<BoxLoan> = [
    { title: '领用人', dataIndex: 'borrower', width: 90 },
    { title: '用途', dataIndex: 'purpose', width: 110 },
    { title: '借出日期', dataIndex: 'loanedAt', width: 105, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '应还日期', dataIndex: 'dueAt', width: 105, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '归还日期',
      dataIndex: 'returnedAt',
      width: 105,
      render: (v: string | undefined) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
    },
    {
      title: '归还破损格',
      width: 110,
      render: (_, row) =>
        row.returnedAt ? (row.returnDamagedSlots?.length ? <Tag color="red">{row.returnDamagedSlots.join(',')}</Tag> : <Tag color="green">无</Tag>) : '—',
    },
    { title: '归还备注', dataIndex: 'returnRemark', width: 140, render: (v: string | undefined) => v ?? '—' },
    { title: '状态', width: 100, render: (_, row) => <LoanStatusTag loan={row} /> },
  ];

  const formHoleId = Form.useWatch('holeId', form) ?? activeHoleId;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        岩芯箱编目与格位分配
      </Title>
      <Paragraph type="secondary">按深度区间分配格位，装箱时校验区间与回次是否连续；断档在格位网格中以虚线标出，破损格可点击切换标记。</Paragraph>

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
                  <BoxGrid
                    box={selectedBox}
                    runs={runs}
                    onToggleDamaged={selectedLoan ? undefined : (slot) => toggleDamagedSlot(selectedBox.id, slot)}
                  />
                  {selectedLoan ? (
                    <Alert
                      style={{ marginTop: 10 }}
                      type="info"
                      showIcon
                      message={`箱 ${selectedBox.boxNo} 在借中：领用人 ${selectedLoan.borrower}，应还 ${dayjs(selectedLoan.dueAt).format('YYYY-MM-DD')}。归还前不能调整箱位、标记破损格或移除。`}
                    />
                  ) : null}
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
              <Table rowKey="id" size="small" columns={columns} dataSource={holeBoxes} pagination={{ pageSize: 6 }} scroll={{ x: 1650 }} />
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
            <Form.Item name="shelfPos" label="库架位" rules={[{ required: true, message: '请选择库架位' }]}>
              <Select style={{ width: 150 }} options={SHELF_POSITIONS.map((v) => ({ label: v, value: v }))} />
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

          <Form.Item name="damagedText" label="破损格序号（逗号分隔，留空表示无破损）">
            <Input placeholder="如：4,7" maxLength={40} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={60} placeholder="岩芯缺失情况等" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(loanBox)}
        title={loanBox ? `借出岩芯箱 · ${loanBox.boxNo}（${loanBox.fromDepth}~${loanBox.toDepth}m）` : '借出岩芯箱'}
        onCancel={() => setLoanBox(null)}
        onOk={submitLoan}
        okText="确认借出"
        cancelText="取消"
        width={560}
      >
        <Form form={loanForm} layout="vertical">
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="borrower" label="领用人" rules={[{ required: true, message: '请输入领用人' }]}>
              <Input style={{ width: 180 }} maxLength={16} placeholder="领用人姓名" />
            </Form.Item>
            <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '请填写用途' }]}>
              <AutoComplete
                style={{ width: 220 }}
                options={LOAN_PURPOSES.map((v) => ({ label: v, value: v }))}
                placeholder="如：取样化验"
                maxLength={30}
              />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="loanedAt" label="借出日期" rules={[{ required: true, message: '请选择借出日期' }]}>
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              name="dueAt"
              label="应还日期"
              rules={[
                { required: true, message: '请选择应还日期' },
                {
                  validator: (_, value: Dayjs | undefined) => {
                    const loanedAt = loanForm.getFieldValue('loanedAt') as Dayjs | undefined;
                    if (!value || !loanedAt || !value.startOf('day').isBefore(loanedAt.startOf('day'))) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('应还日期不能早于借出日期'));
                  },
                },
              ]}
            >
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Alert type="info" showIcon message="借出后该箱锁定：不能重复借出、调整箱位或移除，归还登记后恢复入库。" />
        </Form>
      </Modal>

      <Modal
        open={Boolean(returnTarget)}
        title={returnTarget ? `归还岩芯箱 · ${returnTarget.box.boxNo}` : '归还岩芯箱'}
        onCancel={() => setReturnTarget(null)}
        onOk={submitReturn}
        okText="确认归还"
        cancelText="取消"
        width={560}
      >
        {returnTarget ? (
          <Form form={returnForm} layout="vertical">
            <Alert
              style={{ marginBottom: 12 }}
              type={isLoanOverdue(returnTarget.loan) ? 'warning' : 'info'}
              showIcon
              message={`领用人 ${returnTarget.loan.borrower} · ${returnTarget.loan.purpose} · 借出 ${dayjs(returnTarget.loan.loanedAt).format('YYYY-MM-DD')} · 应还 ${dayjs(returnTarget.loan.dueAt).format('YYYY-MM-DD')}${
                isLoanOverdue(returnTarget.loan) ? `（已逾期 ${overdueDaysOf(returnTarget.loan)} 天）` : ''
              }`}
            />
            <Form.Item name="returnedAt" label="归还日期" rules={[{ required: true, message: '请选择归还日期' }]}>
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="damagedText" label={`归还时发现的破损格序号（逗号分隔，共 ${returnTarget.box.slots} 格，留空表示无新增破损）`}>
              <Input placeholder="如：4,7" maxLength={40} />
            </Form.Item>
            <Form.Item name="remark" label="归还备注">
              <Input.TextArea rows={2} maxLength={60} placeholder="岩芯缺失、箱体损坏情况等" />
            </Form.Item>
            <Alert type="info" showIcon message="归还后破损格将并入箱台账，该箱恢复在库，可再次借出；本次借还记录保留在借阅记录中。" />
          </Form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(historyBox)}
        title={historyBox ? `借阅记录 · ${historyBox.boxNo}（共 ${historyLoans.length} 条）` : '借阅记录'}
        onCancel={() => setHistoryBox(null)}
        footer={null}
        width={920}
      >
        <Table
          rowKey="id"
          size="small"
          columns={historyColumns}
          dataSource={historyLoans}
          pagination={{ pageSize: 6, hideOnSinglePage: true }}
          scroll={{ x: 880 }}
          locale={{ emptyText: '该箱暂无借还记录' }}
        />
      </Modal>
    </div>
  );
}
