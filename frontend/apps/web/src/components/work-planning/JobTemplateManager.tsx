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
  Tabs,
  Popconfirm,
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ToolOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';

interface JobTemplate {
  id: number;
  name: string;
  name_ar?: string;
  job_type: string;
  equipment_type?: string;
  berth?: string;
  estimated_hours: number;
  priority: string;
  description?: string;
  recurrence_type?: string;
  recurrence_day?: number;
  default_team_size: number;
  required_certifications?: string[];
  is_active: boolean;
  materials?: any[];
  checklist_items?: any[];
}

export const JobTemplateManager: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<JobTemplate | null>(null);
  const [activeTab, setActiveTab] = useState('details');
  const [filters, setFilters] = useState({ job_type: '', equipment_type: '' });
  const [form] = Form.useForm();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['job-templates', filters],
    queryFn: () => workPlansApi.listTemplates(filters),
  });

  const createMutation = useMutation({
    mutationFn: workPlansApi.createTemplate,
    onSuccess: () => {
      message.success(t('common.created'));
      queryClient.invalidateQueries({ queryKey: ['job-templates'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      workPlansApi.updateTemplate(id, data),
    onSuccess: () => {
      message.success(t('common.updated'));
      queryClient.invalidateQueries({ queryKey: ['job-templates'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: workPlansApi.deleteTemplate,
    onSuccess: () => {
      message.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['job-templates'] });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      workPlansApi.cloneTemplate(id, { new_name: name }),
    onSuccess: () => {
      message.success(t('workPlan.templateCloned'));
      queryClient.invalidateQueries({ queryKey: ['job-templates'] });
    },
  });

  const handleOpenModal = (template?: JobTemplate) => {
    if (template) {
      setEditingTemplate(template);
      form.setFieldsValue(template);
    } else {
      setEditingTemplate(null);
      form.resetFields();
    }
    setActiveTab('details');
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingTemplate(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleClone = (template: JobTemplate) => {
    Modal.confirm({
      title: t('workPlan.cloneTemplate'),
      content: (
        <Input
          placeholder={t('workPlan.newTemplateName')}
          id="clone-name-input"
          defaultValue={`${template.name} (Copy)`}
        />
      ),
      onOk: () => {
        const input = document.getElementById('clone-name-input') as HTMLInputElement;
        cloneMutation.mutate({ id: template.id, name: input.value });
      },
    });
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: JobTemplate) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.name_ar && (
            <div style={{ fontSize: 12, color: '#666' }}>{record.name_ar}</div>
          )}
        </div>
      ),
    },
    {
      title: t('workPlan.jobType'),
      dataIndex: 'job_type',
      key: 'job_type',
      render: (type: string) => (
        <Tag color={type === 'pm' ? 'blue' : type === 'defect' ? 'red' : 'green'}>
          {t(`jobType.${type}`)}
        </Tag>
      ),
    },
    {
      title: t('equipment.type'),
      dataIndex: 'equipment_type',
      key: 'equipment_type',
    },
    {
      title: t('workPlan.estimatedHours'),
      dataIndex: 'estimated_hours',
      key: 'estimated_hours',
      render: (hours: number) => `${hours}h`,
    },
    {
      title: t('common.priority'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => (
        <Tag
          color={
            priority === 'urgent'
              ? 'red'
              : priority === 'high'
              ? 'orange'
              : priority === 'low'
              ? 'green'
              : 'blue'
          }
        >
          {t(`priority.${priority}`)}
        </Tag>
      ),
    },
    {
      title: t('workPlan.recurrence'),
      dataIndex: 'recurrence_type',
      key: 'recurrence_type',
      render: (type: string) => type && <Tag>{t(`recurrence.${type}`)}</Tag>,
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
      render: (_: any, record: JobTemplate) => (
        <Space>
          <Tooltip title={t('common.edit')}>
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleOpenModal(record)}
            />
          </Tooltip>
          <Tooltip title={t('workPlan.clone')}>
            <Button
              icon={<CopyOutlined />}
              size="small"
              onClick={() => handleClone(record)}
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

  return (
    <Card
      title={t('workPlan.jobTemplates')}
      extra={
        <Space>
          <Select
            placeholder={t('workPlan.filterByType')}
            allowClear
            style={{ width: 150 }}
            onChange={(v) => setFilters((f) => ({ ...f, job_type: v || '' }))}
          >
            <Select.Option value="pm">{t('jobType.pm')}</Select.Option>
            <Select.Option value="defect">{t('jobType.defect')}</Select.Option>
            <Select.Option value="inspection">{t('jobType.inspection')}</Select.Option>
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('workPlan.addTemplate')}
          </Button>
        </Space>
      }
    >
      <Table
        dataSource={templates?.data?.data || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingTemplate ? t('workPlan.editTemplate') : t('workPlan.addTemplate')}
        open={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        width={700}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab={t('common.details')} key="details">
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
                <Form.Item
                  name="job_type"
                  label={t('workPlan.jobType')}
                  rules={[{ required: true }]}
                >
                  <Select>
                    <Select.Option value="pm">{t('jobType.pm')}</Select.Option>
                    <Select.Option value="defect">{t('jobType.defect')}</Select.Option>
                    <Select.Option value="inspection">{t('jobType.inspection')}</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="equipment_type" label={t('equipment.type')}>
                  <Input />
                </Form.Item>
                <Form.Item name="berth" label={t('workPlan.berth')}>
                  <Select allowClear>
                    <Select.Option value="east">{t('berth.east')}</Select.Option>
                    <Select.Option value="west">{t('berth.west')}</Select.Option>
                    <Select.Option value="both">{t('berth.both')}</Select.Option>
                  </Select>
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <Form.Item
                  name="estimated_hours"
                  label={t('workPlan.estimatedHours')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="priority" label={t('common.priority')} initialValue="normal">
                  <Select>
                    <Select.Option value="low">{t('priority.low')}</Select.Option>
                    <Select.Option value="normal">{t('priority.normal')}</Select.Option>
                    <Select.Option value="high">{t('priority.high')}</Select.Option>
                    <Select.Option value="urgent">{t('priority.urgent')}</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  name="default_team_size"
                  label={t('workPlan.teamSize')}
                  initialValue={1}
                >
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="recurrence_type" label={t('workPlan.recurrence')}>
                  <Select allowClear>
                    <Select.Option value="weekly">{t('recurrence.weekly')}</Select.Option>
                    <Select.Option value="monthly">{t('recurrence.monthly')}</Select.Option>
                    <Select.Option value="quarterly">{t('recurrence.quarterly')}</Select.Option>
                    <Select.Option value="yearly">{t('recurrence.yearly')}</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="recurrence_day" label={t('workPlan.recurrenceDay')}>
                  <InputNumber min={1} max={31} style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <Form.Item name="description" label={t('common.description')}>
                <Input.TextArea rows={3} />
              </Form.Item>

              <Form.Item name="is_active" label={t('common.active')} valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            </Form>
          </Tabs.TabPane>

          <Tabs.TabPane
            tab={
              <span>
                <ToolOutlined /> {t('workPlan.materials')}
              </span>
            }
            key="materials"
            disabled={!editingTemplate}
          >
            {editingTemplate && (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                {t('workPlan.manageMaterialsAfterSave')}
              </div>
            )}
          </Tabs.TabPane>

          <Tabs.TabPane
            tab={
              <span>
                <CheckSquareOutlined /> {t('workPlan.checklist')}
              </span>
            }
            key="checklist"
            disabled={!editingTemplate}
          >
            {editingTemplate && (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                {t('workPlan.manageChecklistAfterSave')}
              </div>
            )}
          </Tabs.TabPane>
        </Tabs>
      </Modal>
    </Card>
  );
};

export default JobTemplateManager;
