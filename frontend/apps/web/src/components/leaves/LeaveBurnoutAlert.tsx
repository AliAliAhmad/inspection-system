import {
  Alert,
  Space,
  Typography,
  Tag,
  Button,
  List,
  Tooltip,
} from 'antd';
import {
  WarningOutlined,
  HeartOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { LeaveBurnoutRisk } from '@inspection/shared';

const { Text, Paragraph } = Typography;

interface LeaveBurnoutAlertProps {
  risk: LeaveBurnoutRisk;
  onRequestLeave?: () => void;
  compact?: boolean;
}

const RISK_LEVEL_CONFIG = {
  low: {
    color: '#52c41a',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    label: 'Low Risk',
    icon: <HeartOutlined />,
    alertType: 'success' as const,
  },
  medium: {
    color: '#faad14',
    bgColor: '#fffbe6',
    borderColor: '#ffe58f',
    label: 'Medium Risk',
    icon: <WarningOutlined />,
    alertType: 'warning' as const,
  },
  high: {
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    borderColor: '#ffccc7',
    label: 'High Risk',
    icon: <ThunderboltOutlined />,
    alertType: 'error' as const,
  },
};

export function LeaveBurnoutAlert({
  risk,
  onRequestLeave,
  compact = false,
}: LeaveBurnoutAlertProps) {
  const { t } = useTranslation();
  const config = RISK_LEVEL_CONFIG[risk.risk_level];

  if (compact) {
    return (
      <Alert
        type={config.alertType}
        showIcon
        icon={config.icon}
        message={
          <Space>
            <Text strong style={{ color: config.color }}>
              {t(`leaves.burnout.${risk.risk_level}`, config.label)}
            </Text>
            {risk.days_since_last_leave !== undefined && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({risk.days_since_last_leave} {t('leaves.daysSinceLastLeave', 'days since last leave')})
              </Text>
            )}
          </Space>
        }
        action={
          onRequestLeave && risk.risk_level !== 'low' && (
            <Button
              size="small"
              type="primary"
              onClick={onRequestLeave}
              style={
                risk.risk_level === 'high'
                  ? { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f' }
                  : {}
              }
            >
              {t('leaves.requestLeave', 'Request Leave')}
            </Button>
          )
        }
      />
    );
  }

  return (
    <div
      style={{
        padding: 16,
        backgroundColor: config.bgColor,
        borderRadius: 12,
        border: `1px solid ${config.borderColor}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        <Space align="start">
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 24,
            }}
          >
            {config.icon}
          </div>
          <div>
            <Text strong style={{ fontSize: 16 }}>
              {t('leaves.burnoutRiskAssessment', 'Burnout Risk Assessment')}
            </Text>
            <div>
              <Tag
                color={config.color}
                style={{
                  fontSize: 14,
                  padding: '4px 12px',
                  marginTop: 4,
                }}
              >
                {t(`leaves.burnout.${risk.risk_level}`, config.label)}
              </Tag>
            </div>
          </div>
        </Space>

        {risk.days_since_last_leave !== undefined && (
          <Tooltip title={t('leaves.lastLeaveTip', 'Days since your last approved leave')}>
            <div
              style={{
                textAlign: 'center',
                padding: '8px 16px',
                backgroundColor: 'rgba(255,255,255,0.8)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: config.color }}>
                {risk.days_since_last_leave}
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t('leaves.daysSinceLeave', 'days')}
              </Text>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Risk Factors */}
      {risk.factors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            <WarningOutlined style={{ marginRight: 4 }} />
            {t('leaves.contributingFactors', 'Contributing Factors')}
          </Text>
          <List
            size="small"
            dataSource={risk.factors}
            renderItem={(factor) => (
              <List.Item style={{ padding: '4px 0', border: 'none' }}>
                <Space>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: config.color,
                    }}
                  />
                  <Text style={{ fontSize: 13 }}>{factor}</Text>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Recommendation */}
      {risk.recommendation && (
        <div
          style={{
            padding: 12,
            backgroundColor: 'rgba(255,255,255,0.8)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <Space align="start">
            <BulbOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            <div>
              <Text strong style={{ fontSize: 13, color: '#52c41a' }}>
                {t('leaves.recommendation', 'Recommendation')}
              </Text>
              <Paragraph style={{ margin: 0, fontSize: 13 }}>
                {risk.recommendation}
              </Paragraph>
            </div>
          </Space>
        </div>
      )}

      {/* Quick Action */}
      {onRequestLeave && risk.risk_level !== 'low' && (
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={onRequestLeave}
          style={{
            width: '100%',
            backgroundColor: config.color,
            borderColor: config.color,
          }}
        >
          {t('leaves.requestLeaveNow', 'Request Leave Now')}
          <ArrowRightOutlined />
        </Button>
      )}

      {risk.risk_level === 'low' && (
        <div
          style={{
            textAlign: 'center',
            padding: 8,
          }}
        >
          <Space>
            <HeartOutlined style={{ color: '#52c41a' }} />
            <Text style={{ color: '#52c41a' }}>
              {t('leaves.healthyBalance', 'Great job maintaining a healthy work-life balance!')}
            </Text>
          </Space>
        </div>
      )}
    </div>
  );
}

export default LeaveBurnoutAlert;
