import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Select,
  DatePicker,
  Alert,
  message,
  Collapse,
} from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  inspectionAssignmentsApi,
  usersApi,
  InspectionList,
  InspectionAssignment,
  User,
  formatDate,
} from '@inspection/shared';

export default function TeamAssignmentPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [targetDate, setTargetDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [shift, setShift] = useState<'day' | 'night'>('day');

  // Track team selections per assignment: { assignmentId: { mech: userId, elec: userId } }
  const [teamSelections, setTeamSelections] = useState<
    Record<number, { mechanical_inspector_id?: number; electrical_inspector_id?: number }>
  >({});

  const { data: listsData, isLoading: listsLoading, error: listsError } = useQuery({
    queryKey: ['inspection-lists'],
    queryFn: () => inspectionAssignmentsApi.getLists({ per_page: 50 }).then((r) => r.data),
  });

  const lists: InspectionList[] = listsData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-inspectors'],
    queryFn: () => usersApi.list({ role: 'inspector', per_page: 200 }).then((r) => r.data),
  });

  const inspectors: User[] = usersData?.data ?? [];

  const mechanicalInspectors = inspectors.filter(
    (u) => u.specialization === 'mechanical' && u.is_active
  );
  const electricalInspectors = inspectors.filter(
    (u) => u.specialization === 'electrical' && u.is_active
  );

  const generateMutation = useMutation({
    mutationFn: () =>
      inspectionAssignmentsApi.generateList({
        target_date: targetDate?.format('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD'),
        shift,
      }),
    onSuccess: () => {
      message.success(t('common.success', 'Inspection list generated'));
      queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({
      assignmentId,
      payload,
    }: {
      assignmentId: number;
      payload: { mechanical_inspector_id: number; electrical_inspector_id: number };
    }) => inspectionAssignmentsApi.assignTeam(assignmentId, payload),
    onSuccess: () => {
      message.success(t('common.success', 'Team assigned'));
      queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const handleAssign = (assignmentId: number) => {
    const sel = teamSelections[assignmentId];
    if (!sel?.mechanical_inspector_id || !sel?.electrical_inspector_id) {
      message.warning(t('common.select_both', 'Please select both inspectors'));
      return;
    }
    assignMutation.mutate({
      assignmentId,
      payload: {
        mechanical_inspector_id: sel.mechanical_inspector_id,
        electrical_inspector_id: sel.electrical_inspector_id,
      },
    });
  };

  const updateSelection = (
    assignmentId: number,
    field: 'mechanical_inspector_id' | 'electrical_inspector_id',
    value: number
  ) => {
    setTeamSelections((prev) => ({
      ...prev,
      [assignmentId]: { ...prev[assignmentId], [field]: value },
    }));
  };

  const assignmentColumns: ColumnsType<InspectionAssignment> = [
    {
      title: t('equipment.name', 'Equipment'),
      key: 'equipment',
      render: (_: unknown, record: InspectionAssignment) =>
        record.equipment?.name ?? `Equipment #${record.equipment_id}`,
    },
    {
      title: t('equipment.type', 'Type'),
      key: 'equipment_type',
      render: (_: unknown, record: InspectionAssignment) =>
        record.equipment?.equipment_type ?? '-',
    },
    {
      title: t('equipment.berth', 'Berth'),
      dataIndex: 'berth',
      key: 'berth',
      render: (berth: string | null) => berth || '-',
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 180,
      render: (status: string, record: InspectionAssignment) => {
        const color = (() => {
          switch (status) {
            case 'completed': return 'green';
            case 'assigned': return 'blue';
            case 'in_progress': return 'processing';
            case 'mech_complete':
            case 'elec_complete': return 'purple';
            case 'both_complete': return 'cyan';
            case 'assessment_pending': return 'orange';
            default: return 'default';
          }
        })();
        const pendingLabels: Record<string, string> = {
          both_inspections: 'Pending: Both inspections',
          mechanical_inspection: 'Pending: Mechanical inspection',
          electrical_inspection: 'Pending: Electrical inspection',
          both_verdicts: 'Pending: Both verdicts',
          mechanical_verdict: 'Pending: Mechanical verdict',
          electrical_verdict: 'Pending: Electrical verdict',
        };
        return (
          <div>
            <Tag color={color}>{t(`status.${status}`, status.replace(/_/g, ' '))}</Tag>
            {record.pending_on && pendingLabels[record.pending_on] ? (
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {pendingLabels[record.pending_on]}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('common.mechanical_inspector', 'Mechanical Inspector'),
      key: 'mechanical',
      width: 220,
      render: (_: unknown, record: InspectionAssignment) => {
        if (record.mechanical_inspector_id) {
          const inspector = inspectors.find((u) => u.id === record.mechanical_inspector_id);
          return inspector?.full_name ?? `#${record.mechanical_inspector_id}`;
        }
        return (
          <Select
            placeholder={t('common.select', 'Select...')}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={teamSelections[record.id]?.mechanical_inspector_id}
            onChange={(val) => updateSelection(record.id, 'mechanical_inspector_id', val)}
            options={mechanicalInspectors.map((u) => ({
              value: u.id,
              label: u.full_name,
            }))}
          />
        );
      },
    },
    {
      title: t('common.electrical_inspector', 'Electrical Inspector'),
      key: 'electrical',
      width: 220,
      render: (_: unknown, record: InspectionAssignment) => {
        if (record.electrical_inspector_id) {
          const inspector = inspectors.find((u) => u.id === record.electrical_inspector_id);
          return inspector?.full_name ?? `#${record.electrical_inspector_id}`;
        }
        return (
          <Select
            placeholder={t('common.select', 'Select...')}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={teamSelections[record.id]?.electrical_inspector_id}
            onChange={(val) => updateSelection(record.id, 'electrical_inspector_id', val)}
            options={electricalInspectors.map((u) => ({
              value: u.id,
              label: u.full_name,
            }))}
          />
        );
      },
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 120,
      render: (_: unknown, record: InspectionAssignment) => {
        if (record.mechanical_inspector_id && record.electrical_inspector_id) {
          return <Tag color="green">{t('status.assigned', 'Assigned')}</Tag>;
        }
        return (
          <Button
            type="primary"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => handleAssign(record.id)}
            loading={assignMutation.isPending}
          >
            {t('common.assign', 'Assign')}
          </Button>
        );
      },
    },
  ];

  if (listsError) {
    return <Alert type="error" message={t('common.error', 'An error occurred')} showIcon />;
  }

  return (
    <div>
      <Typography.Title level={4}>
        {t('nav.team_assignment', 'Team Assignment')}
      </Typography.Title>

      {/* Generate new list */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <DatePicker
            value={targetDate}
            onChange={(val) => setTargetDate(val)}
            format="YYYY-MM-DD"
          />
          <Select
            value={shift}
            onChange={(val) => setShift(val)}
            style={{ width: 120 }}
            options={[
              { value: 'day', label: t('common.day', 'Day') },
              { value: 'night', label: t('common.night', 'Night') },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => generateMutation.mutate()}
            loading={generateMutation.isPending}
          >
            {t('common.generate_list', 'Generate List')}
          </Button>
        </Space>
      </Card>

      {/* Existing lists */}
      <Card loading={listsLoading}>
        {lists.length === 0 ? (
          <Typography.Text type="secondary">
            {t('common.noData', 'No inspection lists found')}
          </Typography.Text>
        ) : (
          <Collapse
            defaultActiveKey={lists.length > 0 ? [lists[0].id] : []}
            items={lists.map((list) => ({
              key: list.id,
              label: (
                <Space>
                  <span>
                    {formatDate(list.target_date)} -{' '}
                    <Tag color={list.shift === 'day' ? 'orange' : 'geekblue'}>
                      {list.shift === 'day' ? t('common.day', 'Day') : t('common.night', 'Night')}
                    </Tag>
                  </span>
                  <Tag>{t(`status.${list.status}`, list.status)}</Tag>
                  <Typography.Text type="secondary">
                    {list.assignments.length} {t('common.assignments', 'assignments')}
                  </Typography.Text>
                </Space>
              ),
              children: (
                <Table<InspectionAssignment>
                  rowKey="id"
                  columns={assignmentColumns}
                  dataSource={list.assignments}
                  pagination={false}
                  size="small"
                />
              ),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
