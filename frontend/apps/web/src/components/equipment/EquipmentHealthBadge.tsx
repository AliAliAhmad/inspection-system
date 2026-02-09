import { Badge, Tooltip, Progress } from 'antd';
import { HeartOutlined } from '@ant-design/icons';

export interface HealthBadgeProps {
  score: number; // 0-100
  showLabel?: boolean;
  size?: 'small' | 'default' | 'large';
  showProgress?: boolean;
}

function getHealthColor(score: number): string {
  if (score >= 80) return '#52c41a'; // Green
  if (score >= 50) return '#faad14'; // Yellow/Orange
  if (score >= 25) return '#fa8c16'; // Orange
  return '#ff4d4f'; // Red
}

function getHealthStatus(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 50) return 'Good';
  if (score >= 25) return 'Fair';
  return 'Critical';
}

function getHealthGradient(score: number): string {
  const color = getHealthColor(score);
  return `linear-gradient(135deg, ${color}22 0%, ${color}44 100%)`;
}

export function EquipmentHealthBadge({
  score,
  showLabel = true,
  size = 'default',
  showProgress = false,
}: HealthBadgeProps) {
  const color = getHealthColor(score);
  const status = getHealthStatus(score);
  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));

  const sizeConfig = {
    small: { fontSize: 11, padding: '2px 6px', iconSize: 10 },
    default: { fontSize: 12, padding: '4px 8px', iconSize: 12 },
    large: { fontSize: 14, padding: '6px 12px', iconSize: 14 },
  };

  const config = sizeConfig[size];

  if (showProgress) {
    return (
      <Tooltip title={`Health Score: ${clampedScore}/100 - ${status}`}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Progress
            type="circle"
            percent={clampedScore}
            size={size === 'small' ? 32 : size === 'large' ? 56 : 44}
            strokeColor={color}
            format={(percent) => (
              <span style={{ fontSize: config.fontSize, color, fontWeight: 600 }}>
                {percent}
              </span>
            )}
          />
          {showLabel && (
            <span style={{ fontSize: config.fontSize, color, fontWeight: 500 }}>
              {status}
            </span>
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`Health Score: ${clampedScore}/100 - ${status}`}>
      <Badge
        count={
          <div
            style={{
              background: getHealthGradient(clampedScore),
              border: `1px solid ${color}`,
              borderRadius: 12,
              padding: config.padding,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <HeartOutlined style={{ color, fontSize: config.iconSize }} />
            <span style={{ color, fontWeight: 600, fontSize: config.fontSize }}>
              {clampedScore}
            </span>
            {showLabel && (
              <span style={{ color, fontSize: config.fontSize - 1, marginLeft: 2 }}>
                {status}
              </span>
            )}
          </div>
        }
        style={{ background: 'transparent' }}
      />
    </Tooltip>
  );
}

// Simple inline badge for cards
export function HealthScoreTag({ score }: { score: number }) {
  const color = getHealthColor(score);
  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));

  return (
    <Tooltip title={`Health: ${getHealthStatus(clampedScore)}`}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 6px',
          borderRadius: 10,
          background: `${color}15`,
          border: `1px solid ${color}40`,
          fontSize: 11,
          fontWeight: 600,
          color,
        }}
      >
        <HeartOutlined style={{ fontSize: 10 }} />
        {clampedScore}
      </span>
    </Tooltip>
  );
}

export default EquipmentHealthBadge;
