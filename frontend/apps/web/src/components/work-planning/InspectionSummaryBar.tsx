import { useState } from 'react';
import { Badge, Card, Col, Row, Space, Tag, Tooltip, Typography } from 'antd';
import { CaretDownOutlined, CaretRightOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi, type DayInspectionSummary, type DayInspections, type DayInspectionsBerth } from '@inspection/shared';

const { Text } = Typography;

const STATUS_COLORS: Record<string, string> = {
  unassigned: '#d9d9d9',
  assigned: '#1677ff',
  in_progress: '#faad14',
  completed: '#52c41a',
  mech_complete: '#faad14',
  elec_complete: '#faad14',
  both_complete: '#52c41a',
  assessment_pending: '#722ed1',
};

interface InspectionSummaryBarProps {
  date: string; // YYYY-MM-DD
  berth: 'east' | 'west';
}

export default function InspectionSummaryBar({ date, berth }: InspectionSummaryBarProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const { data: inspections, isLoading } = useQuery({
    queryKey: ['day-inspections', date, berth],
    queryFn: async (): Promise<DayInspections> => {
      const r = await workPlansApi.getDayInspections(date, berth);
      return r.data.data as DayInspections;
    },
    enabled: !!date,
    staleTime: 30_000,
  });

  const berthData: DayInspectionsBerth | undefined = inspections?.[berth];
  const count = berthData?.count ?? 0;
  const assignments: DayInspectionSummary[] = berthData?.assignments ?? [];

  if (isLoading || count === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {/* Summary bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: '#f0f5ff',
          borderRadius: 6,
          cursor: 'pointer',
          border: '1px solid #d6e4ff',
        }}
      >
        {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        <SearchOutlined style={{ color: '#1677ff' }} />
        <Text strong style={{ color: '#1677ff' }}>
          {count} {t('work_plan.inspections', 'Inspections')}
        </Text>
        <div style={{ flex: 1 }} />
        {/* Status summary badges */}
        <Space size={4}>
          {(() => {
            const assigned = assignments.filter(a => a.status === 'assigned').length;
            const inProgress = assignments.filter(a => ['in_progress', 'mech_complete', 'elec_complete'].includes(a.status)).length;
            const completed = assignments.filter(a => ['completed', 'both_complete', 'assessment_pending'].includes(a.status)).length;
            const unassigned = assignments.filter(a => a.status === 'unassigned').length;
            return (
              <>
                {unassigned > 0 && <Tag color="default">{unassigned} {t('common.unassigned', 'Unassigned')}</Tag>}
                {assigned > 0 && <Tag color="blue">{assigned} {t('common.assigned', 'Assigned')}</Tag>}
                {inProgress > 0 && <Tag color="orange">{inProgress} {t('common.in_progress', 'In Progress')}</Tag>}
                {completed > 0 && <Tag color="green">{completed} {t('common.completed', 'Completed')}</Tag>}
              </>
            );
          })()}
        </Space>
      </div>

      {/* Expanded grid */}
      {expanded && (
        <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
          {assignments.map((a, idx) => (
            <Col key={idx} xs={24} sm={12} md={8} lg={6}>
              <InspectionCard assignment={a} />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

function InspectionCard({ assignment }: { assignment: DayInspectionSummary }) {
  const statusColor = STATUS_COLORS[assignment.status] ?? '#d9d9d9';

  return (
    <Card
      size="small"
      styles={{ body: { padding: '8px 10px' } }}
      style={{ borderLeft: `3px solid ${statusColor}` }}
    >
      {/* Equipment name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Tooltip title={assignment.status.replace(/_/g, ' ')}>
          <Badge color={statusColor} />
        </Tooltip>
        <Text strong style={{ fontSize: 13 }} ellipsis={{ tooltip: true }}>
          {assignment.equipment_name}
        </Text>
      </div>

      {/* Serial number */}
      {assignment.equipment_serial && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
          {assignment.equipment_serial}
        </Text>
      )}

      {/* Inspectors */}
      <div style={{ fontSize: 11, color: '#595959' }}>
        {assignment.mechanical_inspector && (
          <div>M: {assignment.mechanical_inspector}</div>
        )}
        {assignment.electrical_inspector && (
          <div>E: {assignment.electrical_inspector}</div>
        )}
        {assignment.engineer && (
          <div style={{ color: '#1677ff', fontWeight: 500 }}>
            Eng: {assignment.engineer}
          </div>
        )}
        {!assignment.mechanical_inspector && !assignment.electrical_inspector && (
          <Text type="danger" style={{ fontSize: 11 }}>Not Assigned</Text>
        )}
      </div>
    </Card>
  );
}
