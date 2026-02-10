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
  Switch,
  Space,
  Tag,
  Popconfirm,
  message,
  Tooltip,
  Progress,
  Avatar,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi, usersApi } from '@inspection/shared';
import dayjs from 'dayjs';

interface WorkerSkill {
  id: number;
  user_id: number;
  user_name?: string;
  skill_type: string;
  skill_name: string;
  skill_name_ar?: string;
  certification_number?: string;
  issued_date?: string;
  expiry_date?: string;
  proficiency_level: number;
  is_verified: boolean;
  verified_by?: string;
  notes?: string;
}

const skillTypeColors: Record<string, string> = {
  certification: 'blue',
  training: 'green',
  experience: 'purple',
  license: 'orange',
};

export const WorkerSkillsManager: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<WorkerSkill | null>(null);
  const [filterUser, setFilterUser] = useState<number | null>(null);
  const [form] = Form.useForm();

  const { data: skills, isLoading } = useQuery({
    queryKey: ['worker-skills', filterUser],
    queryFn: () => workPlansApi.listWorkerSkills({ user_id: filterUser || undefined }),
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: workPlansApi.createWorkerSkill,
    onSuccess: () => {
      message.success(t('common.created'));
      queryClient.invalidateQueries({ queryKey: ['worker-skills'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      workPlansApi.updateWorkerSkill(id, data),
    onSuccess: () => {
      message.success(t('common.updated'));
      queryClient.invalidateQueries({ queryKey: ['worker-skills'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: workPlansApi.deleteWorkerSkill,
    onSuccess: () => {
      message.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['worker-skills'] });
    },
  });

  const handleOpenModal = (skill?: WorkerSkill) => {
    if (skill) {
      setEditingSkill(skill);
      form.setFieldsValue({
        ...skill,
        issued_date: skill.issued_date ? dayjs(skill.issued_date) : null,
        expiry_date: skill.expiry_date ? dayjs(skill.expiry_date) : null,
      });
    } else {
      setEditingSkill(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingSkill(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      issued_date: values.issued_date?.format('YYYY-MM-DD'),
      expiry_date: values.expiry_date?.format('YYYY-MM-DD'),
    };

    if (editingSkill) {
      updateMutation.mutate({ id: editingSkill.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const daysUntilExpiry = dayjs(expiryDate).diff(dayjs(), 'day');
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (expiryDate?: string) => {
    if (!expiryDate) return false;
    return dayjs(expiryDate).isBefore(dayjs());
  };

  const columns = [
    {
      title: t('workPlan.worker'),
      key: 'user',
      render: (_: any, record: WorkerSkill) => (
        <Space>
          <Avatar icon={<UserOutlined />} size="small" />
          <span>{record.user_name || `User #${record.user_id}`}</span>
        </Space>
      ),
    },
    {
      title: t('workPlan.skillType'),
      dataIndex: 'skill_type',
      key: 'skill_type',
      render: (type: string) => (
        <Tag color={skillTypeColors[type] || 'default'}>
          {t(`skillType.${type}`)}
        </Tag>
      ),
    },
    {
      title: t('workPlan.skillName'),
      dataIndex: 'skill_name',
      key: 'skill_name',
      render: (name: string, record: WorkerSkill) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.skill_name_ar && (
            <div style={{ fontSize: 12, color: '#666' }}>{record.skill_name_ar}</div>
          )}
        </div>
      ),
    },
    {
      title: t('workPlan.certification'),
      dataIndex: 'certification_number',
      key: 'certification_number',
      render: (num: string) =>
        num && (
          <Space>
            <SafetyCertificateOutlined />
            {num}
          </Space>
        ),
    },
    {
      title: t('workPlan.proficiency'),
      dataIndex: 'proficiency_level',
      key: 'proficiency_level',
      render: (level: number) => (
        <Progress
          percent={level * 20}
          steps={5}
          size="small"
          strokeColor={level >= 4 ? '#52c41a' : level >= 2 ? '#faad14' : '#ff4d4f'}
        />
      ),
    },
    {
      title: t('workPlan.expiry'),
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      render: (date: string) => {
        if (!date) return '-';
        const expired = isExpired(date);
        const expiring = isExpiringSoon(date);
        return (
          <Space>
            {(expired || expiring) && (
              <WarningOutlined style={{ color: expired ? '#ff4d4f' : '#faad14' }} />
            )}
            <span style={{ color: expired ? '#ff4d4f' : expiring ? '#faad14' : undefined }}>
              {dayjs(date).format('MMM D, YYYY')}
            </span>
          </Space>
        );
      },
    },
    {
      title: t('workPlan.verified'),
      dataIndex: 'is_verified',
      key: 'is_verified',
      render: (verified: boolean) => (
        <Tag color={verified ? 'green' : 'default'}>
          {verified ? t('common.yes') : t('common.no')}
        </Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: WorkerSkill) => (
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

  const skillList = skills?.data?.skills || [];
  const userList = (users?.data as any)?.data || [];

  return (
    <Card
      title={t('workPlan.workerSkills')}
      extra={
        <Space>
          <Select
            placeholder={t('workPlan.filterByWorker')}
            allowClear
            style={{ width: 200 }}
            onChange={(v) => setFilterUser(v || null)}
            showSearch
            optionFilterProp="children"
          >
            {userList.map((user: any) => (
              <Select.Option key={user.id} value={user.id}>
                {user.full_name || user.username}
              </Select.Option>
            ))}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('workPlan.addSkill')}
          </Button>
        </Space>
      }
    >
      <Table
        dataSource={skillList as any[]}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingSkill ? t('workPlan.editSkill') : t('workPlan.addSkill')}
        open={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        width={600}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="user_id"
            label={t('workPlan.worker')}
            rules={[{ required: true }]}
          >
            <Select showSearch optionFilterProp="children">
              {userList.map((user: any) => (
                <Select.Option key={user.id} value={user.id}>
                  {user.full_name || user.username}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="skill_type"
              label={t('workPlan.skillType')}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="certification">{t('skillType.certification')}</Select.Option>
                <Select.Option value="training">{t('skillType.training')}</Select.Option>
                <Select.Option value="experience">{t('skillType.experience')}</Select.Option>
                <Select.Option value="license">{t('skillType.license')}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="proficiency_level"
              label={t('workPlan.proficiencyLevel')}
              rules={[{ required: true }]}
              initialValue={3}
            >
              <Select>
                <Select.Option value={1}>{t('proficiency.beginner')} (1)</Select.Option>
                <Select.Option value={2}>{t('proficiency.basic')} (2)</Select.Option>
                <Select.Option value={3}>{t('proficiency.intermediate')} (3)</Select.Option>
                <Select.Option value={4}>{t('proficiency.advanced')} (4)</Select.Option>
                <Select.Option value={5}>{t('proficiency.expert')} (5)</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="skill_name"
              label={t('workPlan.skillName')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="skill_name_ar" label={t('workPlan.skillNameAr')}>
              <Input dir="rtl" />
            </Form.Item>
          </div>

          <Form.Item name="certification_number" label={t('workPlan.certificationNumber')}>
            <Input />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="issued_date" label={t('workPlan.issuedDate')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expiry_date" label={t('workPlan.expiryDate')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            name="is_verified"
            label={t('workPlan.verified')}
            valuePropName="checked"
            initialValue={false}
          >
            <Switch />
          </Form.Item>

          <Form.Item name="notes" label={t('common.notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default WorkerSkillsManager;
