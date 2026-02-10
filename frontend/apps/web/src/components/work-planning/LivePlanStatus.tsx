import React from 'react';
import { Card, Progress, Statistic, Row, Col, List, Tag, Spin, Space } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SyncOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';

interface LivePlanStatusProps {
  planId: number;
  compact?: boolean;
}

export const LivePlanStatus: React.FC<LivePlanStatusProps> = ({ planId, compact = false }) => {
  const { t } = useTranslation();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['plan-live-status', planId],
    queryFn: () => workPlansApi.getLiveStatus(planId),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const status = data?.data?.summary;

  const getCompletionColor = (rate: number) => {
    if (rate >= 90) return '#52c41a';
    if (rate >= 70) return '#faad14';
    return '#ff4d4f';
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <RocketOutlined />
            {t('workPlan.liveStatus')}
          </Space>
        }
        extra={
          <SyncOutlined
            spin={isLoading}
            onClick={() => refetch()}
            style={{ cursor: 'pointer' }}
          />
        }
      >
        <div style={{ textAlign: 'center' }}>
          <Progress
            type="circle"
            percent={status?.completion_rate || 0}
            strokeColor={getCompletionColor(status?.completion_rate || 0)}
            size={80}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-around' }}>
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a' }} /> {status?.on_track_jobs || 0}
            </span>
            <span>
              <ClockCircleOutlined style={{ color: '#faad14' }} /> {status?.delayed_jobs || 0}
            </span>
            <span>
              <WarningOutlined style={{ color: '#ff4d4f' }} /> {status?.at_risk_jobs || 0}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RocketOutlined />
          {t('workPlan.liveStatus')}
        </Space>
      }
      extra={
        <Space>
          <Tag color="blue">
            <SyncOutlined spin /> {t('workPlan.autoRefresh')}
          </Tag>
          <SyncOutlined
            onClick={() => refetch()}
            style={{ cursor: 'pointer' }}
          />
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={status?.completion_rate || 0}
              strokeColor={getCompletionColor(status?.completion_rate || 0)}
              format={(percent) => (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 600 }}>{percent}%</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{t('workPlan.complete')}</div>
                </div>
              )}
            />
          </div>
        </Col>
        <Col span={16}>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Statistic
                title={
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    {t('workPlan.onTrack')}
                  </Space>
                }
                value={status?.on_track_jobs || 0}
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title={
                  <Space>
                    <ClockCircleOutlined style={{ color: '#faad14' }} />
                    {t('workPlan.delayed')}
                  </Space>
                }
                value={status?.delayed_jobs || 0}
                valueStyle={{ color: '#faad14' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title={
                  <Space>
                    <WarningOutlined style={{ color: '#ff4d4f' }} />
                    {t('workPlan.atRisk')}
                  </Space>
                }
                value={status?.at_risk_jobs || 0}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Col>
          </Row>

          {status?.estimated_completion_time && (
            <div style={{ marginTop: 16 }}>
              <Tag color="blue">
                {t('workPlan.estimatedCompletion')}: {status.estimated_completion_time}
              </Tag>
            </div>
          )}
        </Col>
      </Row>

      {status?.recommendations && status.recommendations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            {t('workPlan.recommendations')}
          </div>
          <List
            size="small"
            dataSource={status.recommendations}
            renderItem={(rec: string, index: number) => (
              <List.Item>
                <Tag color="blue">{index + 1}</Tag>
                {rec}
              </List.Item>
            )}
          />
        </div>
      )}
    </Card>
  );
};

export default LivePlanStatus;
