import { Card, Table, Progress, Tag, Typography, Spin, Alert } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ArrowRightOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi } from '@inspection/shared';
import type { InspectorScore } from '@inspection/shared';

const { Text } = Typography;

export function InspectorScoreboardCard() {
  const { t } = useTranslation();

  const { data: scores, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'inspector-scores'],
    queryFn: async () => {
      const response = await scheduleAIApi.getInspectorScores();
      return response;
    },
    staleTime: 60000,
  });

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return '#52c41a'; // green
    if (score >= 60) return '#faad14'; // yellow
    return '#ff4d4f'; // red
  };

  const getTrendIcon = (trend: 'improving' | 'stable' | 'declining') => {
    switch (trend) {
      case 'improving':
        return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
      case 'declining':
        return <ArrowDownOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ArrowRightOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getTrendTag = (trend: 'improving' | 'stable' | 'declining') => {
    const colors = {
      improving: 'green',
      stable: 'default',
      declining: 'red',
    };
    return <Tag color={colors[trend]}>{trend}</Tag>;
  };

  const columns = [
    {
      title: t('scheduleAI.inspectorName', 'Inspector Name'),
      dataIndex: 'inspector_name',
      key: 'inspector_name',
      width: 180,
      render: (name: string, record: InspectorScore, index: number) => (
        <Text strong={index < 3}>
          {index < 3 && <TrophyOutlined style={{ color: '#faad14', marginRight: 8 }} />}
          {name}
        </Text>
      ),
    },
    {
      title: t('scheduleAI.qualityScore', 'Quality Score'),
      dataIndex: 'quality_score',
      key: 'quality_score',
      width: 200,
      sorter: (a: InspectorScore, b: InspectorScore) => b.quality_score - a.quality_score,
      defaultSortOrder: 'ascend' as const,
      render: (score: number) => (
        <div>
          <Text style={{ marginRight: 8 }}>{score.toFixed(1)}%</Text>
          <Progress
            percent={score}
            strokeColor={getPerformanceColor(score)}
            size="small"
            showInfo={false}
            style={{ width: 100 }}
          />
        </div>
      ),
    },
    {
      title: t('scheduleAI.completionRate', 'Completion Rate'),
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      width: 120,
      render: (rate: number) => (
        <Text style={{ color: getPerformanceColor(rate) }}>
          {rate.toFixed(1)}%
        </Text>
      ),
    },
    {
      title: t('scheduleAI.trend', 'Trend'),
      dataIndex: 'trend',
      key: 'trend',
      width: 120,
      filters: [
        { text: 'Improving', value: 'improving' },
        { text: 'Stable', value: 'stable' },
        { text: 'Declining', value: 'declining' },
      ],
      onFilter: (value: any, record: InspectorScore) => record.trend === value,
      render: (trend: 'improving' | 'stable' | 'declining') => (
        <span>
          {getTrendIcon(trend)} {getTrendTag(trend)}
        </span>
      ),
    },
    {
      title: t('scheduleAI.defectDetectionRate', 'Defect Detection'),
      dataIndex: 'defect_detection_rate',
      key: 'defect_detection_rate',
      width: 140,
      render: (rate: number) => (
        <Tag color={rate >= 15 ? 'green' : rate >= 10 ? 'orange' : 'default'}>
          {rate.toFixed(1)}%
        </Tag>
      ),
    },
  ];

  if (error) {
    return (
      <Card title={t('scheduleAI.inspectorScoreboard', 'Inspector Scoreboard')}>
        <Alert
          type="error"
          message={t('common.error', 'Error')}
          description={t('scheduleAI.failedToLoadScores', 'Failed to load inspector scores')}
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <span>
          <TrophyOutlined style={{ marginRight: 8 }} />
          {t('scheduleAI.inspectorScoreboard', 'Inspector Scoreboard')}
        </span>
      }
    >
      <Table
        columns={columns}
        dataSource={scores || []}
        rowKey="inspector_id"
        loading={isLoading}
        pagination={{ pageSize: 10 }}
        size="small"
        expandable={{
          expandedRowRender: (record: InspectorScore) => (
            <div style={{ padding: '8px 16px' }}>
              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ color: '#52c41a' }}>
                  {t('scheduleAI.strengths', 'Strengths')}:{' '}
                </Text>
                <Text>{record.strengths.join(', ') || t('common.none', 'None')}</Text>
              </div>
              <div>
                <Text strong style={{ color: '#faad14' }}>
                  {t('scheduleAI.areasForImprovement', 'Areas for Improvement')}:{' '}
                </Text>
                <Text>
                  {record.areas_for_improvement.join(', ') || t('common.none', 'None')}
                </Text>
              </div>
            </div>
          ),
        }}
      />
    </Card>
  );
}
