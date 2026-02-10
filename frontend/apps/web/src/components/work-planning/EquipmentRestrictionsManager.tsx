import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Switch,
  Space,
  Tag,
  Popconfirm,
  message,
  Tooltip,
  TimePicker,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ToolOutlined,
  StopOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi, equipmentApi } from '@inspection/shared';
import dayjs from 'dayjs';

interface EquipmentRestriction {
  id: number;
  equipment_id?: number;
  equipment_serial?: string;
  equipment_type?: string;
  restriction_type: string;
  name: string;
  name_ar?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  max_concurrent_jobs: number;
  min_gap_hours: number;
  blocked_days?: number[];
  is_active: boolean;
}

const restrictionTypeColors: Record<string, string> = {
  blackout: 'red',
  maintenance_window: 'orange',
  limited_access: 'blue',
  concurrent_limit: 'purple',
  gap_required: 'cyan',
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const EquipmentRestrictionsManager: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRestriction, setEditingRestriction] = useState<EquipmentRestriction | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [form] = Form.useForm();

  const { data: restrictions, isLoading } = useQuery({
    queryKey: ['equipment-restrictions', filterType],
    queryFn: () => workPlansApi.listEquipmentRestrictions({ restriction_type: filterType || undefined }),
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: () => equipmentApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: workPlansApi.createEquipmentRestriction,
    onSuccess: () => {
      message.success(t('common.created'));
      queryClient.invalidateQueries({ queryKey: ['equipment-restrictions'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      workPlansApi.updateEquipmentRestriction(id, data),
    onSuccess: () => {
      message.success(t('common.updated'));
      queryClient.invalidateQueries({ queryKey: ['equipment-restrictions'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: workPlansApi.deleteEquipmentRestriction,
    onSuccess: () => {
      message.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['equipment-restrictions'] });
    },
  });

  const handleOpenModal = (restriction?: EquipmentRestriction) => {
    if (restriction) {
      setEditingRestriction(restriction);
      form.setFieldsValue({
        ...restriction,
        start_date: restriction.start_date ? dayjs(restriction.start_date) : null,
        end_date: restriction.end_date ? dayjs(restriction.end_date) : null,
        start_time: restriction.start_time ? dayjs(restriction.start_time, 'HH:mm') : null,
        end_time: restriction.end_time ? dayjs(restriction.end_time, 'HH:mm') : null,
      });
    } else {
      setEditingRestriction(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingRestriction(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      start_date: values.start_date?.format('YYYY-MM-DD'),
      end_date: values.end_date?.format('YYYY-MM-DD'),
      start_time: values.start_time?.format('HH:mm'),
      end_time: values.end_time?.format('HH:mm'),
    };

    if (editingRestriction) {
      updateMutation.mutate({ id: editingRestriction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: EquipmentRestriction) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.name_ar && (
            <div style={{ fontSize: 12, color: '#666' }}>{record.name_ar}</div>
          )}
        </div>
      ),
    },
    {
      title: t('workPlan.restrictionType'),
      dataIndex: 'restriction_type',
      key: 'restriction_type',
      render: (type: string) => (
        <Tag color={restrictionTypeColors[type] || 'default'}>
          {t(`restrictionType.${type}`)}
        </Tag>
      ),
    },
    {
      title: t('equipment.equipment'),
      key: 'equipment',
      render: (_: any, record: EquipmentRestriction) => (
        <Space>
          <ToolOutlined />
          {record.equipment_serial || record.equipment_type || t('workPlan.allEquipment')}
        </Space>
      ),
    },
    {
      title: t('workPlan.dateRange'),
      key: 'dates',
      render: (_: any, record: EquipmentRestriction) => {
        if (!record.start_date && !record.end_date) {
          return <Tag>{t('workPlan.permanent')}</Tag>;
        }
        return (
          <span>
            {record.start_date ? dayjs(record.start_date).format('MMM D') : '...'} -{' '}
            {record.end_date ? dayjs(record.end_date).format('MMM D, YYYY') : '...'}
          </span>
        );
      },
    },
    {
      title: t('workPlan.timeWindow'),
      key: 'time',
      render: (_: any, record: EquipmentRestriction) => {
        if (!record.start_time && !record.end_time) {
          return <Tag>{t('workPlan.allDay')}</Tag>;
        }
        return (
          <Space>
            <ClockCircleOutlined />
            {record.start_time || '00:00'} - {record.end_time || '23:59'}
          </Space>
        );
      },
    },
    {
      title: t('workPlan.blockedDays'),
      dataIndex: 'blocked_days',
      key: 'blocked_days',
      render: (days: number[]) =>
        days && days.length > 0 ? (
          <Space size={4}>
            {days.map((d) => (
              <Tag key={d}>{dayNames[d]}</Tag>
            ))}
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: t('workPlan.limits'),
      key: 'limits',
      render: (_: any, record: EquipmentRestriction) => (
        <Space direction="vertical" size={0}>
          {record.max_concurrent_jobs > 0 && (
            <span style={{ fontSize: 12 }}>
              {t('workPlan.maxConcurrent')}: {record.max_concurrent_jobs}
            </span>
          )}
          {record.min_gap_hours > 0 && (
            <span style={{ fontSize: 12 }}>
              {t('workPlan.minGap')}: {record.min_gap_hours}h
            </span>
          )}
        </Space>
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
      render: (_: any, record: EquipmentRestriction) => (
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

  const restrictionList = restrictions?.data?.restrictions || [];
  const equipmentList = (equipment?.data as any)?.data || [];

  return (
    <Card
      title={
        <Space>
          <StopOutlined />
          {t('workPlan.equipmentRestrictions')}
        </Space>
      }
      extra={
        <Space>
          <Select
            placeholder={t('workPlan.filterByType')}
            allowClear
            style={{ width: 180 }}
            onChange={(v) => setFilterType(v || null)}
          >
            <Select.Option value="blackout">{t('restrictionType.blackout')}</Select.Option>
            <Select.Option value="maintenance_window">{t('restrictionType.maintenance_window')}</Select.Option>
            <Select.Option value="limited_access">{t('restrictionType.limited_access')}</Select.Option>
            <Select.Option value="concurrent_limit">{t('restrictionType.concurrent_limit')}</Select.Option>
            <Select.Option value="gap_required">{t('restrictionType.gap_required')}</Select.Option>
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('workPlan.addRestriction')}
          </Button>
        </Space>
      }
    >
      <Table
        dataSource={restrictionList as any[]}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingRestriction ? t('workPlan.editRestriction') : t('workPlan.addRestriction')}
        open={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        width={700}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="restriction_type"
              label={t('workPlan.restrictionType')}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="blackout">{t('restrictionType.blackout')}</Select.Option>
                <Select.Option value="maintenance_window">{t('restrictionType.maintenance_window')}</Select.Option>
                <Select.Option value="limited_access">{t('restrictionType.limited_access')}</Select.Option>
                <Select.Option value="concurrent_limit">{t('restrictionType.concurrent_limit')}</Select.Option>
                <Select.Option value="gap_required">{t('restrictionType.gap_required')}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="equipment_id" label={t('equipment.equipment')}>
              <Select allowClear showSearch optionFilterProp="children" placeholder={t('workPlan.allEquipment')}>
                {equipmentList.map((eq: any) => (
                  <Select.Option key={eq.id} value={eq.id}>
                    {eq.serial_number} - {eq.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="equipment_type" label={t('equipment.type')}>
            <Input placeholder={t('workPlan.applyToEquipmentType')} />
          </Form.Item>

          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="start_date" label={t('workPlan.startDate')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="end_date" label={t('workPlan.endDate')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="start_time" label={t('workPlan.startTime')}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="end_time" label={t('workPlan.endTime')}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="blocked_days" label={t('workPlan.blockedDays')}>
            <Select mode="multiple" placeholder={t('workPlan.selectDays')}>
              {dayNames.map((day, index) => (
                <Select.Option key={index} value={index}>
                  {t(`days.${day.toLowerCase()}`)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="max_concurrent_jobs"
              label={t('workPlan.maxConcurrentJobs')}
              initialValue={1}
            >
              <InputNumber min={0} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="min_gap_hours"
              label={t('workPlan.minGapHours')}
              initialValue={0}
            >
              <InputNumber min={0} max={48} style={{ width: '100%' }} />
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

export default EquipmentRestrictionsManager;
