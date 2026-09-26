import { useEffect, useMemo } from 'react';
import { Alert, App as AntApp, Descriptions, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import { useBoxStore } from '../../stores/boxStore';
import { useHoleStore } from '../../stores/holeStore';
import { useLoanStore } from '../../stores/loanStore';
import { isOverdue, overdueDays } from '../../utils/loan';
import { parseSlots } from '../../utils/slots';
import type { CoreLoan } from '../../types/loan';

interface ReturnFormValues {
  damagedText?: string;
  receiver: string;
  returnRemark?: string;
}

export interface ReturnModalProps {
  open: boolean;
  /** 要归还的在借记录 */
  loan: CoreLoan | null;
  onClose: () => void;
  onReturned?: (loanId: string) => void;
}

/** 归还登记弹窗：验收破损格、验收人，归还后箱恢复入库，破损格并入箱台账 */
export default function ReturnModal({ open, loan, onClose, onReturned }: ReturnModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<ReturnFormValues>();
  const boxes = useBoxStore((s) => s.boxes);
  const holes = useHoleStore((s) => s.holes);
  const giveBack = useLoanStore((s) => s.giveBack);

  const box = loan ? boxes.find((b) => b.id === loan.boxId) : undefined;
  const holeNo = loan ? holes.find((h) => h.id === loan.holeId)?.holeNo ?? '未知孔' : '';

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ damagedText: '', receiver: '库管员', returnRemark: '' });
    }
  }, [open, loan, form]);

  const overdue = loan ? isOverdue(loan) : false;
  const days = loan ? overdueDays(loan) : 0;

  const existingDamaged = box?.damagedSlots ?? [];
  const damagedText = Form.useWatch('damagedText', form);
  const newSlots = useMemo(() => parseSlots(damagedText), [damagedText]);
  const invalidSlots = box ? newSlots.filter((slot) => slot > box.slots) : [];

  const submit = async () => {
    if (!loan) return;
    const values = await form.validateFields();
    const slots = parseSlots(values.damagedText);
    if (box && slots.some((slot) => slot > box.slots)) {
      message.error(`该箱只有 ${box.slots} 格，破损格序号不能超出`);
      return;
    }
    try {
      await giveBack(loan.id, { damagedSlots: slots, receiver: values.receiver, returnRemark: values.returnRemark });
      message.success(`箱 ${loan.boxNo} 已归还入库${slots.length ? `，登记破损格 ${slots.join('、')}` : ''}`);
      onReturned?.(loan.id);
      onClose();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  return (
    <Modal open={open} title={loan ? `归还登记 · ${loan.boxNo}` : '归还登记'} onCancel={onClose} onOk={submit} okText="确认归还入库" cancelText="取消" destroyOnClose>
      {loan ? (
        <>
          <Descriptions size="small" column={1} bordered style={{ marginTop: 8, marginBottom: 12 }}>
            <Descriptions.Item label="岩芯箱">
              {loan.boxNo}（{holeNo} · 归还至 {loan.shelfPos}）
            </Descriptions.Item>
            <Descriptions.Item label="领用人 / 用途">
              {loan.borrower} · {loan.purpose}
            </Descriptions.Item>
            <Descriptions.Item label="借出 / 应还">
              {dayjs(loan.borrowedAt).format('YYYY-MM-DD')} / {loan.dueDate}
            </Descriptions.Item>
          </Descriptions>
          {overdue ? (
            <Alert style={{ marginBottom: 12 }} type="error" showIcon message={`已逾期 ${days} 天归还，请提醒领用人并记录`} />
          ) : (
            <Alert style={{ marginBottom: 12 }} type="info" showIcon message="按期归还，验收后箱将恢复到原库架位" />
          )}
          <Form form={form} layout="vertical">
            <Form.Item
              name="damagedText"
              label={`归还验收破损格（逗号分隔，共 ${box?.slots ?? '-'} 格；台账已有破损格：${existingDamaged.length ? existingDamaged.join('、') : '无'}）`}
              validateStatus={invalidSlots.length ? 'error' : undefined}
              help={invalidSlots.length ? `序号 ${invalidSlots.join('、')} 超出格数` : '新登记的破损格会与台账已有破损格合并保留'}
            >
              <Input placeholder="如：3,9，无破损留空" maxLength={40} />
            </Form.Item>
            <Form.Item name="receiver" label="归还验收人" rules={[{ required: true, message: '请填写验收人' }]}>
              <Input maxLength={16} placeholder="库房经办人" />
            </Form.Item>
            <Form.Item name="returnRemark" label="归还备注">
              <Input.TextArea rows={2} maxLength={80} placeholder="破损情况、缺失说明等" />
            </Form.Item>
          </Form>
        </>
      ) : null}
    </Modal>
  );
}
