import React, { useMemo } from 'react';
import {
  Alert,
  List,
  Typography,
  Tag,
  Space,
  Collapse,
  Badge,
} from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type {
  InspectionRoutine,
  RoutineShiftType,
  RoutineDayOfWeek,
  RoutineFrequencyType,
} from '@inspection/shared';

const { Text } = Typography;
const { Panel } = Collapse;

interface ConflictWarningProps {
  currentRoutine: {
    id?: number;
    asset_types: string[];
    shift: RoutineShiftType | null;
    days_of_week: RoutineDayOfWeek[];
    frequency: RoutineFrequencyType;
  };
  existingRoutines: InspectionRoutine[];
  style?: React.CSSProperties;
}

interface Conflict {
  routine: InspectionRoutine;
  overlappingAssets: string[];
  conflictType: 'full' | 'partial' | 'info';
  reason: string;
}

const DAYS_MAP: Record<RoutineDayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const ConflictWarning: React.FC<ConflictWarningProps> = ({
  currentRoutine,
  existingRoutines,
  style,
}) => {
  const { t } = useTranslation();

  // Detect conflicts with existing routines
  const conflicts = useMemo<Conflict[]>(() => {
    const result: Conflict[] = [];

    for (const routine of existingRoutines) {
      // Skip if it's the same routine (for edit mode)
      if (currentRoutine.id && routine.id === currentRoutine.id) {
        continue;
      }

      // Skip inactive routines
      if (!routine.is_active) {
        continue;
      }

      // Find overlapping asset types
      const overlappingAssets = currentRoutine.asset_types.filter((at) =>
        routine.asset_types.includes(at)
      );

      if (overlappingAssets.length === 0) {
        continue;
      }

      // Check for schedule overlap
      const currentFreq = currentRoutine.frequency;
      const existingFreq = routine.frequency || 'daily';

      // Determine shift overlap
      const currentShift = currentRoutine.shift;
      const existingShift = routine.shift;
      const shiftOverlaps =
        !currentShift ||
        !existingShift ||
        currentShift === existingShift;

      // Determine day overlap
      const currentDays = new Set(currentRoutine.days_of_week.map((d) => DAYS_MAP[d]));
      const existingDays = new Set(
        (routine.days_of_week || []).map((d) => DAYS_MAP[d as RoutineDayOfWeek])
      );

      let dayOverlaps = false;
      if (currentFreq === 'daily' || existingFreq === 'daily') {
        // Daily routines overlap with everything
        dayOverlaps = true;
      } else if (currentFreq === 'weekly' && existingFreq === 'weekly') {
        // Check if any days match
        for (const day of currentDays) {
          if (existingDays.has(day)) {
            dayOverlaps = true;
            break;
          }
        }
      } else {
        // Monthly routines - check first occurrence
        dayOverlaps = true; // Simplified - assume potential overlap
      }

      if (!shiftOverlaps || !dayOverlaps) {
        // No overlap in schedule
        continue;
      }

      // Determine conflict severity
      let conflictType: Conflict['conflictType'];
      let reason: string;

      if (shiftOverlaps && dayOverlaps && currentFreq === existingFreq) {
        conflictType = 'full';
        reason = t(
          'routines.conflictFull',
          'Same schedule: Equipment will have multiple inspections at the same time'
        );
      } else if (shiftOverlaps) {
        conflictType = 'partial';
        reason = t(
          'routines.conflictPartial',
          'Overlapping shift: Some inspection times may coincide'
        );
      } else {
        conflictType = 'info';
        reason = t(
          'routines.conflictInfo',
          'Same asset types: Different schedules but may create inspection load'
        );
      }

      result.push({
        routine,
        overlappingAssets,
        conflictType,
        reason,
      });
    }

    // Sort by severity
    return result.sort((a, b) => {
      const order = { full: 0, partial: 1, info: 2 };
      return order[a.conflictType] - order[b.conflictType];
    });
  }, [currentRoutine, existingRoutines, t]);

  if (conflicts.length === 0) {
    return null;
  }

  const fullConflicts = conflicts.filter((c) => c.conflictType === 'full');
  const partialConflicts = conflicts.filter((c) => c.conflictType === 'partial');
  const infoConflicts = conflicts.filter((c) => c.conflictType === 'info');

  const getAlertType = () => {
    if (fullConflicts.length > 0) return 'error';
    if (partialConflicts.length > 0) return 'warning';
    return 'info';
  };

  const getIcon = () => {
    if (fullConflicts.length > 0) return <ExclamationCircleOutlined />;
    if (partialConflicts.length > 0) return <WarningOutlined />;
    return <InfoCircleOutlined />;
  };

  const renderConflictList = (items: Conflict[], type: Conflict['conflictType']) => {
    if (items.length === 0) return null;

    const colorMap = {
      full: 'red',
      partial: 'orange',
      info: 'blue',
    };

    return (
      <List
        size="small"
        dataSource={items}
        renderItem={(conflict) => (
          <List.Item style={{ padding: '4px 0' }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Space>
                <Badge color={colorMap[type]} />
                <Text strong>{conflict.routine.name}</Text>
                {conflict.routine.shift && (
                  <Tag>{t(`routines.${conflict.routine.shift}`, conflict.routine.shift)}</Tag>
                )}
              </Space>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 14 }}>
                {conflict.reason}
              </Text>
              <div style={{ marginLeft: 14 }}>
                {conflict.overlappingAssets.map((asset) => (
                  <Tag key={asset} style={{ marginBottom: 2 }}>
                    {asset}
                  </Tag>
                ))}
              </div>
            </Space>
          </List.Item>
        )}
      />
    );
  };

  return (
    <Alert
      type={getAlertType()}
      icon={getIcon()}
      showIcon
      style={{ marginBottom: 16, ...style }}
      message={
        <Space>
          <span>
            {t('routines.conflictDetected', 'Schedule Conflicts Detected')}
          </span>
          <Badge
            count={conflicts.length}
            style={{
              backgroundColor:
                getAlertType() === 'error'
                  ? '#ff4d4f'
                  : getAlertType() === 'warning'
                  ? '#faad14'
                  : '#1890ff',
            }}
          />
        </Space>
      }
      description={
        <Collapse ghost size="small" style={{ marginTop: 8 }}>
          {fullConflicts.length > 0 && (
            <Panel
              header={
                <Text type="danger">
                  <ExclamationCircleOutlined style={{ marginRight: 8 }} />
                  {t('routines.fullConflicts', 'Full Conflicts')} ({fullConflicts.length})
                </Text>
              }
              key="full"
            >
              {renderConflictList(fullConflicts, 'full')}
            </Panel>
          )}
          {partialConflicts.length > 0 && (
            <Panel
              header={
                <Text style={{ color: '#faad14' }}>
                  <WarningOutlined style={{ marginRight: 8 }} />
                  {t('routines.partialConflicts', 'Partial Overlaps')} ({partialConflicts.length})
                </Text>
              }
              key="partial"
            >
              {renderConflictList(partialConflicts, 'partial')}
            </Panel>
          )}
          {infoConflicts.length > 0 && (
            <Panel
              header={
                <Text type="secondary">
                  <InfoCircleOutlined style={{ marginRight: 8 }} />
                  {t('routines.infoConflicts', 'Related Routines')} ({infoConflicts.length})
                </Text>
              }
              key="info"
            >
              {renderConflictList(infoConflicts, 'info')}
            </Panel>
          )}
        </Collapse>
      }
    />
  );
};

export default ConflictWarning;
