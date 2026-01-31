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
  Space,
  message,
  Typography,
  Descriptions,
} from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionAssignmentsApi,
  rosterApi,
  type AssignTeamPayload,
} from '@inspection/shared';
import dayjs from 'dayjs';

export default function InspectionAssignmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);

  const [generateForm] = Form.useForm();
  const [assignForm] = Form.useForm();

  // Fetch all lists with their assignments
  const { data, isLoading } = useQuery({
    queryKey: ['inspection-assignments'],
    queryFn: () => inspectionAssignmentsApi.getLists({}),
  });

  // Fetch roster availability for the selected assignment's date + shift
  const assignmentDate = selectedAssignment?.list_target_date;
  const assignmentShift = selectedAssignment?.list_shift;

  const { data: availabilityData } = useQuery({
    queryKey: ['roster', 'day-availability', assignmentDate, assignmentShift],
    queryFn: () => rosterApi.getDayAvailability(assignmentDate, assignmentShift),
    enabled: assignOpen && !!assignmentDate && !!assignmentShift,
  });

  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'day' | 'night' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: (res) => {
      const result = (res.data as any)?.data ?? res.data;
      message.success(
        t('assignments.generateSuccess', 'Inspection list generated — {{count}} assignments created', {
          count: result?.total_assets ?? 0,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setGenerateOpen(false);
      generateForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('assignments.generateError', 'Failed to generate list'));
    },
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
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('assignments.assignError', 'Failed to assign team'));
    },
  });

  // Flatten: extract all assignments from all lists
  const rawLists: any[] = data?.data?.data || (data?.data as any)?.data || [];
  const allAssignments: any[] = [];
  for (const list of rawLists) {
    const assignments = list.assignments || [];
    for (const a of assignments) {
      allAssignments.push({
        ...a,
        list_target_date: list.target_date,
        list_shift: list.shift,
        list_status: list.status,
      });
    }
  }

  // Sort by date descending
  allAssignments.sort((a, b) => (b.list_target_date || '').localeCompare(a.list_target_date || ''));

  // Build inspector lists from roster availability (only those on the right shift)
  const availData = (availabilityData?.data as any)?.data ?? availabilityData?.data;
  const availableUsers: any[] = availData?.available ?? [];
  const onLeaveUsers: any[] = availData?.on_leave ?? [];

  // Filter available users: inspectors + specialists who are covering for an inspector
  const mechAvailable = availableUsers.filter(
    (u: any) => u.specialization === 'mechanical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)),
  );
  const elecAvailable = availableUsers.filter(
    (u: any) => u.specialization === 'electrical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)),
  );

  // On-leave inspectors to show as disabled (red)
  const mechOnLeave = onLeaveUsers.filter((u: any) => u.role === 'inspector' && u.specialization === 'mechanical');
  const elecOnLeave = onLeaveUsers.filter((u: any) => u.role === 'inspector' && u.specialization === 'electrical');

  // Combine: available first, then on-leave (disabled)
  const mechOptions = [...mechAvailable, ...mechOnLeave];
  const elecOptions = [...elecAvailable, ...elecOnLeave];

  // Set of cover user IDs
  const coverUserIds = new Set<number>();
  for (const u of availableUsers) {
    if (u.covering_for) coverUserIds.add(u.id);
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'green';
      case 'assigned': return 'blue';
      case 'in_progress': return 'processing';
      case 'unassigned': return 'default';
      default: return 'default';
    }
  };

  const columns = [
    {
      title: t('assignments.targetDate', 'Date'),
      dataIndex: 'list_target_date',
      key: 'date',
      width: 110,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
    {
      title: t('assignments.shift', 'Shift'),
      dataIndex: 'list_shift',
      key: 'shift',
      width: 80,
      render: (v: string) => v ? <Tag color={v === 'day' ? 'gold' : 'geekblue'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('assignments.equipment', 'Equipment'),
      key: 'equipment_name',
      render: (_: unknown, record: any) => record.equipment?.name || `ID: ${record.equipment_id}`,
    },
    {
      title: t('assignments.equipmentType', 'Type'),
      key: 'equipment_type',
      render: (_: unknown, record: any) => record.equipment?.equipment_type || '-',
    },
    {
      title: t('assignments.serialNumber', 'Serial #'),
      key: 'serial',
      render: (_: unknown, record: any) => record.equipment?.serial_number || '-',
    },
    {
      title: t('assignments.berth', 'Berth'),
      key: 'berth',
      width: 80,
      render: (_: unknown, record: any) => record.berth || record.equipment?.berth || '-',
    },
    {
      title: t('assignments.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string) => <Tag color={statusColor(v)}>{(v || 'unknown').toUpperCase()}</Tag>,
    },
    {
      title: t('assignments.mechInspector', 'Mech Inspector'),
      key: 'mech',
      render: (_: unknown, record: any) =>
        record.mechanical_inspector
          ? `${record.mechanical_inspector.full_name}`
          : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: t('assignments.elecInspector', 'Elec Inspector'),
      key: 'elec',
      render: (_: unknown, record: any) =>
        record.electrical_inspector
          ? `${record.electrical_inspector.full_name}`
          : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 130,
      render: (_: unknown, record: any) => (
        <Button
          type="primary"
          size="small"
          icon={<TeamOutlined />}
          onClick={() => {
            setSelectedAssignment(record);
            assignForm.resetFields();
            setAssignOpen(true);
          }}
          disabled={record.status === 'completed'}
        >
          {record.mechanical_inspector_id ? 'Reassign' : 'Assign'}
        </Button>
      ),
    },
  ];

  const renderInspectorOption = (u: any) => {
    const onLeave = onLeaveUsers.some((ol: any) => ol.id === u.id);
    const isCover = coverUserIds.has(u.id);
    return (
      <Select.Option key={u.id} value={u.id} disabled={onLeave}>
        <span style={{
          color: onLeave ? '#ff4d4f' : isCover ? '#52c41a' : undefined,
          fontWeight: onLeave || isCover ? 600 : undefined,
        }}>
          {u.full_name} ({u.role_id})
          {onLeave && u.leave_cover ? ` — Cover: ${u.leave_cover.full_name}` : ''}
          {onLeave && !u.leave_cover ? ' — On Leave' : ''}
          {isCover && u.covering_for ? ` — Covering ${u.covering_for.full_name}` : ''}
        </span>
      </Select.Option>
    );
  };

  return (
    <Card
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.assignments', 'Inspection Assignments')}
        </Typography.Title>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)}>
          {t('assignments.generate', 'Generate List')}
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={allAssignments}
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1200 }}
        size="small"
        bordered
        locale={{ emptyText: t('common.noData', 'No inspection assignments. Click "Generate List" to create one.') }}
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
          onFinish={(values: any) =>
            generateMutation.mutate({
              target_date: values.target_date.format('YYYY-MM-DD'),
              shift: values.shift,
            })
          }
        >
          <Form.Item
            name="target_date"
            label={t('assignments.targetDate', 'Target Date')}
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="shift"
            label={t('assignments.shift', 'Shift')}
            rules={[{ required: true }]}
          >
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
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Equipment">
              {selectedAssignment.equipment?.name || `ID: ${selectedAssignment.equipment_id}`}
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              {selectedAssignment.equipment?.equipment_type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Serial #">
              {selectedAssignment.equipment?.serial_number || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Berth">
              {selectedAssignment.berth || selectedAssignment.equipment?.berth || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Shift">
              {selectedAssignment.list_shift?.toUpperCase() || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {selectedAssignment.list_target_date ? dayjs(selectedAssignment.list_target_date).format('DD/MM/YYYY') : '-'}
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
            rules={[{ required: true, message: 'Please select a mechanical inspector' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('assignments.selectInspector', 'Select mechanical inspector')}
            >
              {mechOptions.map(renderInspectorOption)}
            </Select>
          </Form.Item>
          <Form.Item
            name="electrical_inspector_id"
            label={t('assignments.elecInspector', 'Electrical Inspector')}
            rules={[{ required: true, message: 'Please select an electrical inspector' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('assignments.selectInspector', 'Select electrical inspector')}
            >
              {elecOptions.map(renderInspectorOption)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
