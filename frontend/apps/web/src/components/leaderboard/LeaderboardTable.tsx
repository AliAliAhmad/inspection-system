import { Table, Space, Avatar, Typography, Tag, Tooltip, Badge } from 'antd';
import {
  CrownOutlined,
  TrophyOutlined,
  FireOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import TierBadge from './TierBadge';
import RankChangeBadge from './RankChangeBadge';
import StreakBadge from './StreakBadge';
import type { LeaderboardEntry } from '@inspection/shared';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

export interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  currentUserId?: number;
  onUserClick?: (userId: number) => void;
  showTop3?: boolean;
  pagination?: { pageSize: number };
}

function getRankIcon(rank: number) {
  if (rank === 1) return <CrownOutlined style={{ color: '#ffd700', fontSize: 18 }} />;
  if (rank === 2) return <TrophyOutlined style={{ color: '#c0c0c0', fontSize: 16 }} />;
  if (rank === 3) return <TrophyOutlined style={{ color: '#cd7f32', fontSize: 16 }} />;
  return null;
}

export function LeaderboardTable({
  entries,
  loading = false,
  currentUserId,
  onUserClick,
  showTop3 = true,
  pagination = { pageSize: 20 },
}: LeaderboardTableProps) {
  const { t } = useTranslation();

  const displayEntries = showTop3 ? entries : entries.filter((e) => e.rank > 3);

  const columns: ColumnsType<LeaderboardEntry> = [
    {
      title: '#',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (rank: number, record: LeaderboardEntry) => (
        <Space>
          {getRankIcon(rank)}
          <Text strong={rank <= 3}>{rank}</Text>
          {record.rank_change !== undefined && record.rank_change !== 0 && (
            <RankChangeBadge change={record.rank_change} size="small" showTooltip={false} />
          )}
        </Space>
      ),
    },
    {
      title: t('common.name'),
      dataIndex: 'full_name',
      key: 'full_name',
      render: (name: string, record: LeaderboardEntry) => {
        const isCurrentUser = record.user_id === currentUserId;
        return (
          <Space
            style={{ cursor: onUserClick ? 'pointer' : 'default' }}
            onClick={() => onUserClick?.(record.user_id)}
          >
            <Badge dot={isCurrentUser} offset={[-4, 4]} color="blue">
              <Avatar
                size="small"
                style={{
                  backgroundColor: isCurrentUser ? '#1677ff' : '#8c8c8c',
                  fontWeight: isCurrentUser ? 700 : 400,
                }}
              >
                {name.charAt(0)}
              </Avatar>
            </Badge>
            <div>
              <Text strong={isCurrentUser}>{name}</Text>
              {record.employee_id && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                  {record.employee_id}
                </Text>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: t('leaderboard.level', 'Level'),
      key: 'level',
      width: 100,
      render: (_: unknown, record: LeaderboardEntry) => (
        <Space>
          <Text strong style={{ color: '#1677ff' }}>
            Lv.{record.level}
          </Text>
          <TierBadge tier={record.tier} showLabel={false} size="small" />
        </Space>
      ),
    },
    {
      title: t('leaderboard.points', 'Points'),
      dataIndex: 'total_points',
      key: 'total_points',
      width: 120,
      sorter: (a, b) => a.total_points - b.total_points,
      render: (points: number) => (
        <Tooltip title={points.toLocaleString()}>
          <Text strong style={{ color: '#52c41a' }}>
            <StarOutlined style={{ marginRight: 4 }} />
            {points.toLocaleString()}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('leaderboard.streak', 'Streak'),
      dataIndex: 'current_streak',
      key: 'current_streak',
      width: 100,
      render: (streak: number) => (
        <StreakBadge streak={streak} showLabel={false} size="small" animated={false} />
      ),
    },
    {
      title: t('leaderboard.achievements', 'Achievements'),
      dataIndex: 'achievements_count',
      key: 'achievements_count',
      width: 120,
      render: (count: number) => (
        <Tag icon={<TrophyOutlined />} color="gold">
          {count}
        </Tag>
      ),
    },
    {
      title: t('common.role'),
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => <Tag>{role}</Tag>,
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={displayEntries}
      loading={loading}
      rowKey="user_id"
      pagination={pagination}
      rowClassName={(record) =>
        record.user_id === currentUserId ? 'leaderboard-current-user-row' : ''
      }
      style={{ marginTop: 16 }}
      scroll={{ x: 800 }}
    />
  );
}

export default LeaderboardTable;
