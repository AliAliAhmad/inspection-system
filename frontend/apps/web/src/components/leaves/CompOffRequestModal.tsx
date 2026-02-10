import { useState, useMemo } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  InputNumber,
  Input,
  Space,
  Typography,
  Alert,
  Divider,
  Tag,
  message,
} from 'antd';
import {
  SwapOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { leavesApi, RequestCompOffPayload } from '@inspection/shared';

const { Text, Title } = Typography;

interface CompOffRequestModalProps {
  open: boolean;
  onClose: () => void;
  userId?: number;
  onSuccess?: () => void;
}

// Constants for comp-off calculation
const STANDARD_WORK_HOURS = 8;
const COMP_OFF_RATE = 1; // 1 day per 8 hours

export function CompOffRequestModal({
  open,
  onClose,
  userId,
  onSuccess,
}: CompOffRequestModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [hoursWorked, setHoursWorked] = useState<number>(0);

  // Calculate comp-off days earned based on hours worked
  const compDaysEarned = useMemo(() => {
    if (hoursWorked <= 0) return 0;
    // Round to 1 decimal place
    return Math.round((hoursWorked / STANDARD_WORK_HOURS) * COMP_OFF_RATE * 10) / 10;
  }, [hoursWorked]);

  const requestMutation = useMutation({
    mutationFn: (payload: RequestCompOffPayload) => leavesApi.requestCompOff(payload),
    onSuccess: () => {
      message.success(t('leaves.compOffRequested', 'Compensatory leave request submitted'));
      queryClient.invalidateQueries({ queryKey: ['comp-off'] });
      queryClient.invalidateQueries({ queryKey: ['leaves', 'balance'] });
      form.resetFields();
      setHoursWorked(0);
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload: RequestCompOffPayload = {
        user_id: userId,
        work_date: values.work_date.format('YYYY-MM-DD'),
        hours_worked: values.hours_worked,
        reason: values.reason,
      };

      requestMutation.mutate(payload);
    } catch {
      // Validation failed
    }
  };

  const handleClose = () => {
    form.resetFields();
    setHoursWorked(0);
    onClose();
  };

  // Disable dates in the future
  const disabledDate = (current: Dayjs) => {
    return current && current.isAfter(dayjs().endOf('day'));
  };

  return (
    <Modal
      title={
        <Space>
          <SwapOutlined style={{ color: '#13c2c2' }} />
          {t('leaves.requestCompOff', 'Request Compensatory Leave')}
        </Space>
      }
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={requestMutation.isPending}
      okText={t('common.submit', 'Submit')}
      width={500}
    >
      <Alert
        message={t('leaves.compOffInfo', 'Compensatory Leave')}
        description={t(
          'leaves.compOffDescription',
          'Request compensatory time off for extra hours worked on weekends, holidays, or beyond regular working hours.'
        )}
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 24 }}
      />

      <Form form={form} layout="vertical">
        <Form.Item
          name="work_date"
          label={
            <Space>
              <CalendarOutlined />
              {t('leaves.workDate', 'Date Worked')}
            </Space>
          }
          rules={[{ required: true, message: t('leaves.selectWorkDate', 'Please select the work date') }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={disabledDate}
            placeholder={t('leaves.selectDate', 'Select the date you worked')}
          />
        </Form.Item>

        <Form.Item
          name="hours_worked"
          label={
            <Space>
              <ClockCircleOutlined />
              {t('leaves.hoursWorked', 'Hours Worked')}
            </Space>
          }
          rules={[
            { required: true, message: t('leaves.enterHours', 'Please enter hours worked') },
            {
              validator: (_, value) => {
                if (value && value < 1) {
                  return Promise.reject(t('leaves.minHours', 'Minimum 1 hour required'));
                }
                if (value && value > 24) {
                  return Promise.reject(t('leaves.maxHours', 'Maximum 24 hours allowed'));
                }
                return Promise.resolve();
              },
            },
          ]}
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('leaves.hoursHelp', 'Enter the extra hours worked beyond regular schedule')}
            </Text>
          }
        >
          <InputNumber
            min={1}
            max={24}
            step={0.5}
            style={{ width: '100%' }}
            placeholder="e.g., 8"
            addonAfter={t('leaves.hours', 'hours')}
            onChange={(value) => setHoursWorked(value || 0)}
          />
        </Form.Item>

        {/* Calculated Comp-Off Days */}
        {hoursWorked > 0 && (
          <div
            style={{
              padding: 16,
              backgroundColor: '#e6fffb',
              borderRadius: 8,
              marginBottom: 16,
              border: '1px solid #87e8de',
            }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text strong style={{ color: '#13c2c2' }}>
                {t('leaves.compDaysEarned', 'Compensatory Days Earned')}
              </Text>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Title level={2} style={{ margin: 0, color: '#13c2c2' }}>
                  {compDaysEarned}
                </Title>
                <Text type="secondary">{t('leaves.days', 'days')}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t(
                  'leaves.compOffCalculation',
                  '{{hours}} hours / {{standard}} hours per day = {{days}} days',
                  {
                    hours: hoursWorked,
                    standard: STANDARD_WORK_HOURS,
                    days: compDaysEarned,
                  }
                )}
              </Text>
            </Space>
          </div>
        )}

        <Form.Item
          name="reason"
          label={t('leaves.reason', 'Reason')}
          rules={[{ required: true, message: t('leaves.enterReason', 'Please enter a reason') }]}
        >
          <Input.TextArea
            rows={3}
            placeholder={t(
              'leaves.compOffReasonPlaceholder',
              'e.g., Worked on Saturday to complete urgent project deadline'
            )}
          />
        </Form.Item>
      </Form>

      <Divider style={{ margin: '16px 0' }} />

      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
        <Text type="secondary">
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          {t('leaves.compOffNote', 'Notes:')}
        </Text>
        <ul style={{ marginTop: 4, paddingLeft: 20 }}>
          <li>
            {t(
              'leaves.compOffNote1',
              'Compensatory leave requests require manager approval'
            )}
          </li>
          <li>
            {t(
              'leaves.compOffNote2',
              'Comp-off days typically expire within 3 months of accrual'
            )}
          </li>
          <li>
            {t(
              'leaves.compOffNote3',
              'You can use earned comp-off when applying for leave'
            )}
          </li>
        </ul>
      </div>
    </Modal>
  );
}

export default CompOffRequestModal;
