import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Space,
  Tag,
  Popconfirm,
  message,
  TimePicker,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';
import dayjs from 'dayjs';

interface CapacityConfig {
  id: number;
  name: string;
  name_ar?: string;
  role?: string;
  department?: string;
  day_of_week?: number;
  max_hours_per_day: number;
  max_jobs_per_day: number;
  overtime_allowed: boolean;
  max_overtime_hours: number;
  break_start?: string;
  break_end?: string;
  shift_start: string;
  shift_end: string;
  is_active: boolean;
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const CapacityConfigManager: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CapacityConfig | null>(null);
  const [form] = Form.useForm();

  const { data: configs, isLoading } = useQuery({
    queryKey: ['capacity-configs'],
    queryFn: () => workPlansApi.listCapacityConfigs(),
  });

  const createMutation = useMutation({
    mutationFn: workPlansApi.createCapacityConfig,
    onSuccess: () => {
      message.success(t('common.created'));
      queryClient.invalidateQueries({ queryKey: ['capacity-configs'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      workPlansApi.updateCapacityConfig(id, data),
    onSuccess: () => {
      message.success(t('common.updated'));
      queryClient.invalidateQueries({ queryKey: ['capacity-configs'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: workPlansApi.deleteCapacityConfig,
    onSuccess: () => {
      message.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['capacity-configs'] });
    },
  });

  const handleOpenModal = (config?: CapacityConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        ...config,
        shift_start: config.shift_start ? dayjs(config.shift_start, 'HH:mm') : null,
        shift_end: config.shift_end ? dayjs(config.shift_end, 'HH:mm') : null,
        break_start: config.break_start ? dayjs(config.break_start, 'HH:mm') : null,
        break_end: config.break_end ? dayjs(config.break_end, 'HH:mm') : null,
      });
    } else {
      setEditingConfig(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingConfig(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      shift_start: values.shift_start?.format('HH:mm'),
      shift_end: values.shift_end?.format('HH:mm'),
      break_start: values.break_start?.format('HH:mm'),
      break_end: values.break_end?.format('HH:mm'),
    };

    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: CapacityConfig) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.name_ar && (
            <div style={{ fontSize: 12, color: '#666' }}>{record.name_ar}</div>
          )}
        </div>
      ),
    },
    {
      title: t('workPlan.role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => role && <Tag color="blue">{role}</Tag>,
    },
    {
      title: t('workPlan.dayOfWeek'),
      dataIndex: 'day_of_week',
      key: 'day_of_week',
      render: (day: number) =>
        day !== undefined && day !== null ? (
          <Tag>{t(`days.${dayNames[day].toLowerCase()}`)}</Tag>
        ) : (
          <Tag color="green">{t('workPlan.allDays')}</Tag>
        ),
    },
    {
      title: t('workPlan.shift'),
      key: 'shift',
      render: (_: any, record: CapacityConfig) => (
        <Space>
          <ClockCircleOutlined />
          {record.shift_start} - {record.shift_end}
        </Space>
      ),
    },
    {
      title: t('workPlan.maxHours'),
      dataIndex: 'max_hours_per_day',
      key: 'max_hours_per_day',
      render: (hours: number) => `${hours}h`,
    },
    {
      title: t('workPlan.maxJobs'),
      dataIndex: 'max_jobs_per_day',
      key: 'max_jobs_per_day',
    },
    {
      title: t('workPlan.overtime'),
      key: 'overtime',
      render: (_: any, record: CapacityConfig) =>
        record.overtime_allowed ? (
          <Tag color="green">+{record.max_overtime_hours}h</Tag>
        ) : (
          <Tag>{t('common.no')}</Tag>
        ),
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>
          {active ? t('common.active') : t('common.inactive')}
        </Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: CapacityConfig) => (
        <Space>
          <Tooltip title={t('common.edit')}>
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleOpenModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('common.confirmDelete')}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const configList = configs?.data?.data || configs?.data || [];

  return (
    <Card
      title={t('workPlan.capacityRules')}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          {t('workPlan.addRule')}
        </Button>
      }
    >
      <Table
        dataSource={configList}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingConfig ? t('workPlan.editRule') : t('workPlan.addRule')}
        open={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        width={600}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="name"
              label={t('common.name')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="name_ar" label={t('common.nameAr')}>
              <Input dir="rtl" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="role" label={t('workPlan.role')}>
              <Select allowClear>
                <Select.Option value="engineer">{t('roles.engineer')}</Select.Option>
                <Select.Option value="technician">{t('roles.technician')}</Select.Option>
                <Select.Option value="supervisor">{t('roles.supervisor')}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="department" label={t('workPlan.department')}>
              <Input />
            </Form.Item>
            <Form.Item name="day_of_week" label={t('workPlan.dayOfWeek')}>
              <Select allowClear placeholder={t('workPlan.allDays')}>
                {dayNames.map((day, index) => (
                  <Select.Option key={index} value={index}>
                    {t(`days.${day.toLowerCase()}`)}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="shift_start"
              label={t('workPlan.shiftStart')}
              rules={[{ required: true }]}
            >
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="shift_end"
              label={t('workPlan.shiftEnd')}
              rules={[{ required: true }]}
            >
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="break_start" label={t('workPlan.breakStart')}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="break_end" label={t('workPlan.breakEnd')}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="max_hours_per_day"
              label={t('workPlan.maxHoursPerDay')}
              rules={[{ required: true }]}
              initialValue={8}
            >
              <InputNumber min={1} max={24} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="max_jobs_per_day"
              label={t('workPlan.maxJobsPerDay')}
              rules={[{ required: true }]}
              initialValue={5}
            >
              <InputNumber min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="overtime_allowed"
              label={t('workPlan.overtimeAllowed')}
              valuePropName="checked"
              initialValue={false}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="max_overtime_hours"
              label={t('workPlan.maxOvertimeHours')}
              initialValue={2}
            >
              <InputNumber min={0} max={8} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            name="is_active"
            label={t('common.active')}
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CapacityConfigManager;
