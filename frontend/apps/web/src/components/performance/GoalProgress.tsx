import { Card, Progress, Typography, Space, Tag, Button, Tooltip } from 'antd';
import {
  EditOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  FireOutlined,
  StarOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  ExperimentOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { GoalType, GoalStatus, PerformanceGoal } from '@inspection/shared';

const { Text } = Typography;

export interface Goal extends PerformanceGoal {
  title?: string;
  description?: string;
  updated_at?: string;
}

export interface GoalProgressProps {
  goal: Goal;
  onEdit?: (goal: Goal) => void;
  compact?: boolean;
}

const GOAL_TYPE_CONFIG: Record<GoalType | string, { icon: React.ReactNode; color: string; label: string }> = {
  jobs: { icon: <ThunderboltOutlined />, color: '#1677ff', label: 'Jobs Completed' },
  points: { icon: <StarOutlined />, color: '#faad14', label: 'Points Earned' },
  streak: { icon: <FireOutlined />, color: '#fa541c', label: 'Day Streak' },
  rating: { icon: <TrophyOutlined />, color: '#722ed1', label: 'Rating Goal' },
  inspections: { icon: <ExperimentOutlined />, color: '#52c41a', label: 'Inspections' },
  defects: { icon: <BugOutlined />, color: '#eb2f96', label: 'Defects Fixed' },
  custom: { icon: <RiseOutlined />, color: '#13c2c2', label: 'Custom Goal' },
};

export function GoalProgress({ goal, onEdit, compact = false }: GoalProgressProps) {
  const { t } = useTranslation();

  const config = GOAL_TYPE_CONFIG[goal.goal_type] || GOAL_TYPE_CONFIG.custom;
  const progressPercent = goal.progress_percentage ?? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100));
  const daysRemaining = goal.days_remaining ?? dayjs(goal.end_date).diff(dayjs(), 'day');
  const isOverdue = daysRemaining < 0;
  const isOnTrack = goal.is_on_track ?? goal.current_value >= (goal.target_value * (1 - daysRemaining / dayjs(goal.end_date).diff(dayjs(goal.start_date), 'day')));
  const isCompleted = goal.status === 'completed' || progressPercent >= 100;
  const isFailed = goal.status === 'failed';

  const getStatusColor = () => {
    if (isCompleted) return '#52c41a';
    if (isFailed || isOverdue) return '#ff4d4f';
    if (!isOnTrack) return '#faad14';
    return '#52c41a';
  };

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (isFailed || isOverdue) return <WarningOutlined style={{ color: '#ff4d4f' }} />;
    if (!isOnTrack) return <WarningOutlined style={{ color: '#faad14' }} />;
    return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
  };

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderRadius: 8,
          border: `1px solid ${config.color}30`,
          background: `${config.color}05`,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: `${config.color}15`,
            color: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          {config.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong ellipsis style={{ maxWidth: 150 }}>
              {goal.title}
            </Text>
            {getStatusIcon()}
          </div>
          <Progress
            percent={progressPercent}
            size="small"
            strokeColor={getStatusColor()}
            showInfo={false}
            style={{ marginBottom: 0 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {goal.current_value} / {goal.target_value}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {isOverdue
                ? t('performance.overdue', 'Overdue')
                : `${daysRemaining} ${t('performance.days_left', 'days left')}`}
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card
      size="small"
      style={{
        borderColor: `${config.color}30`,
        marginBottom: 12,
      }}
      styles={{
        body: { padding: 16 },
      }}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: `${config.color}15`,
            color: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <Text strong style={{ fontSize: 15, display: 'block' }}>
                {goal.title}
              </Text>
              <Tag color={config.color} style={{ marginTop: 4 }}>
                {t(`performance.goal_type.${goal.goal_type}`, config.label)}
              </Tag>
            </div>
            <Space>
              <Tooltip title={isOnTrack ? t('performance.on_track', 'On Track') : t('performance.behind', 'Behind Schedule')}>
                {getStatusIcon()}
              </Tooltip>
              {onEdit && goal.status === 'active' && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(goal);
                  }}
                />
              )}
            </Space>
          </div>

          {/* Progress */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('performance.progress', 'Progress')}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: 600 }}>
                {goal.current_value} / {goal.target_value}
              </Text>
            </div>
            <Progress
              percent={progressPercent}
              strokeColor={getStatusColor()}
              trailColor="#f0f0f0"
            />
          </div>

          {/* Time Remaining */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isOverdue ? (
                  <span style={{ color: '#ff4d4f' }}>
                    {t('performance.overdue_by', 'Overdue by {{days}} days', { days: Math.abs(daysRemaining) })}
                  </span>
                ) : daysRemaining === 0 ? (
                  t('performance.due_today', 'Due today')
                ) : (
                  t('performance.days_remaining', '{{days}} days remaining', { days: daysRemaining })
                )}
              </Text>
            </Space>
            {goal.status !== 'active' && (
              <Tag
                color={goal.status === 'completed' ? 'success' : goal.status === 'failed' ? 'error' : 'default'}
              >
                {goal.status.toUpperCase()}
              </Tag>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default GoalProgress;
