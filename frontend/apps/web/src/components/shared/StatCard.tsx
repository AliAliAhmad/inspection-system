import { Card, Statistic, Progress, Tooltip, Space, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { ReactNode } from 'react';

const { Text } = Typography;

interface StatCardProps {
  title: string;
  value: number | string;
  suffix?: string;
  prefix?: ReactNode;
  icon?: ReactNode;
  trend?: number; // Positive = up, negative = down
  trendLabel?: string;
  progress?: number; // 0-100
  progressColor?: string;
  tooltip?: string;
  size?: 'small' | 'default' | 'large';
  loading?: boolean;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  suffix,
  prefix,
  icon,
  trend,
  trendLabel,
  progress,
  progressColor = '#1890ff',
  tooltip,
  size = 'default',
  loading = false,
  onClick,
}: StatCardProps) {
  const cardStyle = {
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 0.3s',
    ...(onClick && {
      ':hover': {
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      },
    }),
  };

  const titleSize = size === 'small' ? 12 : size === 'large' ? 16 : 14;
  const valueSize = size === 'small' ? 20 : size === 'large' ? 32 : 24;

  return (
    <Card
      size={size === 'large' ? 'default' : 'small'}
      style={cardStyle}
      onClick={onClick}
      loading={loading}
      hoverable={!!onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: titleSize }}>
              {title}
            </Text>
            {tooltip && (
              <Tooltip title={tooltip}>
                <InfoCircleOutlined style={{ fontSize: 12, color: '#999' }} />
              </Tooltip>
            )}
          </Space>

          <div style={{ marginTop: 8 }}>
            <Statistic
              value={value}
              suffix={suffix}
              prefix={prefix}
              valueStyle={{ fontSize: valueSize, fontWeight: 600 }}
            />
          </div>

          {trend !== undefined && (
            <div style={{ marginTop: 4 }}>
              <Space size={4}>
                {trend >= 0 ? (
                  <ArrowUpOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                ) : (
                  <ArrowDownOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                )}
                <Text
                  style={{
                    fontSize: 12,
                    color: trend >= 0 ? '#52c41a' : '#ff4d4f',
                  }}
                >
                  {Math.abs(trend)}%
                </Text>
                {trendLabel && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {trendLabel}
                  </Text>
                )}
              </Space>
            </div>
          )}

          {progress !== undefined && (
            <Progress
              percent={progress}
              showInfo={false}
              strokeColor={progressColor}
              size="small"
              style={{ marginTop: 8 }}
            />
          )}
        </div>

        {icon && (
          <div
            style={{
              width: size === 'large' ? 56 : 44,
              height: size === 'large' ? 56 : 44,
              borderRadius: '50%',
              backgroundColor: '#f0f5ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: size === 'large' ? 24 : 20,
              color: '#1890ff',
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export default StatCard;
