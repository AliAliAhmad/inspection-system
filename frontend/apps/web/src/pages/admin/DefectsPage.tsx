import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Tabs,
  Typography,
  Button,
  Modal,
  Form,
  Select,
  Input,
  Space,
  message,
} from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  defectsApi,
  usersApi,
  type Defect,
  type DefectStatus,
  type AssignSpecialistPayload,
} from '@inspection/shared';

const severityColors: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'green',
};

const statusColors: Record<string, string> = {
  open: 'red',
  in_progress: 'blue',
  resolved: 'green',
  closed: 'default',
  false_alarm: 'purple',
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  false_alarm: 'False Alarm',
};

export default function DefectsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeStatus, setActiveStatus] = useState<DefectStatus | undefined>();
  const [page, setPage] = useState(1);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [assignForm] = Form.useForm();
  const [category, setCategory] = useState<string | undefined>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['defects', activeStatus, page],
    queryFn: () => defectsApi.list({ status: activeStatus, page, per_page: 20 }).then(r => r.data),
  });

  // Fetch specialists when modal is open
  const { data: specialistsData } = useQuery({
    queryKey: ['users', 'specialists'],
    queryFn: () => usersApi.list({ role: 'specialist', per_page: 200, is_active: true }),
    enabled: assignOpen,
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignSpecialistPayload }) =>
      defectsApi.assignSpecialist(id, payload),
    onSuccess: (res) => {
      const job = (res.data as any)?.data;
      message.success(
        t('defects.assignSuccess', 'Specialist job {{jobId}} created', {
          jobId: job?.job_id || '',
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['defects'] });
      setAssignOpen(false);
      setSelectedDefect(null);
      assignForm.resetFields();
      setCategory(undefined);
    },
    onError: (err: any) => {
      message.error(
        err?.response?.data?.message || t('defects.assignError', 'Failed to assign specialist'),
      );
    },
  });

  const specialists: any[] =
    specialistsData?.data?.data || (specialistsData?.data as any)?.data || [];

  const columns: ColumnsType<Defect> = [
    {
      title: t('defects.id', 'ID'),
      dataIndex: 'id',
      key: 'id',
      width: 70,
    },
    {
      title: t('defects.description', 'Description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: t('defects.severity', 'Severity'),
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => (
        <Tag color={severityColors[severity] || 'default'}>
          {severity?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('defects.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColors[status] || 'default'}>
          {statusLabels[status] || status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('defects.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      render: (cat: string | null) =>
        cat ? (
          <Tag color={cat === 'mechanical' ? 'blue' : 'gold'}>
            {cat.toUpperCase()}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('defects.priority', 'Priority'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => <Tag>{priority?.toUpperCase()}</Tag>,
    },
    {
      title: t('defects.dueDate', 'Due Date'),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (v: string | null) => v || '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: Defect) => {
        const hasJob = !!(record as any).specialist_job;
        return (
          <Button
            type="primary"
            size="small"
            icon={<ToolOutlined />}
            onClick={() => {
              setSelectedDefect(record);
              assignForm.resetFields();
              setCategory(undefined);
              setAssignOpen(true);
            }}
            disabled={hasJob || record.status === 'closed' || record.status === 'resolved'}
          >
            {hasJob
              ? t('defects.assigned', 'Assigned')
              : t('defects.assignSpecialist', 'Assign Specialist')}
          </Button>
        );
      },
    },
  ];

  const defects: Defect[] = data?.data || [];
  const pagination = data?.pagination;

  const tabItems = [
    { key: 'all', label: t('defects.all', 'All') },
    { key: 'open', label: t('defects.open', 'Open') },
    { key: 'in_progress', label: t('defects.inProgress', 'In Progress') },
    { key: 'resolved', label: t('defects.resolved', 'Resolved') },
    { key: 'closed', label: t('defects.closed', 'Closed') },
    { key: 'false_alarm', label: t('defects.falseAlarm', 'False Alarm') },
  ];

  const handleTabChange = (key: string) => {
    setActiveStatus(key === 'all' ? undefined : (key as DefectStatus));
    setPage(1);
  };

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.defects', 'Defects')}</Typography.Title>}
    >
      <Tabs
        activeKey={activeStatus || 'all'}
        onChange={handleTabChange}
        items={tabItems}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={defects}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || 20,
          total: pagination?.total || 0,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
        scroll={{ x: 1100 }}
      />

      {/* Assign Specialist Modal */}
      <Modal
        title={t('defects.assignSpecialist', 'Assign Specialist')}
        open={assignOpen}
        onCancel={() => {
          setAssignOpen(false);
          setSelectedDefect(null);
          assignForm.resetFields();
          setCategory(undefined);
        }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        destroyOnClose
      >
        {selectedDefect && (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong>Defect #{selectedDefect.id}: </Typography.Text>
            <Typography.Text>{selectedDefect.description}</Typography.Text>
            <br />
            <Space style={{ marginTop: 4 }}>
              <Tag color={severityColors[selectedDefect.severity || '']}>
                {selectedDefect.severity?.toUpperCase()}
              </Tag>
              {selectedDefect.category && (
                <Tag color={selectedDefect.category === 'mechanical' ? 'blue' : 'gold'}>
                  {selectedDefect.category.toUpperCase()}
                </Tag>
              )}
            </Space>
          </div>
        )}
        <Form
          form={assignForm}
          layout="vertical"
          onFinish={(values: AssignSpecialistPayload) =>
            selectedDefect &&
            assignMutation.mutate({ id: selectedDefect.id, payload: values })
          }
        >
          <Form.Item
            name="specialist_id"
            label={t('defects.specialist', 'Specialist')}
            rules={[{ required: true, message: 'Please select a specialist' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('defects.selectSpecialist', 'Select specialist')}
            >
              {specialists.map((s: any) => (
                <Select.Option key={s.id} value={s.id}>
                  {s.full_name} ({s.role_id})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="category"
            label={t('defects.jobCategory', 'Job Category')}
          >
            <Select
              allowClear
              placeholder={t('defects.selectCategory', 'Select category (optional)')}
              onChange={(v) => setCategory(v)}
            >
              <Select.Option value="minor">Minor</Select.Option>
              <Select.Option value="major">Major</Select.Option>
            </Select>
          </Form.Item>
          {category === 'major' && (
            <Form.Item
              name="major_reason"
              label={t('defects.majorReason', 'Major Reason')}
              rules={[{ required: true, message: 'Reason is required for major category' }]}
            >
              <Input.TextArea rows={3} placeholder={t('defects.enterMajorReason', 'Explain why this is a major job')} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
