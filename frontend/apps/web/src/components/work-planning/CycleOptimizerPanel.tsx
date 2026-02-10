import { useState, useMemo } from 'react';
import {
  Card,
  List,
  Tag,
  Space,
  Typography,
  Button,
  Empty,
  Collapse,
  Statistic,
  Row,
  Col,
  Spin,
  Alert,
  Tooltip,
  Progress,
  Badge,
} from 'antd';
import {
  RobotOutlined,
  ReloadOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  RiseOutlined,
  FallOutlined,
  ThunderboltOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cyclesApi, type MaintenanceCycle, type CycleAnalyticsData } from '@inspection/shared';

const { Text, Title } = Typography;
const { Panel } = Collapse;

interface CycleOptimizerPanelProps {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onViewCycle?: (cycleId: number) => void;
}

interface OptimizationRecommendation {
  cycleId: number;
  cycleName: string;
  cycleType: 'running_hours' | 'calendar';
  type: 'increase' | 'decrease' | 'warning' | 'info' | 'new';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  currentValue?: string;
  suggestedValue?: string;
  reason: string;
  impact: string;
}

export default function CycleOptimizerPanel({
  collapsible = true,
  defaultCollapsed = false,
  onViewCycle,
}: CycleOptimizerPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Fetch all cycles
  const {
    data: cyclesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cycles'],
    queryFn: async () => {
      const res = await cyclesApi.list();
      return res.data?.data?.cycles || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch analytics for all cycles
  const { data: analyticsDataMap, isLoading: analyticsLoading } = useQuery({
    queryKey: ['cycles', 'all-analytics'],
    queryFn: async () => {
      const cycles = cyclesData || [];
      const analyticsMap: Record<number, CycleAnalyticsData> = {};

      // Fetch analytics for each cycle in parallel
      await Promise.all(
        cycles.map(async (cycle: MaintenanceCycle) => {
          try {
            const res = await cyclesApi.getAnalytics(cycle.id);
            if (res.data?.data) {
              analyticsMap[cycle.id] = res.data.data;
            }
          } catch (e) {
            // Ignore errors for individual cycles
          }
        })
      );

      return analyticsMap;
    },
    enabled: !!cyclesData && cyclesData.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Generate optimization recommendations based on cycle data
  const recommendations = useMemo<OptimizationRecommendation[]>(() => {
    if (!cyclesData || !analyticsDataMap) return [];

    const recs: OptimizationRecommendation[] = [];

    cyclesData.forEach((cycle: MaintenanceCycle) => {
      const analytics = analyticsDataMap[cycle.id];
      if (!analytics) return;

      // Low effectiveness score - suggest review
      if (analytics.effectiveness_score !== null && analytics.effectiveness_score < 60) {
        recs.push({
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleType: cycle.cycle_type,
          type: 'warning',
          priority: analytics.effectiveness_score < 40 ? 'high' : 'medium',
          title: t('cycles.optimizer.lowEffectiveness', 'Low Effectiveness Score'),
          description: t(
            'cycles.optimizer.lowEffectivenessDesc',
            'This cycle has a low effectiveness score. Consider reviewing the interval or linked equipment.'
          ),
          currentValue: `${analytics.effectiveness_score}%`,
          reason: t(
            'cycles.optimizer.lowEffectivenessReason',
            'Low completion rate or delayed jobs'
          ),
          impact: t(
            'cycles.optimizer.lowEffectivenessImpact',
            'May indicate the cycle is too frequent or not aligned with equipment needs'
          ),
        });
      }

      // High pending jobs - suggest adjustment
      if (analytics.jobs_pending > analytics.jobs_completed && analytics.jobs_pending > 5) {
        recs.push({
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleType: cycle.cycle_type,
          type: 'increase',
          priority: 'high',
          title: t('cycles.optimizer.manyPending', 'High Pending Jobs'),
          description: t(
            'cycles.optimizer.manyPendingDesc',
            'More jobs are pending than completed. Consider increasing the interval.'
          ),
          currentValue: cycle.cycle_type === 'running_hours'
            ? `${cycle.hours_value}h`
            : `${cycle.calendar_value} ${cycle.calendar_unit}`,
          suggestedValue: cycle.cycle_type === 'running_hours'
            ? `${Math.round((cycle.hours_value || 0) * 1.25)}h`
            : `${Math.round((cycle.calendar_value || 0) * 1.25)} ${cycle.calendar_unit}`,
          reason: t(
            'cycles.optimizer.manyPendingReason',
            '{{pending}} pending vs {{completed}} completed jobs',
            { pending: analytics.jobs_pending, completed: analytics.jobs_completed }
          ),
          impact: t(
            'cycles.optimizer.manyPendingImpact',
            'Reducing frequency may improve completion rates'
          ),
        });
      }

      // Very high effectiveness with few jobs - consider decreasing interval
      if (
        analytics.effectiveness_score !== null &&
        analytics.effectiveness_score > 95 &&
        analytics.jobs_completed > 10 &&
        analytics.jobs_pending < 2
      ) {
        recs.push({
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleType: cycle.cycle_type,
          type: 'decrease',
          priority: 'low',
          title: t('cycles.optimizer.highEfficiency', 'Excellent Efficiency'),
          description: t(
            'cycles.optimizer.highEfficiencyDesc',
            'This cycle has excellent performance. Consider decreasing interval for proactive maintenance.'
          ),
          currentValue: cycle.cycle_type === 'running_hours'
            ? `${cycle.hours_value}h`
            : `${cycle.calendar_value} ${cycle.calendar_unit}`,
          suggestedValue: cycle.cycle_type === 'running_hours'
            ? `${Math.round((cycle.hours_value || 0) * 0.85)}h`
            : `${Math.round((cycle.calendar_value || 0) * 0.85)} ${cycle.calendar_unit}`,
          reason: t(
            'cycles.optimizer.highEfficiencyReason',
            '{{score}}% effectiveness with {{completed}} completed jobs',
            { score: analytics.effectiveness_score, completed: analytics.jobs_completed }
          ),
          impact: t(
            'cycles.optimizer.highEfficiencyImpact',
            'More frequent checks may catch issues earlier'
          ),
        });
      }

      // Unused cycle
      if (analytics.total_linked_items === 0) {
        recs.push({
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleType: cycle.cycle_type,
          type: 'info',
          priority: 'low',
          title: t('cycles.optimizer.unusedCycle', 'Unused Cycle'),
          description: t(
            'cycles.optimizer.unusedCycleDesc',
            'This cycle has no linked items. Consider linking to templates or deleting if not needed.'
          ),
          reason: t('cycles.optimizer.unusedCycleReason', 'No templates, jobs, or equipment linked'),
          impact: t('cycles.optimizer.unusedCycleImpact', 'May be obsolete or needs configuration'),
        });
      }

      // Long average completion time
      if (analytics.avg_completion_time_hours !== null && analytics.avg_completion_time_hours > 24) {
        recs.push({
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleType: cycle.cycle_type,
          type: 'warning',
          priority: 'medium',
          title: t('cycles.optimizer.longCompletion', 'Long Completion Time'),
          description: t(
            'cycles.optimizer.longCompletionDesc',
            'Jobs for this cycle take a long time to complete. Review workload or process.'
          ),
          currentValue: `${analytics.avg_completion_time_hours.toFixed(1)}h avg`,
          reason: t(
            'cycles.optimizer.longCompletionReason',
            'Average completion time exceeds 24 hours'
          ),
          impact: t(
            'cycles.optimizer.longCompletionImpact',
            'May indicate resource constraints or complex procedures'
          ),
        });
      }
    });

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recs;
  }, [cyclesData, analyticsDataMap, t]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      case 'low': return 'blue';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'increase':
        return <RiseOutlined style={{ color: '#fa8c16' }} />;
      case 'decrease':
        return <FallOutlined style={{ color: '#52c41a' }} />;
      case 'warning':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'info':
        return <BulbOutlined style={{ color: '#1677ff' }} />;
      case 'new':
        return <ThunderboltOutlined style={{ color: '#722ed1' }} />;
      default:
        return <SettingOutlined />;
    }
  };

  const highPriorityCount = recommendations.filter(r => r.priority === 'high').length;
  const mediumPriorityCount = recommendations.filter(r => r.priority === 'medium').length;

  const isLoadingAll = isLoading || analyticsLoading;

  const cardTitle = (
    <Space>
      <RobotOutlined />
      <span>{t('cycles.optimizer.title', 'Cycle Optimizer')}</span>
      {recommendations.length > 0 && (
        <Badge
          count={recommendations.length}
          style={{ backgroundColor: highPriorityCount > 0 ? '#ff4d4f' : mediumPriorityCount > 0 ? '#faad14' : '#1890ff' }}
        />
      )}
    </Space>
  );

  const cardExtra = (
    <Space>
      <Tooltip title={t('common.refresh', 'Refresh')}>
        <Button
          type="text"
          icon={<ReloadOutlined spin={isLoadingAll} />}
          onClick={(e) => {
            e.stopPropagation();
            refetch();
          }}
          size="small"
        />
      </Tooltip>
    </Space>
  );

  const content = (
    <>
      {isLoadingAll ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">{t('cycles.optimizer.analyzing', 'Analyzing maintenance cycles...')}</Text>
          </div>
        </div>
      ) : isError ? (
        <Alert
          type="error"
          message={t('cycles.optimizer.loadError', 'Failed to load cycle data')}
          description={(error as any)?.message}
          showIcon
        />
      ) : recommendations.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={4}>
              <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
              <Text strong style={{ color: '#52c41a' }}>
                {t('cycles.optimizer.allOptimal', 'All Cycles Optimized')}
              </Text>
              <Text type="secondary">
                {t('cycles.optimizer.allOptimalDesc', 'Your maintenance cycles are performing well. No recommendations at this time.')}
              </Text>
            </Space>
          }
        />
      ) : (
        <>
          {/* Summary */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small" style={{ background: '#fff2f0', borderColor: '#ffccc7' }}>
                <Statistic
                  title={<Text type="danger">{t('cycles.optimizer.highPriority', 'High Priority')}</Text>}
                  value={highPriorityCount}
                  valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
                  prefix={<ExclamationCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                <Statistic
                  title={<Text style={{ color: '#fa8c16' }}>{t('cycles.optimizer.mediumPriority', 'Medium Priority')}</Text>}
                  value={mediumPriorityCount}
                  valueStyle={{ color: '#fa8c16', fontSize: 24 }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
                <Statistic
                  title={<Text style={{ color: '#1890ff' }}>{t('cycles.optimizer.totalRecs', 'Total')}</Text>}
                  value={recommendations.length}
                  valueStyle={{ color: '#1890ff', fontSize: 24 }}
                  prefix={<BulbOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* Recommendations List */}
          <List
            size="small"
            dataSource={recommendations}
            renderItem={(rec) => (
              <List.Item
                style={{
                  cursor: onViewCycle ? 'pointer' : 'default',
                  background: rec.priority === 'high' ? '#fff1f0' :
                              rec.priority === 'medium' ? '#fffbe6' : undefined,
                  borderRadius: 4,
                  marginBottom: 8,
                  padding: '12px 16px',
                }}
                onClick={() => onViewCycle?.(rec.cycleId)}
              >
                <List.Item.Meta
                  avatar={getTypeIcon(rec.type)}
                  title={
                    <Space wrap>
                      <Text strong>{rec.cycleName}</Text>
                      <Tag color={getPriorityColor(rec.priority)}>
                        {rec.priority.toUpperCase()}
                      </Tag>
                      <Tag color={rec.cycleType === 'running_hours' ? 'orange' : 'green'}>
                        {rec.cycleType === 'running_hours' ? (
                          <><ClockCircleOutlined /> Hours</>
                        ) : (
                          <><CalendarOutlined /> Calendar</>
                        )}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Text>{rec.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{rec.description}</Text>
                      {rec.currentValue && rec.suggestedValue && (
                        <Space>
                          <Tag>{rec.currentValue}</Tag>
                          <span>→</span>
                          <Tag color="green">{rec.suggestedValue}</Tag>
                        </Space>
                      )}
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <BulbOutlined /> {rec.impact}
                      </Text>
                    </Space>
                  }
                />
                {onViewCycle && (
                  <Button type="link" size="small">
                    {t('common.view', 'View')} →
                  </Button>
                )}
              </List.Item>
            )}
          />
        </>
      )}
    </>
  );

  return (
    <Card
      title={cardTitle}
      extra={cardExtra}
      size="small"
      style={{ marginBottom: 16 }}
    >
      {content}
    </Card>
  );
}
