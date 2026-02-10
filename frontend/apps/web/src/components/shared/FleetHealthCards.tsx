import { Row, Col, Card, Statistic, Space, Typography, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ToolOutlined,
  StopOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface FleetHealthData {
  total_equipment: number;
  average_health_score: number;
  expiring_certifications: number;
  status_distribution: {
    active: number;
    under_maintenance: number;
    out_of_service: number;
    stopped: number;
    paused: number;
  };
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface FleetHealthCardsProps {
  data?: FleetHealthData;
  loading?: boolean;
  onCardClick?: (type: 'active' | 'maintenance' | 'critical' | 'certs') => void;
}

export function FleetHealthCards({ data, loading, onCardClick }: FleetHealthCardsProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={12} sm={6}>
            <Card size="small">
              <Spin size="small" />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (!data) {
    return null;
  }

  const cards = [
    {
      key: 'active',
      title: t('equipmentAI.activeEquipment', 'Active'),
      value: data.status_distribution.active,
      color: '#52c41a',
      icon: <CheckCircleOutlined />,
    },
    {
      key: 'maintenance',
      title: t('equipmentAI.underMaintenance', 'Maintenance'),
      value: data.status_distribution.under_maintenance + data.status_distribution.paused,
      color: '#faad14',
      icon: <ToolOutlined />,
    },
    {
      key: 'critical',
      title: t('equipmentAI.critical', 'Critical'),
      value: data.risk_distribution.critical + data.risk_distribution.high,
      color: '#ff4d4f',
      icon: <StopOutlined />,
    },
    {
      key: 'certs',
      title: t('equipmentAI.certsDue', 'Certs Due'),
      value: data.expiring_certifications,
      color: '#1890ff',
      icon: <SafetyCertificateOutlined />,
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col key={card.key} xs={12} sm={6}>
          <Card
            size="small"
            style={{
              cursor: onCardClick ? 'pointer' : 'default',
              borderLeft: `3px solid ${card.color}`,
            }}
            onClick={() => onCardClick?.(card.key as any)}
            hoverable={!!onCardClick}
          >
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {card.title}
                </Text>
                <span style={{ color: card.color }}>{card.icon}</span>
              </Space>
              <Statistic
                value={card.value}
                valueStyle={{ fontSize: 24, color: card.color }}
              />
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
