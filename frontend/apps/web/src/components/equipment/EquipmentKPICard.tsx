import { Card, Statistic, Tooltip } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  RiseOutlined,
  FieldTimeOutlined,
  WarningOutlined,
  BellOutlined,
} from '@ant-design/icons';

export interface KPICardProps {
  title: string;
  value: string | number;
  icon: 'uptime' | 'downtime' | 'risk' | 'alerts';
  trend?: string;
  trendDirection?: 'up' | 'down';
  color?: 'green' | 'blue' | 'orange' | 'red';
  onClick?: () => void;
  loading?: boolean;
  suffix?: string;
  tooltip?: string;
}

const iconMap = {
  uptime: <RiseOutlined />,
  downtime: <FieldTimeOutlined />,
  risk: <WarningOutlined />,
  alerts: <BellOutlined />,
};

const colorMap = {
  green: { background: '#f6ffed', border: '#52c41a', text: '#52c41a' },
  blue: { background: '#e6f7ff', border: '#1890ff', text: '#1890ff' },
  orange: { background: '#fffbe6', border: '#faad14', text: '#faad14' },
  red: { background: '#fff2f0', border: '#ff4d4f', text: '#ff4d4f' },
};

export function EquipmentKPICard({
  title,
  value,
  icon,
  trend,
  trendDirection,
  color = 'blue',
  onClick,
  loading = false,
  suffix,
  tooltip,
}: KPICardProps) {
  const colors = colorMap[color];
  const iconElement = iconMap[icon];

  const trendElement = trend ? (
    <span
      style={{
        fontSize: 12,
        color: trendDirection === 'up' ? '#52c41a' : trendDirection === 'down' ? '#ff4d4f' : '#1890ff',
        marginLeft: 8,
      }}
    >
      {trendDirection === 'up' ? <ArrowUpOutlined /> : trendDirection === 'down' ? <ArrowDownOutlined /> : null}
      {' '}{trend}
    </span>
  ) : null;

  const cardContent = (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      loading={loading}
      style={{
        background: colors.background,
        borderLeft: `4px solid ${colors.border}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
      }}
      styles={{
        body: { padding: '16px 20px' },
      }}
    >
      <Statistic
        title={
          <span style={{ color: colors.text, fontWeight: 500, fontSize: 13 }}>
            {iconElement} {title}
          </span>
        }
        value={value}
        suffix={suffix}
        valueStyle={{ color: colors.text, fontSize: 28, fontWeight: 600 }}
      />
      {trendElement}
    </Card>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{cardContent}</Tooltip>;
  }

  return cardContent;
}

export default EquipmentKPICard;
