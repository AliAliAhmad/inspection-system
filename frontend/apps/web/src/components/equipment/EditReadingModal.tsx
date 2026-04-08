import React, { useEffect, useState } from 'react';
import { Modal, InputNumber, Input, Form, Image, Tag, Typography, Space, Alert, Button } from 'antd';
import { EditOutlined, WarningOutlined, HistoryOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { equipmentApi, type ReadingDataPoint } from '@inspection/shared';
import { message } from 'antd';

const { Text, Title } = Typography;

type ReadingSource = 'equipment_reading' | 'inspection_answer' | 'running_hours';

interface EditReadingModalProps {
  open: boolean;
  equipmentId: number;
  reading: (ReadingDataPoint & { group_label: string; source: string }) | null;
  /** The previous reading on this same equipment+type — used to compute the realistic max */
  previousReading: ReadingDataPoint | null;
  onClose: () => void;
}

const MAX_HOURS_PER_DAY = 20;
const TOLERANCE = 20;

/** Compute the realistic max for an RNR reading given a previous one. */
function computeRealisticMax(previousValue: number, previousDate: string, currentDate: string): number {
  const ms = new Date(currentDate).getTime() - new Date(previousDate).getTime();
  const days = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
  return previousValue + days * MAX_HOURS_PER_DAY + TOLERANCE;
}

export const EditReadingModal: React.FC<EditReadingModalProps> = ({
  open,
  equipmentId,
  reading,
  previousReading,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ reading_value: number; edit_reason: string }>();
  const [newValue, setNewValue] = useState<number | null>(null);

  // Re-sync form when modal opens with a different reading
  useEffect(() => {
    if (open && reading) {
      form.setFieldsValue({
        reading_value: reading.value,
        edit_reason: '',
      });
      setNewValue(reading.value);
    }
  }, [open, reading, form]);

  const editMutation = useMutation({
    mutationFn: async (vars: { reading_value: number; edit_reason: string }) => {
      if (!reading) throw new Error('No reading selected');
      // Pass the source so the backend routes to the right table.
      // The source comes from the FlatReading row (equipment_reading,
      // inspection_answer, or running_hours).
      const source = (reading.source || 'equipment_reading') as ReadingSource;
      const resp = await equipmentApi.editEquipmentReading(
        equipmentId,
        reading.id,
        { ...vars, source },
      );
      return resp.data;
    },
    onSuccess: () => {
      message.success('Reading corrected successfully');
      queryClient.invalidateQueries({ queryKey: ['equipment-readings-history', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to update reading';
      message.error(msg);
    },
  });

  if (!reading) return null;

  // Compute max realistic for the warning banner
  const maxRealistic = previousReading
    ? computeRealisticMax(previousReading.value, previousReading.date, reading.date)
    : null;

  const exceedsMax = newValue !== null && maxRealistic !== null && newValue > maxRealistic;
  const belowPrevious = newValue !== null && previousReading !== null && newValue < previousReading.value;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      editMutation.mutate(values);
    } catch {
      // Validation error already shown by Form
    }
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <EditOutlined style={{ color: '#1890ff' }} />
          <span>Correct Reading</span>
          <Tag color="orange">Admin only</Tag>
        </Space>
      }
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={editMutation.isPending}
      okText="Save Correction"
      cancelText="Cancel"
      width={620}
      destroyOnClose
    >
      <div style={{ padding: '4px 0' }}>
        {/* Reading metadata */}
        <div
          style={{
            background: '#fafafa',
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Text strong style={{ fontSize: 14 }}>{reading.group_label}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Recorded {reading.date} by {reading.recorded_by || 'unknown'}
              </Text>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                Current value
              </Text>
              <Text strong style={{ fontSize: 22, color: '#262626' }}>
                {reading.value}
              </Text>
            </div>
          </div>
        </div>

        {/* Photo preview (if any) */}
        {reading.photo_url ? (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
              Original meter photo
            </Text>
            <Image
              src={reading.photo_url}
              style={{
                maxHeight: 200,
                borderRadius: 6,
                border: '1px solid #f0f0f0',
              }}
              preview
            />
          </div>
        ) : (
          <Alert
            type="info"
            showIcon
            message="No photo available for this reading"
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Previous reading + max realistic info */}
        {previousReading && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              padding: 10,
              background: '#f0f5ff',
              border: '1px solid #d6e4ff',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            <HistoryOutlined style={{ color: '#1890ff', fontSize: 16 }} />
            <div style={{ flex: 1 }}>
              <div>
                Previous reading: <Text strong>{previousReading.value}</Text>{' '}
                <Text type="secondary">on {previousReading.date}</Text>
              </div>
              {maxRealistic !== null && (
                <div>
                  Max realistic value: <Text strong>{maxRealistic.toFixed(0)}</Text>{' '}
                  <Text type="secondary">(at {MAX_HOURS_PER_DAY}h/day max)</Text>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Out-of-range warnings */}
        {belowPrevious && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            message="Cannot decrease"
            description={`The new value cannot be lower than the previous reading (${previousReading?.value}).`}
            style={{ marginBottom: 12 }}
          />
        )}
        {exceedsMax && !belowPrevious && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="Exceeds realistic maximum"
            description={`The new value ${newValue} is higher than the realistic maximum of ${maxRealistic?.toFixed(0)}. Save will be blocked unless you double-check the meter.`}
            style={{ marginBottom: 12 }}
          />
        )}

        {/* Form */}
        <Form form={form} layout="vertical">
          <Form.Item
            label="Corrected reading value"
            name="reading_value"
            rules={[
              { required: true, message: 'Please enter the corrected value' },
              { type: 'number', min: 0, message: 'Value must be positive' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              size="large"
              placeholder="e.g. 900"
              onChange={(v) => setNewValue(typeof v === 'number' ? v : null)}
            />
          </Form.Item>

          <Form.Item
            label="Reason for correction"
            name="edit_reason"
            rules={[
              { required: true, message: 'Please explain why you are correcting this' },
              { min: 5, message: 'Reason should be at least 5 characters' },
              { max: 255, message: 'Reason is too long (max 255 chars)' },
            ]}
          >
            <Input.TextArea
              rows={2}
              placeholder="e.g. Inspector typed 9000 by mistake — meter clearly shows 900"
              maxLength={255}
              showCount
            />
          </Form.Item>
        </Form>

        {/* Edit history (if previously edited) */}
        {reading.is_edited && reading.original_value != null && (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: 4,
              fontSize: 11,
              color: '#8c4a00',
            }}
          >
            ⚠ This reading has been edited {reading.edit_count}× before.
            Original value: <strong>{reading.original_value}</strong>
            {reading.updated_by_name && <>. Last edited by {reading.updated_by_name}.</>}
          </div>
        )}
      </div>
    </Modal>
  );
};
