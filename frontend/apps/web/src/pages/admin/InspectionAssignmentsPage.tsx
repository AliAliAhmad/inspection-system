import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  message,
  Typography,
  Descriptions,
} from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionAssignmentsApi,
  usersApi,
  type InspectionList,
  type InspectionAssignment,
  type AssignTeamPayload,
} from '@inspection/shared';
import dayjs from 'dayjs';

export default function InspectionAssignmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<InspectionAssignment | null>(null);

  const [generateForm] = Form.useForm();
  const [assignForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inspection-assignments', page, perPage],
    queryFn: () => inspectionAssignmentsApi.getLists({ page, per_page: perPage }),
  });

  const { data: inspectorsData } = useQuery({
    queryKey: ['users', 'inspectors'],
    queryFn: () => usersApi.list({ role: 'inspector', is_active: true, per_page: 200 }),
    enabled: assignOpen,
  });

  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'day' | 'night' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: () => {
      message.success(t('assignments.generateSuccess', 'Inspection list generated'));
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setGenerateOpen(false);
      generateForm.resetFields();
    },
    onError: () => message.error(t('assignments.generateError', 'Failed to generate list')),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignTeamPayload }) =>
      inspectionAssignmentsApi.assignTeam(id, payload),
    onSuccess: () => {
      message.success(t('assignments.assignSuccess', 'Team assigned successfully'));
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setAssignOpen(false);
      setSelectedAssignment(null);
      assignForm.resetFields();
    },
    onError: () => message.error(t('assignments.assignError', 'Failed to assign team')),
  });

  const openAssign = (assignment: InspectionAssignment) => {
    setSelectedAssignment(assignment);
    assignForm.resetFields();
    setAssignOpen(true);
  };

  const assignmentColumns: ColumnsType<InspectionAssignment> = [
    {
      title: t('assignments.equipment', 'Equipment'),
      key: 'equipment',
      render: (_: unknown, record: InspectionAssignment) => record.equipment?.name || `ID: ${record.equipment_id}`,
    },
    {
      title: t('assignments.berth', 'Berth'),
      dataIndex: 'berth',
      key: 'berth',
      render: (v: string | null) => v || '-',
    },
    {
      title: t('assignments.shift', 'Shift'),
      dataIndex: 'shift',
      key: 'shift',
      render: (v: string) => <Tag color={v === 'day' ? 'gold' : 'geekblue'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('assignments.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={v === 'completed' ? 'green' : v === 'assigned' ? 'blue' : 'default'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('assignments.mechInspector', 'Mech Inspector'),
      dataIndex: 'mechanical_inspector',
      key: 'mechanical_inspector',
      render: (v: any) => v ? `${v.full_name} (${v.employee_id ?? v.role_id})` : '-',
    },
    {
      title: t('assignments.elecInspector', 'Elec Inspector'),
      dataIndex: 'electrical_inspector',
      key: 'electrical_inspector',
      render: (v: any) => v ? `${v.full_name} (${v.employee_id ?? v.role_id})` : '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: InspectionAssignment) => (
        <Button type="link" icon={<TeamOutlined />} onClick={() => openAssign(record)}>
          {t('assignments.assignTeam', 'Assign Team')}
        </Button>
      ),
    },
  ];

  const listColumns: ColumnsType<InspectionList> = [
    { title: t('assignments.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
    {
      title: t('assignments.targetDate', 'Target Date'),
      dataIndex: 'target_date',
      key: 'target_date',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: t('assignments.shift', 'Shift'),
      dataIndex: 'shift',
      key: 'shift',
      render: (v: string) => <Tag color={v === 'day' ? 'gold' : 'geekblue'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('assignments.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('assignments.totalAssignments', 'Assignments'),
      key: 'count',
      render: (_: unknown, record: InspectionList) => record.assignments?.length || 0,
    },
    {
      title: t('assignments.createdAt', 'Created'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ];

  const lists = data?.data?.data || [];
  const pagination = data?.data?.pagination;
  const inspectors = (inspectorsData?.data as any)?.data || [];
  const mechInspectors = inspectors.filter((u: any) => u.specialization === 'mechanical');
  const elecInspectors = inspectors.filter((u: any) => u.specialization === 'electrical');

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.assignments', 'Inspection Assignments')}</Typography.Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)}>
          {t('assignments.generate', 'Generate List')}
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={listColumns}
        dataSource={lists}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || perPage,
          total: pagination?.total || 0,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPerPage(ps); },
        }}
        expandable={{
          expandedRowRender: (record: InspectionList) => (
            <Table
              rowKey="id"
              columns={assignmentColumns}
              dataSource={record.assignments || []}
              pagination={false}
              size="small"
            />
          ),
          rowExpandable: (record) => (record.assignments?.length || 0) > 0,
        }}
        scroll={{ x: 800 }}
      />

      {/* Generate List Modal */}
      <Modal
        title={t('assignments.generate', 'Generate Inspection List')}
        open={generateOpen}
        onCancel={() => { setGenerateOpen(false); generateForm.resetFields(); }}
        onOk={() => generateForm.submit()}
        confirmLoading={generateMutation.isPending}
        destroyOnClose
      >
        <Form
          form={generateForm}
          layout="vertical"
          onFinish={(values: { target_date: dayjs.Dayjs; shift: 'day' | 'night' }) =>
            generateMutation.mutate({ target_date: values.target_date.format('YYYY-MM-DD'), shift: values.shift })
          }
        >
          <Form.Item name="target_date" label={t('assignments.targetDate', 'Target Date')} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="shift" label={t('assignments.shift', 'Shift')} rules={[{ required: true }]}>
            <Select>
              <Select.Option value="day">{t('common.day', 'Day')}</Select.Option>
              <Select.Option value="night">{t('common.night', 'Night')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Team Modal */}
      <Modal
        title={t('assignments.assignTeam', 'Assign Inspection Team')}
        open={assignOpen}
        onCancel={() => { setAssignOpen(false); setSelectedAssignment(null); assignForm.resetFields(); }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        destroyOnClose
      >
        {selectedAssignment && (
          <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('assignments.equipment', 'Equipment')}>
              {selectedAssignment.equipment?.name || `ID: ${selectedAssignment.equipment_id}`}
            </Descriptions.Item>
            <Descriptions.Item label={t('assignments.shift', 'Shift')}>
              {selectedAssignment.shift?.toUpperCase()}
            </Descriptions.Item>
          </Descriptions>
        )}
        <Form
          form={assignForm}
          layout="vertical"
          onFinish={(v: AssignTeamPayload) =>
            selectedAssignment && assignMutation.mutate({ id: selectedAssignment.id, payload: v })
          }
        >
          <Form.Item
            name="mechanical_inspector_id"
            label={t('assignments.mechInspector', 'Mechanical Inspector')}
            rules={[{ required: true }]}
          >
            <Select showSearch optionFilterProp="children" placeholder={t('assignments.selectInspector', 'Select inspector')}>
              {mechInspectors.map((u: any) => (
                <Select.Option key={u.id} value={u.id}>
                  {u.full_name} ({u.employee_id ?? u.role_id})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="electrical_inspector_id"
            label={t('assignments.elecInspector', 'Electrical Inspector')}
            rules={[{ required: true }]}
          >
            <Select showSearch optionFilterProp="children" placeholder={t('assignments.selectInspector', 'Select inspector')}>
              {elecInspectors.map((u: any) => (
                <Select.Option key={u.id} value={u.id}>
                  {u.full_name} ({u.employee_id ?? u.role_id})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
