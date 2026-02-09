import { Avatar, Typography, Space, Badge } from 'antd';
import { CrownOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import TierBadge from './TierBadge';
import type { LeaderboardEntry } from '@inspection/shared';

const { Text } = Typography;

export interface AnimatedPodiumProps {
  entries: LeaderboardEntry[];
  showConfetti?: boolean;
  onUserClick?: (userId: number) => void;
}

const PODIUM_COLORS = {
  1: { bg: '#ffd700', text: '#000', height: 120 },
  2: { bg: '#c0c0c0', text: '#000', height: 100 },
  3: { bg: '#cd7f32', text: '#fff', height: 80 },
};

const PODIUM_ORDER = [1, 0, 2]; // Display order: 2nd, 1st, 3rd

export function AnimatedPodium({ entries, showConfetti = false, onUserClick }: AnimatedPodiumProps) {
  const { t } = useTranslation();

  if (entries.length < 3) {
    return null;
  }

  const renderPodiumUser = (entry: LeaderboardEntry, position: 1 | 2 | 3) => {
    const config = PODIUM_COLORS[position];
    const isFirst = position === 1;

    return (
      <div
        key={entry.user_id}
        onClick={() => onUserClick?.(entry.user_id)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: onUserClick ? 'pointer' : 'default',
          flex: 1,
          maxWidth: 160,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => {
          if (onUserClick) e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          if (onUserClick) e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {/* Crown for 1st place */}
        {isFirst && (
          <CrownOutlined
            style={{
              fontSize: 32,
              color: '#ffd700',
              marginBottom: 8,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              animation: showConfetti ? 'bounce 0.5s ease-in-out infinite alternate' : 'none',
            }}
          />
        )}

        {/* Avatar */}
        <Badge count={position} offset={[-8, 8]} style={{ backgroundColor: config.bg, color: config.text }}>
          <Avatar
            size={isFirst ? 80 : 64}
            style={{
              backgroundColor: '#1677ff',
              fontSize: isFirst ? 32 : 24,
              fontWeight: 700,
              border: `4px solid ${config.bg}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {entry.full_name.charAt(0)}
          </Avatar>
        </Badge>

        {/* Name */}
        <Text
          strong
          style={{
            marginTop: 8,
            fontSize: isFirst ? 16 : 14,
            textAlign: 'center',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.full_name}
        </Text>

        {/* Tier */}
        <TierBadge tier={entry.tier} showLabel={false} size="small" />

        {/* Points */}
        <Text
          strong
          style={{
            color: '#1677ff',
            fontSize: isFirst ? 18 : 14,
            marginTop: 4,
          }}
        >
          {entry.total_points.toLocaleString()} pts
        </Text>

        {/* Podium stand */}
        <div
          style={{
            width: '100%',
            height: config.height,
            marginTop: 12,
            background: `linear-gradient(180deg, ${config.bg} 0%, ${config.bg}99 100%)`,
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            position: 'relative',
          }}
        >
          <TrophyOutlined
            style={{
              fontSize: isFirst ? 48 : 36,
              color: config.text,
              opacity: 0.3,
            }}
          />
          <Text
            style={{
              position: 'absolute',
              bottom: 8,
              color: config.text,
              fontSize: 24,
              fontWeight: 700,
              opacity: 0.6,
            }}
          >
            {position}
          </Text>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 16,
          padding: '24px 16px 0',
        }}
      >
        {PODIUM_ORDER.map((idx) => {
          const entry = entries[idx];
          const position = (idx + 1) as 1 | 2 | 3;
          return entry ? renderPodiumUser(entry, position) : null;
        })}
      </div>

      {showConfetti && (
        <style>{`
          @keyframes bounce {
            from { transform: translateY(0); }
            to { transform: translateY(-8px); }
          }
        `}</style>
      )}
    </div>
  );
}

export default AnimatedPodium;
