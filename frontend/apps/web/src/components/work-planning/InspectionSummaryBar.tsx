import { useState } from 'react';
import { Badge, Tooltip, Typography } from 'antd';
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
    <div style={{ marginTop: 4, flexShrink: 0 }}>
      {/* Compact summary bar — works in narrow columns */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
          padding: '4px 6px',
          backgroundColor: '#f0f5ff',
          borderRadius: 4,
          cursor: 'pointer',
          border: '1px solid #d6e4ff',
          minHeight: 24,
        }}
      >
        <span style={{ fontSize: 10, color: '#1677ff' }}>
          {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        </span>
        <SearchOutlined style={{ color: '#1677ff', fontSize: 11 }} />
        <Text strong style={{ color: '#1677ff', fontSize: 11, whiteSpace: 'nowrap' }}>
          {count} {t('work_plan.inspections', 'Inspections')}
        </Text>
      </div>

      {/* Expanded grid */}
      {expanded && (
        <div style={{ marginTop: 6 }}>
          {assignments.map((a, idx) => (
            <InspectionCard key={idx} assignment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function InspectionCard({ assignment }: { assignment: DayInspectionSummary }) {
  const statusColor = STATUS_COLORS[assignment.status] ?? '#d9d9d9';

  return (
    <div
      style={{
        padding: '4px 6px',
        marginBottom: 3,
        borderLeft: `3px solid ${statusColor}`,
        backgroundColor: '#fafafa',
        borderRadius: 3,
        fontSize: 11,
      }}
    >
      {/* Equipment name with status dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <Tooltip title={assignment.status.replace(/_/g, ' ')}>
          <Badge color={statusColor} />
        </Tooltip>
        <Text strong style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {assignment.equipment_name}
        </Text>
      </div>

      {/* Serial */}
      {assignment.equipment_serial && (
        <div style={{ color: '#8c8c8c', fontSize: 10, marginLeft: 14 }}>
          {assignment.equipment_serial}
        </div>
      )}

      {/* Inspectors — compact */}
      <div style={{ color: '#595959', fontSize: 10, marginLeft: 14 }}>
        {assignment.mechanical_inspector && <span>M: {assignment.mechanical_inspector.split(' ')[0]} </span>}
        {assignment.electrical_inspector && <span>E: {assignment.electrical_inspector.split(' ')[0]} </span>}
        {assignment.engineer && <span style={{ color: '#1677ff' }}>Eng: {assignment.engineer.split(' ')[0]}</span>}
        {!assignment.mechanical_inspector && !assignment.electrical_inspector && (
          <span style={{ color: '#ff4d4f' }}>Not Assigned</span>
        )}
      </div>
    </div>
  );
}
