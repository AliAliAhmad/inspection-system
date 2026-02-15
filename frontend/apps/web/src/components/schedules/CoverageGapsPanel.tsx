import React from 'react';
import {
  Card,
  List,
  Tag,
  Typography,
  Spin,
  Empty,
  Space,
  Progress,
  Button,
  Tooltip,
  Badge,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import type { CoverageGap } from '@inspection/shared';
import {
  ExclamationCircleOutlined,
  CalendarOutlined,
  ToolOutlined,
  RightOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#cf1322';
    case 'high':
      return '#fa541c';
    case 'medium':
      return '#faad14';
    case 'low':
      return '#52c41a';
    default:
      return '#8c8c8c';
  }
};

const getSeverityTag = (severity: string) => {
  const colors: Record<string, string> = {
    critical: 'red',
    high: 'volcano',
    medium: 'orange',
    low: 'green',
  };
  return <Tag color={colors[severity] || 'default'}>{severity.toUpperCase()}</Tag>;
};

interface CoverageGapsPanelProps {
  onScheduleInspection?: (equipmentId: number) => void;
  maxItems?: number;
}

export const CoverageGapsPanel: React.FC<CoverageGapsPanelProps> = ({
  onScheduleInspection,
  maxItems = 10,
}) => {
  const {
    data: coverageData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-ai', 'coverage-gaps'],
    queryFn: () => scheduleAIApi.getCoverageGaps(),
  });

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <ExclamationCircleOutlined />
            <span>Coverage Gaps</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Analyzing coverage gaps...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        title={
          <Space>
            <ExclamationCircleOutlined />
            <span>Coverage Gaps</span>
          </Space>
        }
      >
        <Empty
          description="Failed to load coverage gaps"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const gaps: CoverageGap[] = (coverageData?.gaps || []).slice(0, maxItems);
  const totalGaps = coverageData?.total_gaps || 0;
  const criticalGaps = coverageData?.critical_gaps || 0;

  return (
    <Card
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: criticalGaps > 0 ? '#cf1322' : '#faad14' }} />
          <span>Coverage Gaps</span>
          <Badge
            count={totalGaps}
            style={{ backgroundColor: criticalGaps > 0 ? '#cf1322' : '#faad14' }}
          />
        </Space>
      }
      extra={
        criticalGaps > 0 && (
          <Tag color="red">{criticalGaps} Critical</Tag>
        )
      }
    >
      {gaps.length === 0 ? (
        <Empty
          description="No coverage gaps detected"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={gaps}
          renderItem={(gap: CoverageGap) => (
            <List.Item
              key={gap.equipment_id}
              actions={[
                onScheduleInspection && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onScheduleInspection(gap.equipment_id)}
                    icon={<RightOutlined />}
                  >
                    Schedule
                  </Button>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={
                  <Tooltip title={`Risk Score: ${gap.estimated_risk}`}>
                    <Progress
                      type="circle"
                      percent={gap.estimated_risk}
                      width={50}
                      strokeColor={getSeverityColor(gap.severity)}
                      format={(percent) => percent}
                    />
                  </Tooltip>
                }
                title={
                  <Space>
                    <ToolOutlined />
                    <Text strong>{gap.equipment_name}</Text>
                    {getSeverityTag(gap.severity)}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Space>
                      <EnvironmentOutlined />
                      <Text type="secondary">{gap.location}</Text>
                    </Space>
                    <Space>
                      <CalendarOutlined />
                      <Text type="secondary">
                        {gap.last_inspection_date
                          ? `Last inspected: ${new Date(gap.last_inspection_date).toLocaleDateString()}`
                          : 'Never inspected'}
                      </Text>
                    </Space>
                    <Text type="danger">
                      {gap.days_overdue} days overdue
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Priority: {gap.recommended_priority}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
      {totalGaps > maxItems && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">
            Showing {maxItems} of {totalGaps} gaps
          </Text>
        </div>
      )}
    </Card>
  );
};
