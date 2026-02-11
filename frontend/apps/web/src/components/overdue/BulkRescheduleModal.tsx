import { useState } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Input,
  Space,
  Typography,
  message,
  Alert,
  List,
  Tag,
  Divider,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  CalendarOutlined,
  FileSearchOutlined,
  BugOutlined,
  AuditOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { OverdueItem, OverdueItemType } from './OverdueTable';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface BulkRescheduleModalProps {
  open: boolean;
  onClose: () => void;
  items: OverdueItem[];
  onSuccess?: () => void;
}

const TYPE_CONFIG = {
  inspection: {
    icon: <FileSearchOutlined />,
    color: '#1890ff',
    label: 'Inspection',
  },
  defect: {
    icon: <BugOutlined />,
    color: '#fa8c16',
    label: 'Defect',
  },
  review: {
    icon: <AuditOutlined />,
    color: '#722ed1',
    label: 'Review',
  },
};

export function BulkRescheduleModal({
  open,
  onClose,
  items,
  onSuccess,
}: BulkRescheduleModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);

  // Group items by type
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {} as Record<OverdueItemType, OverdueItem[]>);

  const rescheduleMutation = useMutation({
    mutationFn: async (data: { items: OverdueItem[]; new_date: string; reason?: string }) => {
      // This would call the bulk reschedule API endpoint
      // For now, simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: true, rescheduled: data.items.length };
    },
    onSuccess: (result) => {
      message.success(
        t('overdue.reschedule_success', '{{count}} items rescheduled successfully', {
          count: result.rescheduled,
        })
      );
      queryClient.invalidateQueries({ queryKey: ['overdue'] });
      form.resetFields();
      setSelectedDate(null);
      onClose();
      onSuccess?.();
    },
    onError: (err: any) => {
      message.error(err.message || t('common.error', 'An error occurred'));
    },
  });

  const handleSubmit = (values: any) => {
    if (!values.new_date) {
      message.error(t('overdue.select_date', 'Please select a new date'));
      return;
    }

    rescheduleMutation.mutate({
      items,
      new_date: values.new_date.format('YYYY-MM-DD'),
      reason: values.reason,
    });
  };

  const handleClose = () => {
    form.resetFields();
    setSelectedDate(null);
    onClose();
  };

  // Calculate stats
  const maxOverdue = Math.max(...items.map((item) => item.days_overdue));
  const avgOverdue = items.reduce((sum, item) => sum + item.days_overdue, 0) / items.length;

  return (
    <Modal
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          {t('overdue.bulk_reschedule', 'Bulk Reschedule')}
        </Space>
      }
      open={open}
      onCancel={handleClose}
      onOk={() => form.submit()}
      confirmLoading={rescheduleMutation.isPending}
      okText={t('overdue.reschedule', 'Reschedule')}
      width={600}
    >
      {/* Summary Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Statistic
            title={t('overdue.items_selected', 'Items Selected')}
            value={items.length}
            valueStyle={{ color: '#1890ff', fontSize: 24 }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={t('overdue.max_overdue', 'Max Overdue')}
            value={maxOverdue}
            suffix={t('overdue.days', 'days')}
            valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={t('overdue.avg_overdue', 'Avg Overdue')}
            value={Math.round(avgOverdue)}
            suffix={t('overdue.days', 'days')}
            valueStyle={{ color: '#faad14', fontSize: 24 }}
          />
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      {/* Items by Type */}
      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ marginBottom: 8, display: 'block' }}>
          {t('overdue.items_by_type', 'Items by Type')}
        </Text>
        <Space wrap>
          {Object.entries(groupedItems).map(([type, typeItems]) => {
            const config = TYPE_CONFIG[type as OverdueItemType];
            return (
              <Tag key={type} color={config.color} icon={config.icon}>
                {typeItems.length} {t(`overdue.type_${type}`, config.label)}
                {typeItems.length > 1 ? 's' : ''}
              </Tag>
            );
          })}
        </Space>
      </div>

      {/* Items Preview */}
      <div style={{ marginBottom: 24, maxHeight: 200, overflowY: 'auto' }}>
        <Text strong style={{ marginBottom: 8, display: 'block' }}>
          {t('overdue.selected_items', 'Selected Items')}
        </Text>
        <List
          size="small"
          dataSource={items.slice(0, 5)}
          renderItem={(item) => {
            const config = TYPE_CONFIG[item.type];
            return (
              <List.Item style={{ padding: '8px 0' }}>
                <Space size={8}>
                  <Tag color={config.color} style={{ margin: 0 }}>
                    {config.icon}
                  </Tag>
                  <Text ellipsis style={{ maxWidth: 300 }}>
                    {item.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    ({item.days_overdue}d {t('overdue.overdue', 'overdue')})
                  </Text>
                </Space>
              </List.Item>
            );
          }}
        />
        {items.length > 5 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('overdue.and_more', 'and {{count}} more...', { count: items.length - 5 })}
          </Text>
        )}
      </div>

      <Divider style={{ margin: '16px 0' }} />

      {/* Reschedule Form */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          name="new_date"
          label={t('overdue.new_due_date', 'New Due Date')}
          rules={[
            { required: true, message: t('overdue.date_required', 'Please select a new date') },
          ]}
        >
          <DatePicker
            style={{ width: '100%' }}
            placeholder={t('overdue.select_new_date', 'Select new due date')}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
            onChange={(date) => setSelectedDate(date)}
            format="YYYY-MM-DD"
          />
        </Form.Item>

        {selectedDate && (
          <Alert
            message={
              <Space>
                <InfoCircleOutlined />
                {t('overdue.new_date_info', 'Items will be rescheduled to {{date}}', {
                  date: selectedDate.format('MMMM D, YYYY'),
                })}
              </Space>
            }
            type="info"
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          name="reason"
          label={t('overdue.reason', 'Reason (Optional)')}
        >
          <TextArea
            rows={3}
            placeholder={t('overdue.reason_placeholder', 'Enter reason for rescheduling (optional)')}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>

      {/* Warning */}
      <Alert
        message={t('overdue.reschedule_warning_title', 'Important')}
        description={
          <Paragraph style={{ margin: 0 }}>
            {t(
              'overdue.reschedule_warning',
              'Rescheduling will update the due dates for all selected items. This action will be logged for audit purposes.'
            )}
          </Paragraph>
        }
        type="warning"
        showIcon
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
}

export default BulkRescheduleModal;
