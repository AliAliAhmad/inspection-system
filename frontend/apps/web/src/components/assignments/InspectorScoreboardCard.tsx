import React from 'react';
import { Card, Table, Tag, Progress, Tooltip, Empty, Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from './api';
import type { InspectorScore } from './types';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, TrophyOutlined } from '@ant-design/icons';

export const InspectorScoreboardCard: React.FC = () => {
  const { data: scores, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'inspector-scores'],
    queryFn: () => scheduleAIApi.getInspectorScores(),
  });

  const getTrendIcon = (trend: string) => {
    if (trend === 'improving') return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
    if (trend === 'declining') return <ArrowDownOutlined style={{ color: '#ff4d4f' }} />;
    return <MinusOutlined style={{ color: '#8c8c8c' }} />;
  };

  const getTrendTooltip = (trend: string) => {
    if (trend === 'improving') return 'Performance is improving';
    if (trend === 'declining') return 'Performance is declining';
    return 'Performance is stable';
  };

  const getScoreStatus = (score: number): 'success' | 'normal' | 'exception' => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'normal';
    return 'exception';
  };

  const columns = [
    {
      title: 'Rank',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: InspectorScore, index: number) => (
        <span style={{ fontWeight: index < 3 ? 'bold' : 'normal' }}>
          {index < 3 && <TrophyOutlined style={{ color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32', marginRight: 4 }} />}
          {index + 1}
        </span>
      ),
    },
    {
      title: 'Inspector',
      dataIndex: 'inspector_name',
      key: 'name',
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: 'Quality Score',
      dataIndex: 'quality_score',
      key: 'quality',
      sorter: (a: InspectorScore, b: InspectorScore) => a.quality_score - b.quality_score,
      render: (score: number) => (
        <Progress
          percent={score}
          size="small"
          status={getScoreStatus(score)}
          format={(percent) => `${percent}%`}
        />
      ),
    },
    {
      title: 'Completion',
      dataIndex: 'completion_rate',
      key: 'completion',
      sorter: (a: InspectorScore, b: InspectorScore) => a.completion_rate - b.completion_rate,
      render: (rate: number) => (
        <Tooltip title={`${rate.toFixed(1)}% of assigned inspections completed on time`}>
          <span style={{ color: rate >= 90 ? '#52c41a' : rate >= 70 ? '#faad14' : '#ff4d4f' }}>
            {rate.toFixed(1)}%
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Trend',
      dataIndex: 'trend',
      key: 'trend',
      width: 80,
      render: (trend: string) => (
        <Tooltip title={getTrendTooltip(trend)}>
          {getTrendIcon(trend)}
        </Tooltip>
      ),
    },
    {
      title: 'Strengths',
      dataIndex: 'strengths',
      key: 'strengths',
      render: (strengths: string[]) => (
        <>
          {strengths?.slice(0, 2).map((s, i) => (
            <Tag key={i} color="green">{s}</Tag>
          ))}
          {strengths && strengths.length > 2 && (
            <Tooltip title={strengths.slice(2).join(', ')}>
              <Tag>+{strengths.length - 2}</Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      title: 'Areas to Improve',
      dataIndex: 'areas_to_improve',
      key: 'areas_to_improve',
      render: (areas: string[]) => (
        <>
          {areas?.slice(0, 1).map((a, i) => (
            <Tag key={i} color="orange">{a}</Tag>
          ))}
          {areas && areas.length > 1 && (
            <Tooltip title={areas.slice(1).join(', ')}>
              <Tag color="orange">+{areas.length - 1}</Tag>
            </Tooltip>
          )}
        </>
      ),
    },
  ];

  if (error) {
    return (
      <Card title="Inspector Scoreboard">
        <Alert
          message="Failed to load inspector scores"
          description="Please try refreshing the page."
          type="error"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <span>
          <TrophyOutlined style={{ marginRight: 8, color: '#faad14' }} />
          Inspector Scoreboard
        </span>
      }
      loading={isLoading}
    >
      {scores && scores.length > 0 ? (
        <Table
          dataSource={scores}
          columns={columns}
          rowKey="inspector_id"
          pagination={{ pageSize: 5, showSizeChanger: true, showTotal: (total) => `Total ${total} inspectors` }}
          size="small"
          scroll={{ x: 800 }}
        />
      ) : (
        <Empty description="No inspector scores available" />
      )}
    </Card>
  );
};
