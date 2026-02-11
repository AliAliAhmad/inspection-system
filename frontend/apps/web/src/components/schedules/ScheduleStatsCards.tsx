import { Row, Col, Card, Statistic, Spin, Alert, Tag } from 'antd';
import {
  CalendarOutlined,
  RiseOutlined,
  FallOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi } from '@inspection/shared';

export function ScheduleStatsCards() {
  const { t } = useTranslation();

  const { data: riskData, isLoading: riskLoading } = useQuery({
    queryKey: ['schedule-ai', 'risk-scores'],
    queryFn: () => scheduleAIApi.getRiskScores(),
  });

  const { data: coverageData, isLoading: coverageLoading } = useQuery({
    queryKey: ['schedule-ai', 'coverage-gaps'],
    queryFn: () => scheduleAIApi.getCoverageGaps(),
  });

  const { data: slaData, isLoading: slaLoading } = useQuery({
    queryKey: ['schedule-ai', 'sla-warnings', 7],
    queryFn: () => scheduleAIApi.getSLAWarnings(7),
  });

  const isLoading = riskLoading || coverageLoading || slaLoading;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  const totalEquipment = riskData?.summary?.total_equipment || 0;
  const averageRisk = riskData?.summary?.average_risk_score || 0;
  const criticalCount = riskData?.summary?.critical_count || 0;
  const totalGaps = coverageData?.total_gaps || 0;
  const criticalGaps = coverageData?.critical_gaps || 0;
  const upcomingSLARisks = slaData?.length || 0;

  // Calculate coverage rate (equipment covered / total equipment)
  const coverageRate = totalEquipment > 0 ? ((totalEquipment - totalGaps) / totalEquipment) * 100 : 100;

  // Determine risk level color
  const getRiskColor = (score: number) => {
    if (score >= 0.75) return '#ff4d4f';
    if (score >= 0.5) return '#fa8c16';
    if (score >= 0.25) return '#faad14';
    return '#52c41a';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 0.75) return 'Critical';
    if (score >= 0.5) return 'High';
    if (score >= 0.25) return 'Medium';
    return 'Low';
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} md={6}>
        <Card size="small" style={{ backgroundColor: '#e6f7ff', borderColor: '#91d5ff' }}>
          <Statistic
            title={
              <>
                <CalendarOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                {t('schedules.ai.totalEquipment', 'Total Equipment Scheduled')}
              </>
            }
            value={totalEquipment}
            valueStyle={{ color: '#1677ff' }}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card
          size="small"
          style={{
            backgroundColor: coverageRate >= 95 ? '#f6ffed' : '#fffbe6',
            borderColor: coverageRate >= 95 ? '#b7eb8f' : '#ffe58f',
          }}
        >
          <Statistic
            title={
              <>
                <CheckCircleOutlined
                  style={{
                    marginRight: 8,
                    color: coverageRate >= 95 ? '#52c41a' : '#faad14',
                  }}
                />
                {t('schedules.ai.coverageRate', 'Coverage Rate')}
              </>
            }
            value={coverageRate.toFixed(1)}
            suffix="%"
            valueStyle={{
              color: coverageRate >= 95 ? '#52c41a' : '#faad14',
            }}
            prefix={
              coverageRate >= 95 ? (
                <RiseOutlined style={{ fontSize: 14 }} />
              ) : (
                <FallOutlined style={{ fontSize: 14 }} />
              )
            }
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card
          size="small"
          style={{
            backgroundColor:
              averageRisk >= 0.75 ? '#fff2f0' : averageRisk >= 0.5 ? '#fff7e6' : '#f6ffed',
            borderColor:
              averageRisk >= 0.75 ? '#ffccc7' : averageRisk >= 0.5 ? '#ffd591' : '#b7eb8f',
          }}
        >
          <Statistic
            title={t('schedules.ai.avgRiskScore', 'Average Risk Score')}
            value={(averageRisk * 100).toFixed(0)}
            suffix={
              <Tag
                color={
                  averageRisk >= 0.75
                    ? 'error'
                    : averageRisk >= 0.5
                    ? 'warning'
                    : 'success'
                }
                style={{ marginLeft: 8 }}
              >
                {getRiskLevel(averageRisk)}
              </Tag>
            }
            valueStyle={{
              color: getRiskColor(averageRisk),
            }}
          />
          {criticalCount > 0 && (
            <div style={{ marginTop: 8 }}>
              <Tag color="error">{criticalCount} Critical</Tag>
            </div>
          )}
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card
          size="small"
          style={{
            backgroundColor: upcomingSLARisks > 0 ? '#fff2f0' : '#f6ffed',
            borderColor: upcomingSLARisks > 0 ? '#ffccc7' : '#b7eb8f',
          }}
        >
          <Statistic
            title={
              <>
                <WarningOutlined
                  style={{
                    marginRight: 8,
                    color: upcomingSLARisks > 0 ? '#ff4d4f' : '#52c41a',
                  }}
                />
                {t('schedules.ai.upcomingSLARisks', 'Upcoming SLA Risks')}
              </>
            }
            value={upcomingSLARisks}
            valueStyle={{
              color: upcomingSLARisks > 0 ? '#ff4d4f' : '#52c41a',
            }}
            suffix={
              upcomingSLARisks > 0 && (
                <Tag color="error" style={{ marginLeft: 8 }}>
                  {t('schedules.ai.next7Days', 'Next 7 Days')}
                </Tag>
              )
            }
          />
          {criticalGaps > 0 && (
            <div style={{ marginTop: 8 }}>
              <Tag color="error">{criticalGaps} Critical Gaps</Tag>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}

export default ScheduleStatsCards;
