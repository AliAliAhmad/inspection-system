import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Select,
  Tag,
  Popconfirm,
  message,
  Typography,
  Spin,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  schedulesApi,
  equipmentApi,
  type Schedule,
  type CreateSchedulePayload,
} from '@inspection/shared';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];

export default function SchedulesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['schedules', 'weekly'],
    queryFn: () => schedulesApi.getWeekly(),
  });

  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['equipment', 'all'],
    queryFn: () => equipmentApi.list({ per_page: 500 }),
    enabled: addModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateSchedulePayload) => schedulesApi.create(payload),
    onSuccess: () => {
      message.success(t('schedules.createSuccess', 'Schedule created successfully'));
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setAddModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error(t('schedules.createError', 'Failed to create schedule')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => schedulesApi.remove(id),
    onSuccess: () => {
      message.success(t('schedules.deleteSuccess', 'Schedule deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: () => message.error(t('schedules.deleteError', 'Failed to delete schedule')),
  });

  const columns: ColumnsType<Schedule> = [
    {
      title: t('schedules.equipment', 'Equipment'),
      dataIndex: 'equipment_name',
      key: 'equipment_name',
      sorter: (a, b) => a.equipment_name.localeCompare(b.equipment_name),
    },
    {
      title: t('schedules.dayOfWeek', 'Day of Week'),
      dataIndex: 'day_of_week',
      key: 'day_of_week',
      render: (day: number) => DAYS_OF_WEEK[day] || day,
      sorter: (a, b) => a.day_of_week - b.day_of_week,
    },
    {
      title: t('schedules.frequency', 'Frequency'),
      dataIndex: 'frequency',
      key: 'frequency',
      render: (f: string) => <Tag color="blue">{f.toUpperCase()}</Tag>,
    },
    {
      title: t('schedules.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>
          {v ? t('common.yes', 'Yes') : t('common.no', 'No')}
        </Tag>
      ),
    },
    {
      title: t('schedules.nextDue', 'Next Due'),
      dataIndex: 'next_due',
      key: 'next_due',
      render: (v: string | null) => v || '-',
    },
    {
      title: t('schedules.lastCompleted', 'Last Completed'),
      dataIndex: 'last_completed',
      key: 'last_completed',
      render: (v: string | null) => v || '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: Schedule) => (
        <Popconfirm
          title={t('schedules.deleteConfirm', 'Delete this schedule?')}
          onConfirm={() => deleteMutation.mutate(record.id)}
          okText={t('common.yes', 'Yes')}
          cancelText={t('common.no', 'No')}
        >
          <Button type="link" danger icon={<DeleteOutlined />}>
            {t('common.delete', 'Delete')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const schedules = data?.data?.data || [];
  const equipmentOptions = equipmentData?.data?.data || [];

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.schedules', 'Schedules')}</Typography.Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
          {t('schedules.add', 'Add Schedule')}
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={schedules}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 900 }}
      />

      <Modal
        title={t('schedules.add', 'Add Schedule')}
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Spin spinning={equipmentLoading}>
          <Form
            form={form}
            layout="vertical"
            onFinish={(v: CreateSchedulePayload) => createMutation.mutate(v)}
          >
            <Form.Item name="equipment_id" label={t('schedules.equipment', 'Equipment')} rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="children"
                placeholder={t('schedules.selectEquipment', 'Select equipment')}
              >
                {equipmentOptions.map((eq) => (
                  <Select.Option key={eq.id} value={eq.id}>
                    {eq.name} ({eq.serial_number})
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="day_of_week" label={t('schedules.dayOfWeek', 'Day of Week')} rules={[{ required: true }]}>
              <Select>
                {DAYS_OF_WEEK.map((day, index) => (
                  <Select.Option key={index} value={index}>
                    {day}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="frequency" label={t('schedules.frequency', 'Frequency')} rules={[{ required: true }]}>
              <Select>
                {FREQUENCIES.map((f) => (
                  <Select.Option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </Card>
  );
}
