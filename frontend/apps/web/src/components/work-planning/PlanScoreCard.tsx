import React from 'react';
import { Progress, Skeleton, Typography, Tooltip } from 'antd';
import type { PlanScore } from '@inspection/shared';

const { Text } = Typography;

interface PlanScoreCardProps {
  score: PlanScore | null;
}

interface DimensionConfig {
  key: keyof Omit<PlanScore, 'overall'>;
  label: string;
  color: string;
}

const DIMENSIONS: DimensionConfig[] = [
  { key: 'pm_coverage', label: 'PM Coverage', color: '#52c41a' },
  { key: 'priority_coverage', label: 'Priority', color: '#1890ff' },
  { key: 'travel_efficiency', label: 'Travel', color: '#fa8c16' },
  { key: 'team_balance', label: 'Team Balance', color: '#722ed1' },
  { key: 'capacity_fit', label: 'Capacity', color: '#13c2c2' },
];

function getOverallColor(value: number): string {
  if (value >= 80) return '#52c41a';
  if (value >= 60) return '#fa8c16';
  return '#ff4d4f';
}

function getOverallBg(value: number): string {
  if (value >= 80) return '#f6ffed';
  if (value >= 60) return '#fff7e6';
  return '#fff2f0';
}

function getOverallBorder(value: number): string {
  if (value >= 80) return '#b7eb8f';
  if (value >= 60) return '#ffd591';
  return '#ffccc7';
}

export const PlanScoreCard: React.FC<PlanScoreCardProps> = ({ score }) => {
  if (score === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 16px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          height: 56,
          flexShrink: 0,
        }}
      >
        <Skeleton.Avatar active size={40} shape="circle" />
        <div style={{ flex: 1, display: 'flex', gap: 16 }}>
          {DIMENSIONS.map((d) => (
            <Skeleton.Input key={d.key} active size="small" style={{ width: 100, height: 20 }} />
          ))}
        </div>
      </div>
    );
  }

  const overallColor = getOverallColor(score.overall);
  const overallBg = getOverallBg(score.overall);
  const overallBorder = getOverallBorder(score.overall);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '6px 16px',
        background: '#fafafa',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
        transition: 'all 0.3s ease',
      }}
    >
      {/* Overall Score Circle */}
      <Tooltip title={`Overall plan quality: ${score.overall}%`}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: overallBg,
            border: `2px solid ${overallBorder}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 0 8px ${overallColor}20`,
            transition: 'all 0.3s ease',
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: overallColor,
              lineHeight: 1,
            }}
          >
            {score.overall}
          </Text>
          <Text style={{ fontSize: 8, color: '#8c8c8c', lineHeight: 1, marginTop: 1 }}>
            score
          </Text>
        </div>
      </Tooltip>

      {/* Vertical divider */}
      <div style={{ width: 1, height: 32, background: '#e8e8e8', flexShrink: 0 }} />

      {/* Dimension bars */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          overflow: 'hidden',
        }}
      >
        {DIMENSIONS.map((dim) => {
          const value = score[dim.key];
          return (
            <Tooltip key={dim.key} title={`${dim.label}: ${value}%`}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 80,
                  flex: 1,
                  maxWidth: 140,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#8c8c8c', lineHeight: '14px' }}>
                    {dim.label}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: 600, color: dim.color, lineHeight: '14px' }}>
                    {value}%
                  </Text>
                </div>
                <Progress
                  percent={value}
                  showInfo={false}
                  size="small"
                  strokeColor={dim.color}
                  trailColor="#f0f0f0"
                  style={{ margin: 0, lineHeight: 1 }}
                  strokeWidth={4}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};
