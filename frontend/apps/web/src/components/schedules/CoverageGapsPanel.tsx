import { Card, Typography, Space, Spin, Empty, List, Tag, Button, Select } from 'antd';
import { WarningOutlined, CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi, type CoverageGap } from '@inspection/shared';

const { Title, Text } = Typography;

export interface CoverageGapsPanelProps {
  compact?: boolean;
}

const SEVERITY_CONFIG = {
  critical: {
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    borderColor: '#ffccc7',
    tagColor: 'error',
  },
  high: {
    color: '#fa8c16',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    tagColor: 'warning',
  },
  medium: {
    color: '#faad14',
    bgColor: '#fffbe6',
    borderColor: '#ffe58f',
    tagColor: 'gold',
  },
  low: {
    color: '#1677ff',
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
    tagColor: 'processing',
  },
};

export function CoverageGapsPanel({ compact = false }: CoverageGapsPanelProps) {
  const { t } = useTranslation();
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'coverage-gaps', severityFilter],
    queryFn: () => scheduleAIApi.getCoverageGaps(severityFilter || undefined),
  });

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Empty description={t('schedules.ai.coverageGapsError', 'Failed to load coverage gaps')} />
      </Card>
    );
  }

  const gaps = data?.gaps || [];
  const totalGaps = data?.total_gaps || 0;
  const criticalGaps = data?.critical_gaps || 0;

  if (gaps.length === 0) {
    return (
      <Card
        title={
          <Space>
            <WarningOutlined style={{ color: '#52c41a' }} />
            {t('schedules.ai.coverageGaps', 'Coverage Gaps')}
          </Space>
        }
      >
        <Empty
          description={t('schedules.ai.noCoverageGaps', 'No coverage gaps detected')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // Compact view: show only critical gaps
  if (compact) {
    const criticalGapsList = gaps.filter((g) => g.severity === 'critical').slice(0, 3);

    if (criticalGapsList.length === 0) {
      return null;
    }

    return (
      <Card
        size="small"
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text strong>{t('schedules.ai.criticalGaps', 'Critical Coverage Gaps')}</Text>
            <Tag color="error">{criticalGapsList.length}</Tag>
          </Space>
        }
      >
        <List
          size="small"
          dataSource={criticalGapsList}
          renderItem={(gap) => (
            <List.Item>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Tag color="error">{gap.severity.toUpperCase()}</Tag>
                  <Text strong>{gap.equipment_name}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <EnvironmentOutlined /> {gap.location} | {gap.days_overdue} days overdue
                </Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>
    );
  }

  // Full view
  return (
    <Card
      title={
        <Space>
          <WarningOutlined style={{ color: criticalGaps > 0 ? '#ff4d4f' : '#faad14' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('schedules.ai.coverageGaps', 'Coverage Gaps')}
          </Title>
          <Tag color={criticalGaps > 0 ? 'error' : 'warning'}>
            {totalGaps} {t('schedules.ai.gaps', 'Gaps')}
          </Tag>
          {criticalGaps > 0 && <Tag color="error">{criticalGaps} Critical</Tag>}
        </Space>
      }
      extra={
        <Select
          value={severityFilter}
          onChange={setSeverityFilter}
          style={{ width: 120 }}
          size="small"
          options={[
            { label: t('schedules.ai.allSeverities', 'All'), value: '' },
            { label: t('schedules.ai.critical', 'Critical'), value: 'critical' },
            { label: t('schedules.ai.high', 'High'), value: 'high' },
            { label: t('schedules.ai.medium', 'Medium'), value: 'medium' },
            { label: t('schedules.ai.low', 'Low'), value: 'low' },
          ]}
        />
      }
    >
      <List
        dataSource={gaps}
        renderItem={(gap) => {
          const config = SEVERITY_CONFIG[gap.severity as keyof typeof SEVERITY_CONFIG];
          return (
            <List.Item
              style={{
                padding: '12px 16px',
                backgroundColor: config.bgColor,
                borderRadius: 8,
                marginBottom: 8,
                border: `1px solid ${config.borderColor}`,
              }}
              actions={[
                <Button type="primary" size="small" key="schedule">
                  {t('schedules.ai.scheduleNow', 'Schedule Now')}
                </Button>,
              ]}
            >
              <div style={{ width: '100%' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Space>
                    <Tag color={config.tagColor}>{gap.severity.toUpperCase()}</Tag>
                    <Text strong style={{ fontSize: 14 }}>
                      {gap.equipment_name}
                    </Text>
                  </Space>
                  <Tag color="red" style={{ fontSize: 12 }}>
                    {gap.days_overdue} {t('schedules.ai.daysOverdue', 'days overdue')}
                  </Tag>
                </div>

                <Space size="large" style={{ fontSize: 12 }}>
                  <Text type="secondary">
                    <EnvironmentOutlined /> {gap.location}
                  </Text>
                  {gap.last_inspection_date && (
                    <Text type="secondary">
                      <CalendarOutlined /> Last:{' '}
                      {new Date(gap.last_inspection_date).toLocaleDateString()}
                    </Text>
                  )}
                  <Text type="secondary">
                    Priority: <strong>{gap.recommended_priority}</strong>
                  </Text>
                  <Text type="secondary">
                    Risk: <strong>{(gap.estimated_risk * 100).toFixed(0)}%</strong>
                  </Text>
                </Space>
              </div>
            </List.Item>
          );
        }}
        pagination={{ pageSize: 10, size: 'small' }}
      />
    </Card>
  );
}

export default CoverageGapsPanel;
