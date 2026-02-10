/**
 * RiskFactorsBreakdown - Display risk score factors with progress bars
 */

import { Descriptions, Progress, Space, Typography, Card, Statistic, Row, Col } from 'antd';
import { AlertOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { RiskResult, RiskFactor, RiskLevel } from '@inspection/shared/src/types/ai-base.types';
import { RiskScoreBadge } from './RiskScoreBadge';

const { Text } = Typography;

interface RiskFactorsBreakdownProps {
  riskResult: RiskResult;
  compact?: boolean;
  showRecommendations?: boolean;
  showOverallScore?: boolean;
  style?: React.CSSProperties;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#ff7a45',
  critical: '#ff4d4f',
};

export function RiskFactorsBreakdown({
  riskResult,
  compact = false,
  showRecommendations = true,
  showOverallScore = true,
  style,
}: RiskFactorsBreakdownProps) {
  const { t } = useTranslation();

  const formatFactorName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getScoreStatus = (score: number): 'success' | 'normal' | 'exception' => {
    if (score >= 75) return 'exception';
    if (score >= 50) return 'normal';
    return 'success';
  };

  if (compact) {
    return (
      <Card size="small" style={style}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {showOverallScore && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong>Risk Score</Text>
              <RiskScoreBadge
                score={riskResult.risk_score}
                level={riskResult.risk_level as RiskLevel}
              />
            </div>
          )}
          {Object.entries(riskResult.factors).slice(0, 3).map(([key, factor]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{formatFactorName(key)}</Text>
              <Progress
                percent={factor.score}
                size="small"
                status={getScoreStatus(factor.score)}
                style={{ width: 80, margin: 0 }}
                showInfo={false}
              />
            </div>
          ))}
        </Space>
      </Card>
    );
  }

  return (
    <div style={style}>
      {showOverallScore && (
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={8}>
              <Statistic
                title={t('ai.risk_score', 'Risk Score')}
                value={riskResult.risk_score}
                suffix="/100"
                valueStyle={{ color: RISK_COLORS[riskResult.risk_level as RiskLevel] }}
                prefix={<AlertOutlined />}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title={t('ai.risk_level', 'Risk Level')}
                value={riskResult.risk_level.toUpperCase()}
                valueStyle={{
                  color: RISK_COLORS[riskResult.risk_level as RiskLevel],
                  fontSize: 20,
                }}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Statistic
                title={t('ai.multiplier', 'Criticality Multiplier')}
                value={`${riskResult.multiplier}x`}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Descriptions column={1} size="small" bordered>
        {Object.entries(riskResult.factors).map(([key, factor]) => (
          <Descriptions.Item
            key={key}
            label={
              <Space>
                <Text>{formatFactorName(key)}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ({Math.round(factor.weight * 100)}%)
                </Text>
              </Space>
            }
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Progress
                percent={factor.score}
                size="small"
                status={getScoreStatus(factor.score)}
                style={{ width: 120 }}
              />
              <Text type="secondary">
                {typeof factor.value === 'number'
                  ? factor.value.toFixed(1)
                  : factor.value}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                +{factor.weighted_score.toFixed(1)}
              </Text>
            </Space>
          </Descriptions.Item>
        ))}
      </Descriptions>

      {showRecommendations && riskResult.recommendations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Text strong>{t('ai.risk_recommendations', 'Risk-based Recommendations')}</Text>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            {riskResult.recommendations.map((rec, i) => (
              <li key={i}>
                <Text>{rec}</Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RiskFactorsBreakdown;
