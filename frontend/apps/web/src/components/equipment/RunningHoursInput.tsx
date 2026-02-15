import React, { useState } from 'react';
import {
  Form,
  InputNumber,
  Input,
  Button,
  Space,
  Typography,
  Alert,
  Divider,
  Radio,
  Statistic,
  Row,
  Col,
  Card,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  SaveOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { runningHoursApi } from '@inspection/shared';
import type { CreateRunningHoursReadingPayload } from '@inspection/shared';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface RunningHoursInputProps {
  equipmentId: number;
  equipmentName?: string;
  currentHours?: number;
  lastReadingDate?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

export const RunningHoursInput: React.FC<RunningHoursInputProps> = ({
  equipmentId,
  equipmentName,
  currentHours = 0,
  lastReadingDate,
  onSuccess,
  onCancel,
  compact = false,
}) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [newHours, setNewHours] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CreateRunningHoursReadingPayload) =>
      runningHoursApi.updateRunningHours(equipmentId, payload),
    onSuccess: () => {
      message.success('Running hours updated successfully');
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['equipment-running-hours', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['running-hours-list'] });
      queryClient.invalidateQueries({ queryKey: ['running-hours-summary'] });
      onSuccess?.();
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || 'Failed to update running hours';
      message.error(errorMessage);
    },
  });

  const handleSubmit = (values: any) => {
    const payload: CreateRunningHoursReadingPayload = {
      hours: values.hours,
      notes: values.notes,
      source: values.source || 'manual',
    };
    mutation.mutate(payload);
  };

  const validateHours = (_: any, value: number) => {
    if (value === undefined || value === null) {
      return Promise.reject(new Error('Please enter the meter reading'));
    }
    if (value < currentHours) {
      return Promise.reject(
        new Error(`Hours cannot be less than last reading (${currentHours.toLocaleString()} hrs)`)
      );
    }
    return Promise.resolve();
  };

  const hoursDifference = newHours !== null && newHours >= currentHours ? newHours - currentHours : null;

  if (compact) {
    return (
      <Form
        form={form}
        layout="inline"
        onFinish={handleSubmit}
        initialValues={{ source: 'manual' }}
      >
        <Form.Item
          name="hours"
          rules={[{ validator: validateHours }]}
          style={{ marginBottom: 0 }}
        >
          <InputNumber
            placeholder={`Current: ${currentHours.toLocaleString()}`}
            addonAfter="hrs"
            min={currentHours}
            style={{ width: 180 }}
            onChange={(val) => setNewHours(val as number)}
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={mutation.isPending}
            size="small"
          >
            Save
          </Button>
        </Form.Item>
      </Form>
    );
  }

  return (
    <div>
      {equipmentName && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 16 }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            {equipmentName}
          </Text>
        </div>
      )}

      {/* Current Status */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          background: '#f5f5f5',
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Last Reading</span>
                </Space>
              }
              value={currentHours}
              suffix="hrs"
              valueStyle={{ fontSize: 24 }}
            />
          </Col>
          <Col span={12}>
            {hoursDifference !== null && (
              <Statistic
                title={
                  <Space>
                    <PlusOutlined />
                    <span>Hours Since Last</span>
                  </Space>
                }
                value={hoursDifference}
                suffix="hrs"
                valueStyle={{ fontSize: 24, color: '#52c41a' }}
              />
            )}
          </Col>
        </Row>
        {lastReadingDate && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <HistoryOutlined style={{ marginRight: 4 }} />
              Last recorded: {new Date(lastReadingDate).toLocaleString()}
            </Text>
          </div>
        )}
      </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ source: 'manual' }}
      >
        <Form.Item
          name="hours"
          label={
            <Space>
              <ClockCircleOutlined />
              <span>Current Meter Reading</span>
            </Space>
          }
          rules={[{ validator: validateHours }]}
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              Enter the current hours shown on the equipment meter
            </Text>
          }
        >
          <InputNumber
            placeholder={`Enter hours (min: ${currentHours.toLocaleString()})`}
            addonAfter="hours"
            min={currentHours}
            style={{ width: '100%' }}
            size="large"
            onChange={(val) => setNewHours(val as number)}
          />
        </Form.Item>

        {newHours !== null && newHours < currentHours && (
          <Alert
            type="error"
            message="Invalid Reading"
            description={`The new reading (${newHours.toLocaleString()} hrs) cannot be less than the previous reading (${currentHours.toLocaleString()} hrs). Please verify the meter.`}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {hoursDifference !== null && hoursDifference > 100 && (
          <Alert
            type="warning"
            message="Large Increase Detected"
            description={`You are recording an increase of ${hoursDifference.toLocaleString()} hours. Please verify this is correct.`}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          name="source"
          label="Reading Source"
        >
          <Radio.Group>
            <Radio.Button value="manual">Manual Entry</Radio.Button>
            <Radio.Button value="meter">Meter Reading</Radio.Button>
            <Radio.Button value="estimated">Estimated</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="notes"
          label="Notes (Optional)"
        >
          <TextArea
            placeholder="Any observations or notes about this reading..."
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Divider />

        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            {onCancel && (
              <Button onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={mutation.isPending}
              disabled={newHours === null || newHours < currentHours}
            >
              Save Reading
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
};

export default RunningHoursInput;
