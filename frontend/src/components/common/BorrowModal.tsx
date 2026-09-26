import { useEffect } from 'react';
import { App as AntApp, DatePicker, Descriptions, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useBoxStore } from '../../stores/boxStore';
import { useHoleStore } from '../../stores/holeStore';
import { useLoanStore } from '../../stores/loanStore';
import { isActive } from '../../utils/loan';
import { LOAN_PURPOSES } from '../../types/loan';
import type { CoreBox } from '../../types/core-box';

interface BorrowFormValues {
  boxId?: string;
  borrower: string;
  purpose: string;
  dueDate: Dayjs;
  registrar: string;
  remark?: string;
}

export interface BorrowModalProps {
  open: boolean;
  /** 指定岩芯箱（从箱台账「借出」进入）；不指定时在弹窗内选择在库箱 */
  box?: CoreBox | null;
  onClose: () => void;
  onLent?: (boxId: string) => void;
}

/** 借出登记弹窗：领用人、用途、应还日期；在借箱不可选/不可重复借出 */
export default function BorrowModal({ open, box, onClose, onLent }: BorrowModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<BorrowFormValues>();
  const boxes = useBoxStore((s) => s.boxes);
  const holes = useHoleStore((s) => s.holes);
  const lend = useLoanStore((s) => s.lend);
  const loans = useLoanStore((s) => s.loans);

  const holeNoOf = (holeId: string) => holes.find((h) => h.id === holeId)?.holeNo ?? '未知孔';
  const borrowedBoxIds = new Set(loans.filter(isActive).map((loan) => loan.boxId));
  const availableBoxes = boxes.filter((item) => !borrowedBoxIds.has(item.id));
  const boxOptions = availableBoxes.map((item) => ({
    label: `${item.boxNo}（${holeNoOf(item.holeId)} · ${item.shelfPos} · ${item.fromDepth}~${item.toDepth}m）`,
    value: item.id,
  }));

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      boxId: box?.id,
      borrower: '',
      purpose: undefined,
      dueDate: dayjs().add(7, 'day'),
      registrar: '库管员',
      remark: '',
    });
  }, [open, box, form]);

  const watchedBoxId = Form.useWatch('boxId', form);
  const presetBox = box ?? boxes.find((b) => b.id === watchedBoxId);

  const submit = async () => {
    const values = await form.validateFields();
    const boxId = box?.id ?? values.boxId;
    if (!boxId) {
      message.error('请选择要借出的岩芯箱');
      return;
    }
    if (borrowedBoxIds.has(boxId)) {
      message.error('该箱仍在借，请先办理归还');
      return;
    }
    try {
      const loan = await lend({
        boxId,
        borrower: values.borrower,
        purpose: values.purpose as (typeof LOAN_PURPOSES)[number],
        dueDate: values.dueDate.format('YYYY-MM-DD'),
        registrar: values.registrar,
        remark: values.remark,
      });
      message.success(`已登记借出：${loan.boxNo} → ${loan.borrower}，应还 ${loan.dueDate}`);
      onLent?.(boxId);
      onClose();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  return (
    <Modal open={open} title={box ? `借出登记 · ${box.boxNo}` : '借出登记'} onCancel={onClose} onOk={submit} okText="确认借出" cancelText="取消" destroyOnClose>
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        {box ? (
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="岩芯箱">
              {box.boxNo}（{holeNoOf(box.holeId)} · {box.fromDepth}~{box.toDepth}m）
            </Descriptions.Item>
            <Descriptions.Item label="原库架位">{box.shelfPos}（借出后架位锁定，归还时恢复入库）</Descriptions.Item>
          </Descriptions>
        ) : (
          <Form.Item name="boxId" label="选择在库岩芯箱" rules={[{ required: true, message: '请选择岩芯箱' }]}>
            <Select
              showSearch
              placeholder="在借箱不在列表中"
              options={boxOptions}
              optionFilterProp="label"
              notFoundContent="暂无可借出的在库箱（全部在借）"
            />
          </Form.Item>
        )}
        {!box && presetBox ? (
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="原库架位">{presetBox.shelfPos}</Descriptions.Item>
          </Descriptions>
        ) : null}
        <Form.Item name="borrower" label="领用人" rules={[{ required: true, message: '请填写领用人' }]}>
          <Input maxLength={16} placeholder="实际领走岩芯箱的人" />
        </Form.Item>
        <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '请选择用途' }]}>
          <Select options={LOAN_PURPOSES.map((v) => ({ label: v, value: v }))} placeholder="选择借阅用途" />
        </Form.Item>
        <Form.Item name="dueDate" label="应还日期" rules={[{ required: true, message: '请选择应还日期' }]}>
          <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs().startOf('day'))} />
        </Form.Item>
        <Form.Item name="registrar" label="借出登记人" rules={[{ required: true, message: '请填写登记人' }]}>
          <Input maxLength={16} placeholder="库房经办人" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={80} placeholder="随箱资料、交接说明等" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
