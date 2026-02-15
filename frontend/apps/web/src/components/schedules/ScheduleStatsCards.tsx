import React from 'react';
import { Row, Col, Card, Statistic, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

export const ScheduleStatsCards: React.FC = () => {
  const { data: riskData, isLoading: riskLoading } = useQuery({
    queryKey: ['schedule-ai', 'risk-scores'],
    queryFn: () => scheduleAIApi.getRiskScores(),
  });

  const { data: coverageData, isLoading: coverageLoading } = useQuery({
    queryKey: ['schedule-ai', 'coverage-gaps'],
    queryFn: () => scheduleAIApi.getCoverageGaps(),
  });

  const { data: slaData, isLoading: slaLoading } = useQuery({
    queryKey: ['schedule-ai', 'sla-warnings'],
    queryFn: () => scheduleAIApi.getSLAWarnings(7),
  });

  const isLoading = riskLoading || coverageLoading || slaLoading;

  if (isLoading) {
    return (
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4].map((i) => (
          <Col xs={24} sm={12} lg={6} key={i}>
            <Card>
              <Spin />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  const totalEquipment = riskData?.summary?.total_equipment || 0;
  const avgRiskScore = riskData?.summary?.average_risk_score || 0;
  const criticalGaps = coverageData?.critical_gaps || 0;
  const slaWarnings = slaData?.length || 0;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Total Equipment"
            value={totalEquipment}
            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Coverage Rate"
            value={
              100 -
              ((coverageData?.total_gaps || 0) / Math.max(totalEquipment, 1)) *
                100
            }
            precision={1}
            suffix="%"
            valueStyle={{ color: criticalGaps > 0 ? '#cf1322' : '#3f8600' }}
            prefix={
              criticalGaps > 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />
            }
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Avg Risk Score"
            value={avgRiskScore}
            precision={1}
            valueStyle={{
              color:
                avgRiskScore > 70
                  ? '#cf1322'
                  : avgRiskScore > 40
                    ? '#faad14'
                    : '#3f8600',
            }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="SLA Warnings"
            value={slaWarnings}
            prefix={
              slaWarnings > 0 ? (
                <WarningOutlined style={{ color: '#faad14' }} />
              ) : (
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              )
            }
            valueStyle={{
              color:
                slaWarnings > 5
                  ? '#cf1322'
                  : slaWarnings > 0
                    ? '#faad14'
                    : '#3f8600',
            }}
          />
        </Card>
      </Col>
    </Row>
  );
};
