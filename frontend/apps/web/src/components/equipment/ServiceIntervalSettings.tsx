import React, { useState } from 'react';
import {
  Card,
  Form,
  InputNumber,
  DatePicker,
  Button,
  Space,
  Typography,
  Divider,
  Modal,
  Alert,
  Spin,
  Statistic,
  Row,
  Col,
  message,
  Popconfirm,
} from 'antd';
import {
  SettingOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  HistoryOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runningHoursApi } from '@inspection/shared';
import type { ServiceInterval, UpdateServiceIntervalPayload, ResetServicePayload } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface ServiceIntervalSettingsProps {
  equipmentId: number;
  equipmentName?: string;
  onClose?: () => void;
  isModal?: boolean;
}

export const ServiceIntervalSettings: React.FC<ServiceIntervalSettingsProps> = ({
  equipmentId,
  equipmentName,
  onClose,
  isModal = false,
}) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [showResetModal, setShowResetModal] = useState(false);

  const { data: serviceInterval, isLoading, error } = useQuery({
    queryKey: ['equipment-service-interval', equipmentId],
    queryFn: async () => {
      const response = await runningHoursApi.getServiceInterval(equipmentId);
      return response.data?.data as ServiceInterval;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: runningHours } = useQuery({
    queryKey: ['equipment-running-hours', equipmentId],
    queryFn: async () => {
      const response = await runningHoursApi.getRunningHours(equipmentId);
      return response.data?.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateServiceIntervalPayload) =>
      runningHoursApi.updateServiceInterval(equipmentId, payload),
    onSuccess: () => {
      message.success('Service interval updated successfully');
      queryClient.invalidateQueries({ queryKey: ['equipment-service-interval', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['equipment-running-hours', equipmentId] });
    },
    onError: () => {
      message.error('Failed to update service interval');
    },
  });

  const resetMutation = useMutation({
    mutationFn: (payload: ResetServicePayload) =>
      runningHoursApi.resetService(equipmentId, payload),
    onSuccess: () => {
      message.success('Service hours reset successfully');
      setShowResetModal(false);
      resetForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['equipment-service-interval', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['equipment-running-hours', equipmentId] });
    },
    onError: () => {
      message.error('Failed to reset service hours');
    },
  });

  const handleSubmit = (values: any) => {
    const payload: UpdateServiceIntervalPayload = {
      service_interval_hours: values.service_interval_hours,
      alert_threshold_hours: values.alert_threshold_hours,
      last_service_date: values.last_service_date?.format('YYYY-MM-DD'),
      last_service_hours: values.last_service_hours,
    };
    updateMutation.mutate(payload);
  };

  const handleReset = (values: any) => {
    const payload: ResetServicePayload = {
      service_date: values.service_date.format('YYYY-MM-DD'),
      hours_at_service: values.hours_at_service,
      notes: values.notes,
    };
    resetMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <Card title={<span><SettingOutlined style={{ marginRight: 8 }} />Service Interval Settings</span>}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  const content = (
    <>
      {error && (
        <Alert
          type="error"
          message="Failed to load service interval settings"
          style={{ marginBottom: 16 }}
        />
      )}

      {runningHours && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            background: '#f5f5f5',
            borderRadius: 8,
          }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Current Hours"
                value={runningHours.current_hours}
                suffix="hrs"
                prefix={<ClockCircleOutlined />}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Last Service"
                value={serviceInterval?.last_service_hours ?? 'N/A'}
                suffix={serviceInterval?.last_service_hours !== undefined ? 'hrs' : ''}
                prefix={<ToolOutlined />}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Next Service"
                value={serviceInterval?.next_service_hours ?? 'N/A'}
                suffix={serviceInterval?.next_service_hours !== undefined ? 'hrs' : ''}
                prefix={<HistoryOutlined />}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
          </Row>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          service_interval_hours: serviceInterval?.service_interval_hours ?? 500,
          alert_threshold_hours: serviceInterval?.alert_threshold_hours ?? 50,
          last_service_hours: serviceInterval?.last_service_hours ?? 0,
          last_service_date: serviceInterval?.last_service_date
            ? dayjs(serviceInterval.last_service_date)
            : undefined,
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="service_interval_hours"
              label={
                <Space>
                  <ToolOutlined />
                  <span>Service Interval</span>
                </Space>
              }
              rules={[
                { required: true, message: 'Please enter service interval' },
                { type: 'number', min: 1, message: 'Must be greater than 0' },
              ]}
              tooltip="Service every X hours"
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="e.g., 500"
                addonAfter="hours"
                min={1}
                max={100000}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="alert_threshold_hours"
              label={
                <Space>
                  <BellOutlined />
                  <span>Alert Threshold</span>
                </Space>
              }
              rules={[
                { required: true, message: 'Please enter alert threshold' },
                { type: 'number', min: 1, message: 'Must be greater than 0' },
              ]}
              tooltip="Alert X hours before service is due"
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="e.g., 50"
                addonAfter="hours before"
                min={1}
                max={10000}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider>Last Service Record</Divider>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="last_service_hours"
              label="Hours at Last Service"
              rules={[{ type: 'number', min: 0, message: 'Must be 0 or greater' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="e.g., 1000"
                addonAfter="hours"
                min={0}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="last_service_date"
              label="Last Service Date"
            >
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                placeholder="Select date"
                disabledDate={(current) => current && current > dayjs().endOf('day')}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={updateMutation.isPending}
            >
              Save Settings
            </Button>

            <Button
              danger
              icon={<ReloadOutlined />}
              onClick={() => setShowResetModal(true)}
            >
              Reset After Service
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {/* Reset Service Modal */}
      <Modal
        title={
          <Space>
            <ReloadOutlined style={{ color: '#faad14' }} />
            <span>Reset Service Hours</span>
          </Space>
        }
        open={showResetModal}
        onCancel={() => setShowResetModal(false)}
        footer={null}
        destroyOnClose
      >
        <Alert
          type="warning"
          message="This will reset the service counter after completing maintenance."
          style={{ marginBottom: 16 }}
          showIcon
        />

        <Form
          form={resetForm}
          layout="vertical"
          onFinish={handleReset}
          initialValues={{
            service_date: dayjs(),
            hours_at_service: runningHours?.current_hours ?? 0,
          }}
        >
          <Form.Item
            name="service_date"
            label="Service Date"
            rules={[{ required: true, message: 'Please select service date' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>

          <Form.Item
            name="hours_at_service"
            label="Hours at Service"
            rules={[
              { required: true, message: 'Please enter hours' },
              { type: 'number', min: 0, message: 'Must be 0 or greater' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              addonAfter="hours"
              min={0}
            />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Service Notes"
          >
            <InputNumber style={{ display: 'none' }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setShowResetModal(false)}>
                Cancel
              </Button>
              <Popconfirm
                title="Are you sure you want to reset the service hours?"
                onConfirm={() => resetForm.submit()}
                okText="Yes, Reset"
                cancelText="Cancel"
              >
                <Button
                  type="primary"
                  danger
                  icon={<ReloadOutlined />}
                  loading={resetMutation.isPending}
                >
                  Reset Hours
                </Button>
              </Popconfirm>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );

  if (isModal) {
    return content;
  }

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          <span>Service Interval Settings</span>
          {equipmentName && <Text type="secondary">- {equipmentName}</Text>}
        </Space>
      }
      extra={onClose && <Button onClick={onClose}>Close</Button>}
    >
      {content}
    </Card>
  );
};

export default ServiceIntervalSettings;
