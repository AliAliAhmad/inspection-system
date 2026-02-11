import { Card, Typography, Space, Tag, List, Empty, Spin, Collapse, Tooltip, Button } from 'antd';
import {
  BulbOutlined,
  WarningOutlined,
  RiseOutlined,
  AreaChartOutlined,
  TeamOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph, Title } = Typography;

export interface OverduePattern {
  id: string;
  type: 'recurring' | 'seasonal' | 'equipment' | 'personnel' | 'workload';
  title: string;
  description: string;
  frequency: string;
  affected_areas: string[];
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
  confidence: number;
}

interface OverduePatternCardProps {
  patterns?: OverduePattern[];
  isLoading?: boolean;
  onPatternClick?: (pattern: OverduePattern) => void;
  compact?: boolean;
}

const PATTERN_TYPE_CONFIG = {
  recurring: {
    icon: <ClockCircleOutlined />,
    color: '#1890ff',
    label: 'Recurring Pattern',
  },
  seasonal: {
    icon: <AreaChartOutlined />,
    color: '#52c41a',
    label: 'Seasonal Pattern',
  },
  equipment: {
    icon: <ToolOutlined />,
    color: '#fa8c16',
    label: 'Equipment Related',
  },
  personnel: {
    icon: <TeamOutlined />,
    color: '#722ed1',
    label: 'Personnel Related',
  },
  workload: {
    icon: <RiseOutlined />,
    color: '#eb2f96',
    label: 'Workload Pattern',
  },
};

const SEVERITY_CONFIG = {
  low: { color: 'green', label: 'Low Impact' },
  medium: { color: 'orange', label: 'Medium Impact' },
  high: { color: 'red', label: 'High Impact' },
};

export function OverduePatternCard({
  patterns,
  isLoading = false,
  onPatternClick,
  compact = false,
}: OverduePatternCardProps) {
  const { t } = useTranslation();

  // Use provided patterns or fetch from API
  const { data: patternsData, isLoading: dataLoading } = useQuery({
    queryKey: ['overdue', 'patterns'],
    queryFn: async () => {
      // This would call the AI patterns API endpoint
      // For now, return mock data
      const mockPatterns: OverduePattern[] = [
        {
          id: '1',
          type: 'recurring',
          title: 'Monthly Inspection Delays',
          description:
            'Monthly safety inspections are consistently delayed by 5-7 days at the end of each month.',
          frequency: 'Monthly',
          affected_areas: ['Safety Inspections', 'Crane Department'],
          severity: 'medium',
          recommendation:
            'Consider scheduling monthly inspections in the first week to account for end-of-month workload.',
          confidence: 0.85,
        },
        {
          id: '2',
          type: 'equipment',
          title: 'Crane A Maintenance Backlog',
          description:
            'Crane A has accumulated 3 overdue defects in the past 2 months, suggesting chronic maintenance issues.',
          frequency: 'Bi-weekly',
          affected_areas: ['Crane A', 'Hydraulic Systems'],
          severity: 'high',
          recommendation:
            'Schedule a comprehensive maintenance review for Crane A and consider temporary reallocation of workload.',
          confidence: 0.92,
        },
        {
          id: '3',
          type: 'personnel',
          title: 'Inspector Capacity Constraint',
          description:
            'Inspector John Doe has 40% more assignments than team average, leading to delays.',
          frequency: 'Ongoing',
          affected_areas: ['John Doe', 'East Zone Inspections'],
          severity: 'medium',
          recommendation:
            'Redistribute workload to balance assignments across the inspection team.',
          confidence: 0.78,
        },
      ];

      return mockPatterns;
    },
    enabled: !patterns,
  });

  const loading = isLoading || dataLoading;
  const data = patterns || patternsData || [];

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card
        title={
          <Space>
            <RobotOutlined />
            {t('overdue.ai_patterns', 'AI-Detected Patterns')}
          </Space>
        }
      >
        <Empty description={t('overdue.no_patterns', 'No patterns detected yet')} />
      </Card>
    );
  }

  const renderPatternItem = (pattern: OverduePattern) => {
    const typeConfig = PATTERN_TYPE_CONFIG[pattern.type];
    const severityConfig = SEVERITY_CONFIG[pattern.severity];

    return (
      <div
        key={pattern.id}
        style={{
          padding: 16,
          background: '#fff',
          borderRadius: 8,
          border: `1px solid ${typeConfig.color}20`,
          marginBottom: compact ? 8 : 16,
          cursor: onPatternClick ? 'pointer' : 'default',
          transition: 'box-shadow 0.2s',
        }}
        onClick={() => onPatternClick?.(pattern)}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: `${typeConfig.color}10`,
              color: typeConfig.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 16,
            }}
          >
            {typeConfig.icon}
          </div>
          <div style={{ flex: 1 }}>
            <Space wrap style={{ marginBottom: 4 }}>
              <Tag color={typeConfig.color}>
                {t(`overdue.pattern_type_${pattern.type}`, typeConfig.label)}
              </Tag>
              <Tag color={severityConfig.color}>
                {t(`overdue.severity_${pattern.severity}`, severityConfig.label)}
              </Tag>
              <Tooltip title={t('overdue.confidence', 'AI Confidence')}>
                <Tag color="blue">
                  {Math.round(pattern.confidence * 100)}% {t('overdue.confidence_short', 'conf.')}
                </Tag>
              </Tooltip>
            </Space>
            <Text strong style={{ display: 'block', fontSize: 14 }}>
              {pattern.title}
            </Text>
          </div>
        </div>

        {/* Description */}
        {!compact && (
          <Paragraph
            type="secondary"
            style={{ margin: 0, marginBottom: 12, fontSize: 13 }}
            ellipsis={{ rows: 2 }}
          >
            {pattern.description}
          </Paragraph>
        )}

        {/* Frequency & Affected Areas */}
        <div style={{ display: 'flex', gap: 16, marginBottom: compact ? 0 : 12 }}>
          <Space size={4}>
            <ClockCircleOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {pattern.frequency}
            </Text>
          </Space>
          <Space size={4} wrap>
            {pattern.affected_areas.slice(0, 2).map((area, index) => (
              <Tag key={index} style={{ fontSize: 11, margin: 0 }}>
                {area}
              </Tag>
            ))}
            {pattern.affected_areas.length > 2 && (
              <Tooltip title={pattern.affected_areas.slice(2).join(', ')}>
                <Tag style={{ fontSize: 11, margin: 0 }}>
                  +{pattern.affected_areas.length - 2}
                </Tag>
              </Tooltip>
            )}
          </Space>
        </div>

        {/* Recommendation */}
        {!compact && (
          <div
            style={{
              padding: 12,
              backgroundColor: '#f6ffed',
              borderRadius: 6,
              borderLeft: '3px solid #52c41a',
            }}
          >
            <Space size={8} align="start">
              <ThunderboltOutlined style={{ color: '#52c41a', marginTop: 2 }} />
              <div>
                <Text strong style={{ color: '#52c41a', fontSize: 12, display: 'block' }}>
                  {t('overdue.recommendation', 'Recommendation')}
                </Text>
                <Text style={{ fontSize: 12 }}>{pattern.recommendation}</Text>
              </div>
            </Space>
          </div>
        )}
      </div>
    );
  };

  if (compact) {
    return (
      <div>
        {data.slice(0, 3).map(renderPatternItem)}
        {data.length > 3 && (
          <Button type="link" block style={{ marginTop: 8 }}>
            {t('overdue.view_all_patterns', 'View all {{count}} patterns', {
              count: data.length,
            })}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#722ed1' }} />
          {t('overdue.ai_patterns', 'AI-Detected Patterns')}
        </Space>
      }
      style={{
        background: 'linear-gradient(135deg, #f9f0ff 0%, #fff 100%)',
        borderColor: '#d3adf7',
      }}
      extra={
        <Tag color="purple">
          {data.length} {t('overdue.patterns_detected', 'patterns detected')}
        </Tag>
      }
    >
      {/* Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          marginBottom: 24,
          padding: '12px',
          backgroundColor: 'rgba(114, 46, 209, 0.05)',
          borderRadius: 8,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 20, color: '#ff4d4f' }}>
            {data.filter((p) => p.severity === 'high').length}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('overdue.high_impact', 'High Impact')}
            </Text>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 20, color: '#fa8c16' }}>
            {data.filter((p) => p.severity === 'medium').length}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('overdue.medium_impact', 'Medium Impact')}
            </Text>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 20, color: '#52c41a' }}>
            {data.filter((p) => p.severity === 'low').length}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('overdue.low_impact', 'Low Impact')}
            </Text>
          </div>
        </div>
      </div>

      {/* Patterns List */}
      {data.map(renderPatternItem)}
    </Card>
  );
}

export default OverduePatternCard;
