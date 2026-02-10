import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Space,
  Tag,
  Popconfirm,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leavesApi } from '@inspection/shared';
import dayjs from 'dayjs';

interface Holiday {
  id: number;
  date: string;
  name: string;
  name_ar?: string;
  holiday_type: 'public' | 'religious' | 'company';
  is_working_day: boolean;
  year: number;
}

const holidayTypeColors: Record<string, string> = {
  public: 'blue',
  religious: 'purple',
  company: 'green',
};

export default function HolidaysManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [yearFilter, setYearFilter] = useState(dayjs().year());
  const [form] = Form.useForm();

  const { data: holidays, isLoading } = useQuery({
    queryKey: ['holidays', yearFilter],
    queryFn: () => leavesApi.listHolidays({ year: yearFilter }),
  });

  const createMutation = useMutation({
    mutationFn: leavesApi.createHoliday,
    onSuccess: () => {
      message.success(t('common.created'));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      leavesApi.updateHoliday(id, data),
    onSuccess: () => {
      message.success(t('common.updated'));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: leavesApi.deleteHoliday,
    onSuccess: () => {
      message.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
  });

  const handleOpenModal = (holiday?: Holiday) => {
    if (holiday) {
      setEditingHoliday(holiday);
      form.setFieldsValue({
        ...holiday,
        date: dayjs(holiday.date),
      });
    } else {
      setEditingHoliday(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingHoliday(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      date: values.date.format('YYYY-MM-DD'),
    };

    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    {
      title: t('common.date'),
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('ddd, MMM D, YYYY'),
      sorter: (a: Holiday, b: Holiday) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    },
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Holiday) => (
        <div>
          <div>{name}</div>
          {record.name_ar && (
            <div style={{ fontSize: 12, color: '#666' }} dir="rtl">
              {record.name_ar}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('leaves.holidayType', 'Type'),
      dataIndex: 'holiday_type',
      key: 'holiday_type',
      render: (type: string) => (
        <Tag color={holidayTypeColors[type]}>{t(`holidays.${type}`, type)}</Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: Holiday) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleOpenModal(record)}
          />
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

  const holidayList: Holiday[] = (holidays?.data?.data || holidays?.data || []) as Holiday[];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Select
          value={yearFilter}
          onChange={setYearFilter}
          style={{ width: 120 }}
          options={[
            { value: dayjs().year() - 1, label: dayjs().year() - 1 },
            { value: dayjs().year(), label: dayjs().year() },
            { value: dayjs().year() + 1, label: dayjs().year() + 1 },
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          {t('leaves.addHoliday', 'Add Holiday')}
        </Button>
      </div>

      <Table
        dataSource={holidayList}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={editingHoliday ? t('leaves.editHoliday', 'Edit Holiday') : t('leaves.addHoliday', 'Add Holiday')}
        open={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="date"
            label={t('common.date')}
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

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

          <Form.Item
            name="holiday_type"
            label={t('leaves.holidayType', 'Type')}
            rules={[{ required: true }]}
            initialValue="public"
          >
            <Select>
              <Select.Option value="public">{t('holidays.public', 'Public Holiday')}</Select.Option>
              <Select.Option value="religious">{t('holidays.religious', 'Religious Holiday')}</Select.Option>
              <Select.Option value="company">{t('holidays.company', 'Company Holiday')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
