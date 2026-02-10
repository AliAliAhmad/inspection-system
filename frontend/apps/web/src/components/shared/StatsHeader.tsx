/**
 * SharedStatsHeader - Reusable stats header component
 *
 * Used across Quality Reviews, Engineer Jobs, Specialist Jobs, and Inspection screens.
 * Provides consistent UI for displaying stats with icons, trends, and colors.
 */
import React from 'react';
import { Card, Row, Col, Statistic, Typography, Space, Tooltip, Spin } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';

export interface StatItem {
  key: string;
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: string;
  suffix?: string;
  prefix?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    value: number;
    label?: string;
  };
  tooltip?: string;
}

export interface StatsHeaderProps {
  stats: StatItem[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  columns?: 2 | 3 | 4 | 5 | 6;
  size?: 'small' | 'default' | 'large';
  variant?: 'card' | 'inline';
}

const getTrendIcon = (direction: 'up' | 'down' | 'stable') => {
  switch (direction) {
    case 'up':
      return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
    case 'down':
      return <ArrowDownOutlined style={{ color: '#ff4d4f' }} />;
    default:
      return <MinusOutlined style={{ color: '#8c8c8c' }} />;
  }
};

const getTrendColor = (direction: 'up' | 'down' | 'stable', inverted = false) => {
  if (inverted) {
    return direction === 'up' ? '#ff4d4f' : direction === 'down' ? '#52c41a' : '#8c8c8c';
  }
  return direction === 'up' ? '#52c41a' : direction === 'down' ? '#ff4d4f' : '#8c8c8c';
};

export function StatsHeader({
  stats,
  loading = false,
  title,
  subtitle,
  columns = 4,
  size = 'default',
  variant = 'card',
}: StatsHeaderProps) {
  const colSpan = Math.floor(24 / columns);

  const renderStatContent = (stat: StatItem) => (
    <div style={{ textAlign: 'center' }}>
      {stat.icon && (
        <div style={{ marginBottom: 8, fontSize: size === 'large' ? 28 : size === 'small' ? 18 : 22 }}>
          {stat.icon}
        </div>
      )}
      <Statistic
        title={stat.label}
        value={stat.value}
        prefix={stat.prefix}
        suffix={stat.suffix}
        valueStyle={{
          color: stat.color,
          fontSize: size === 'large' ? 28 : size === 'small' ? 18 : 24,
        }}
      />
      {stat.trend && (
        <Space size={4} style={{ marginTop: 4 }}>
          {getTrendIcon(stat.trend.direction)}
          <Typography.Text
            style={{
              color: getTrendColor(stat.trend.direction),
              fontSize: size === 'small' ? 11 : 12,
            }}
          >
            {stat.trend.value}%
            {stat.trend.label && ` ${stat.trend.label}`}
          </Typography.Text>
        </Space>
      )}
    </div>
  );

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (variant === 'inline') {
    return (
      <div style={{ marginBottom: 16 }}>
        {title && (
          <Typography.Title level={5} style={{ marginBottom: 8 }}>
            {title}
            {subtitle && (
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 14 }}>
                {subtitle}
              </Typography.Text>
            )}
          </Typography.Title>
        )}
        <Row gutter={[16, 16]}>
          {stats.map((stat) => (
            <Col key={stat.key} span={colSpan}>
              {stat.tooltip ? (
                <Tooltip title={stat.tooltip}>
                  {renderStatContent(stat)}
                </Tooltip>
              ) : (
                renderStatContent(stat)
              )}
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      {title && (
        <Typography.Title level={5} style={{ marginBottom: 16 }}>
          {title}
          {subtitle && (
            <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 14 }}>
              {subtitle}
            </Typography.Text>
          )}
        </Typography.Title>
      )}
      <Row gutter={[24, 16]}>
        {stats.map((stat) => (
          <Col key={stat.key} span={colSpan}>
            {stat.tooltip ? (
              <Tooltip title={stat.tooltip}>
                {renderStatContent(stat)}
              </Tooltip>
            ) : (
              renderStatContent(stat)
            )}
          </Col>
        ))}
      </Row>
    </Card>
  );
}

// Pre-configured stat icons for common use cases
export const StatIcons = {
  total: <TeamOutlined style={{ color: '#1890ff' }} />,
  completed: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  pending: <ClockCircleOutlined style={{ color: '#faad14' }} />,
  rejected: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
  approved: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  inProgress: <ClockCircleOutlined style={{ color: '#1890ff' }} />,
};

export default StatsHeader;
