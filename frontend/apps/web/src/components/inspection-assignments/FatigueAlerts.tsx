import { Card, List, Badge, Tag, Typography, Spin, Alert, Empty } from 'antd';
import { WarningOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi } from '@inspection/shared';
import type { FatigueRisk } from '@inspection/shared';

const { Text, Title } = Typography;

export function FatigueAlerts() {
  const { t } = useTranslation();

  const { data: risks, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'fatigue-risks'],
    queryFn: async () => {
      const response = await scheduleAIApi.getFatigueRisks();
      return response;
    },
    staleTime: 60000,
  });

  const getRiskColor = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high':
        return '#ff4d4f';
      case 'medium':
        return '#faad14';
      case 'low':
        return '#52c41a';
      default:
        return '#d9d9d9';
    }
  };

  const getRiskBadge = (level: 'high' | 'medium' | 'low') => {
    const colors = {
      high: 'red',
      medium: 'orange',
      low: 'green',
    };
    return (
      <Tag color={colors[level]}>
        {level.toUpperCase()}
      </Tag>
    );
  };

  // Sort risks by level (high first)
  const sortedRisks = (risks || []).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.risk_level] - order[b.risk_level];
  });

  if (isLoading) {
    return (
      <Card
        title={
          <span>
            <WarningOutlined style={{ marginRight: 8 }} />
            {t('scheduleAI.fatigueAlerts', 'Fatigue Risk Alerts')}
          </span>
        }
      >
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        title={
          <span>
            <WarningOutlined style={{ marginRight: 8 }} />
            {t('scheduleAI.fatigueAlerts', 'Fatigue Risk Alerts')}
          </span>
        }
      >
        <Alert
          type="error"
          message={t('common.error', 'Error')}
          description={t('scheduleAI.failedToLoadFatigueRisks', 'Failed to load fatigue risks')}
        />
      </Card>
    );
  }

  if (sortedRisks.length === 0) {
    return (
      <Card
        title={
          <span>
            <CheckCircleOutlined style={{ marginRight: 8, color: '#52c41a' }} />
            {t('scheduleAI.fatigueAlerts', 'Fatigue Risk Alerts')}
          </span>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: '#52c41a' }}>
              {t('scheduleAI.noFatigueRisks', 'No fatigue risks detected')}
            </span>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <span>
          <WarningOutlined style={{ marginRight: 8 }} />
          {t('scheduleAI.fatigueAlerts', 'Fatigue Risk Alerts')}
        </span>
      }
      extra={
        <Badge count={sortedRisks.filter((r) => r.risk_level === 'high').length} showZero />
      }
    >
      <List
        size="small"
        dataSource={sortedRisks}
        renderItem={(risk: FatigueRisk) => (
          <List.Item>
            <List.Item.Meta
              avatar={
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: getRiskColor(risk.risk_level),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <WarningOutlined style={{ color: '#fff', fontSize: 20 }} />
                </div>
              }
              title={
                <div>
                  <Text strong>{risk.inspector_name}</Text>
                  <span style={{ marginLeft: 8 }}>{getRiskBadge(risk.risk_level)}</span>
                </div>
              }
              description={
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('scheduleAI.fatigueFactors', 'Fatigue Factors')}:
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag icon={<ClockCircleOutlined />} color="default" style={{ marginBottom: 4 }}>
                        {risk.factors.consecutive_days_worked} {t('scheduleAI.consecutiveDays', 'consecutive days')}
                      </Tag>
                      <Tag color="default" style={{ marginBottom: 4 }}>
                        {risk.factors.daily_inspection_load} {t('scheduleAI.dailyLoad', 'daily load')}
                      </Tag>
                      {risk.factors.overtime_hours > 0 && (
                        <Tag color="orange" style={{ marginBottom: 4 }}>
                          {risk.factors.overtime_hours}h {t('scheduleAI.overtime', 'overtime')}
                        </Tag>
                      )}
                    </div>
                  </div>
                  <Alert
                    type={risk.risk_level === 'high' ? 'error' : 'warning'}
                    message={risk.recommendation}
                    showIcon
                    style={{ fontSize: 12 }}
                  />
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
