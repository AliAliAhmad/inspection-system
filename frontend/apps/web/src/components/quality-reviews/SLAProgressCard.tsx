import { Card, Progress, Typography, Space, Tag, List, Avatar, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qualityReviewsApi } from '@inspection/shared';

const { Title, Text } = Typography;

interface SLAReviewerStats {
  reviewer_id: number;
  reviewer_name: string;
  on_time: number;
  breached: number;
  avg_response_time: number;
}

interface SLAProgressCardProps {
  period?: 'week' | 'month' | 'year';
  showReviewerBreakdown?: boolean;
}

export function SLAProgressCard({ period = 'week', showReviewerBreakdown = true }: SLAProgressCardProps) {
  const { t } = useTranslation();

  const { data: slaReport, isLoading } = useQuery({
    queryKey: ['qc-sla-report', period],
    queryFn: () => qualityReviewsApi.getSLAReport?.(period).then((r) => r.data?.data),
    enabled: !!qualityReviewsApi.getSLAReport,
    staleTime: 60000,
  });

  // Mock data if API not available
  const mockReport: {
    on_time_count: number;
    breached_count: number;
    avg_response_time_hours: number;
    by_reviewer: SLAReviewerStats[];
  } = {
    on_time_count: 42,
    breached_count: 3,
    avg_response_time_hours: 1.8,
    by_reviewer: [
      { reviewer_id: 1, reviewer_name: 'Ahmed Ali', on_time: 15, breached: 1, avg_response_time: 1.5 },
      { reviewer_id: 2, reviewer_name: 'Omar Hassan', on_time: 12, breached: 0, avg_response_time: 1.2 },
      { reviewer_id: 3, reviewer_name: 'Khalid Mohammed', on_time: 15, breached: 2, avg_response_time: 2.8 },
    ],
  };

  const data = slaReport || mockReport;

  // Ensure by_reviewer has avg_response_time
  const reviewerData: SLAReviewerStats[] = (data.by_reviewer || []).map((r: any) => ({
    reviewer_id: r.reviewer_id,
    reviewer_name: r.reviewer_name,
    on_time: r.on_time,
    breached: r.breached,
    avg_response_time: r.avg_response_time || 0,
  }));
  const totalReviews = data.on_time_count + data.breached_count;
  const complianceRate = totalReviews > 0 ? (data.on_time_count / totalReviews) * 100 : 100;

  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return '#52c41a';
    if (rate >= 70) return '#faad14';
    return '#f5222d';
  };

  return (
    <Card loading={isLoading}>
      <Title level={5}>
        <Space>
          <ClockCircleOutlined />
          {t('qc.sla_progress', 'SLA Progress')}
        </Space>
      </Title>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Progress
          type="dashboard"
          percent={Math.round(complianceRate)}
          strokeColor={getComplianceColor(complianceRate)}
          format={(percent) => (
            <div>
              <div style={{ fontSize: 24, fontWeight: 'bold' }}>{percent}%</div>
              <div style={{ fontSize: 12, color: '#999' }}>{t('qc.compliance', 'Compliance')}</div>
            </div>
          )}
        />
      </div>

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text>{t('qc.on_time', 'On Time')}</Text>
          </Space>
          <Text strong style={{ color: '#52c41a' }}>{data.on_time_count}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Space>
            <WarningOutlined style={{ color: '#f5222d' }} />
            <Text>{t('qc.breached', 'Breached')}</Text>
          </Space>
          <Text strong style={{ color: '#f5222d' }}>{data.breached_count}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Space>
            <ClockCircleOutlined style={{ color: '#1890ff' }} />
            <Text>{t('qc.avg_response', 'Avg Response')}</Text>
          </Space>
          <Text strong>{data.avg_response_time_hours.toFixed(1)}h</Text>
        </div>
      </Space>

      {showReviewerBreakdown && reviewerData && reviewerData.length > 0 && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
            {t('qc.by_reviewer', 'By Reviewer')}
          </Title>
          <List
            dataSource={reviewerData}
            renderItem={(reviewer: SLAReviewerStats) => {
              const reviewerTotal = reviewer.on_time + reviewer.breached;
              const reviewerRate = reviewerTotal > 0 ? (reviewer.on_time / reviewerTotal) * 100 : 100;
              return (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} />}
                    title={reviewer.reviewer_name}
                    description={
                      <Space size="small">
                        <Tag color="green">{reviewer.on_time} on-time</Tag>
                        {reviewer.breached > 0 && <Tag color="red">{reviewer.breached} breached</Tag>}
                        <Text type="secondary">{reviewer.avg_response_time.toFixed(1)}h avg</Text>
                      </Space>
                    }
                  />
                  <Tooltip title={`${Math.round(reviewerRate)}% compliance`}>
                    <Progress
                      type="circle"
                      percent={Math.round(reviewerRate)}
                      width={40}
                      strokeColor={getComplianceColor(reviewerRate)}
                      format={(p) => `${p}%`}
                    />
                  </Tooltip>
                </List.Item>
              );
            }}
          />
        </>
      )}
    </Card>
  );
}

export default SLAProgressCard;
