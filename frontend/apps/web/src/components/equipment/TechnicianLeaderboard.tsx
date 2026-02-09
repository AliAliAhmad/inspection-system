import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Select,
  Statistic,
  Row,
  Col,
  Avatar,
  Tooltip,
  Progress,
  Typography,
  Badge,
} from 'antd';
import {
  TrophyOutlined,
  CrownOutlined,
  StarOutlined,
  RiseOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { equipmentApi } from '@inspection/shared';
import type { EquipmentLeaderboardEntry } from '@inspection/shared';

const { Text, Title } = Typography;

interface TechnicianLeaderboardProps {
  currentUserId?: number;
}

export const TechnicianLeaderboard: React.FC<TechnicianLeaderboardProps> = ({ currentUserId }) => {
  const [period, setPeriod] = useState<'week' | 'month' | 'all_time'>('month');
  const [berth, setBerth] = useState<string | undefined>(undefined);

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['technician-leaderboard', period, berth],
    queryFn: async () => {
      const response = await equipmentApi.getLeaderboard({ period, berth });
      return response.data?.data as EquipmentLeaderboardEntry[];
    },
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <CrownOutlined style={{ color: '#ffd700', fontSize: 24 }} />;
      case 2:
        return <TrophyOutlined style={{ color: '#c0c0c0', fontSize: 20 }} />;
      case 3:
        return <TrophyOutlined style={{ color: '#cd7f32', fontSize: 18 }} />;
      default:
        return <span style={{ fontWeight: 'bold', color: '#8c8c8c' }}>{rank}</span>;
    }
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { backgroundColor: '#fffbe6', borderLeft: '4px solid #ffd700' };
    if (rank === 2) return { backgroundColor: '#f6f6f6', borderLeft: '4px solid #c0c0c0' };
    if (rank === 3) return { backgroundColor: '#fff7e6', borderLeft: '4px solid #cd7f32' };
    return {};
  };

  const topThree = leaderboard?.slice(0, 3) || [];
  const rest = leaderboard?.slice(3) || [];

  const columns = [
    {
      title: '#',
      dataIndex: 'rank',
      key: 'rank',
      width: 60,
      render: (rank: number) => getRankIcon(rank),
    },
    {
      title: 'Technician',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (name: string, record: EquipmentLeaderboardEntry) => (
        <Space>
          <Avatar style={{ backgroundColor: record.user_id === currentUserId ? '#1890ff' : '#87d068' }}>
            {name.charAt(0)}
          </Avatar>
          <div>
            <div style={{ fontWeight: record.user_id === currentUserId ? 600 : 400 }}>
              {name}
              {record.user_id === currentUserId && (
                <Tag color="blue" style={{ marginLeft: 8 }}>You</Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>{record.role_id}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Inspections',
      dataIndex: 'inspections_completed',
      key: 'inspections_completed',
      render: (completed: number, record: EquipmentLeaderboardEntry) => (
        <Tooltip title={`${record.inspections_passed} passed`}>
          <Space direction="vertical" size={0}>
            <Text strong>{completed}</Text>
            <Progress
              percent={(record.inspections_passed / (completed || 1)) * 100}
              size="small"
              showInfo={false}
              strokeColor="#52c41a"
              style={{ width: 60 }}
            />
          </Space>
        </Tooltip>
      ),
    },
    {
      title: 'Quick Fixes',
      dataIndex: 'quick_fixes',
      key: 'quick_fixes',
      render: (fixes: number) => (
        <Badge count={fixes} showZero style={{ backgroundColor: fixes > 0 ? '#52c41a' : '#d9d9d9' }} />
      ),
    },
    {
      title: 'Equipment',
      dataIndex: 'assigned_equipment',
      key: 'assigned_equipment',
      render: (count: number) => (
        <Space>
          <TeamOutlined />
          {count}
        </Space>
      ),
    },
    {
      title: 'Points',
      dataIndex: 'points',
      key: 'points',
      render: (points: number, record: EquipmentLeaderboardEntry) => (
        <Space>
          <StarOutlined style={{ color: '#faad14' }} />
          <Text strong style={{ color: '#faad14' }}>{points}</Text>
        </Space>
      ),
      sorter: (a: EquipmentLeaderboardEntry, b: EquipmentLeaderboardEntry) => a.points - b.points,
      defaultSortOrder: 'descend' as const,
    },
  ];

  return (
    <Card
      title={
        <Space>
          <TrophyOutlined style={{ color: '#faad14' }} />
          <span>Technician Leaderboard</span>
        </Space>
      }
      extra={
        <Space>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 120 }}
            size="small"
          >
            <Select.Option value="week">This Week</Select.Option>
            <Select.Option value="month">This Month</Select.Option>
            <Select.Option value="all_time">All Time</Select.Option>
          </Select>
          <Select
            value={berth}
            onChange={setBerth}
            placeholder="All Berths"
            allowClear
            style={{ width: 100 }}
            size="small"
          >
            <Select.Option value="east">East</Select.Option>
            <Select.Option value="west">West</Select.Option>
          </Select>
        </Space>
      }
    >
      {/* Top 3 Podium */}
      {topThree.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 24, textAlign: 'center' }}>
          {topThree.length >= 2 && (
            <Col xs={24} sm={8} style={{ order: 1 }}>
              <PodiumCard entry={topThree[1]} rank={2} isCurrentUser={topThree[1].user_id === currentUserId} />
            </Col>
          )}
          {topThree.length >= 1 && (
            <Col xs={24} sm={8} style={{ order: 0 }}>
              <PodiumCard entry={topThree[0]} rank={1} isCurrentUser={topThree[0].user_id === currentUserId} />
            </Col>
          )}
          {topThree.length >= 3 && (
            <Col xs={24} sm={8} style={{ order: 2 }}>
              <PodiumCard entry={topThree[2]} rank={3} isCurrentUser={topThree[2].user_id === currentUserId} />
            </Col>
          )}
        </Row>
      )}

      {/* Rest of the leaderboard */}
      {rest.length > 0 && (
        <Table
          columns={columns}
          dataSource={rest}
          rowKey="user_id"
          loading={isLoading}
          pagination={false}
          size="small"
          rowClassName={(record) => (record.user_id === currentUserId ? 'highlight-row' : '')}
        />
      )}

      {leaderboard?.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
          <TeamOutlined style={{ fontSize: 48 }} />
          <div style={{ marginTop: 16 }}>No technician data available for this period</div>
        </div>
      )}
    </Card>
  );
};

interface PodiumCardProps {
  entry: EquipmentLeaderboardEntry;
  rank: number;
  isCurrentUser: boolean;
}

const PodiumCard: React.FC<PodiumCardProps> = ({ entry, rank, isCurrentUser }) => {
  const heights = { 1: 140, 2: 100, 3: 80 };
  const colors = { 1: '#ffd700', 2: '#c0c0c0', 3: '#cd7f32' };

  return (
    <div
      style={{
        backgroundColor: isCurrentUser ? '#e6f7ff' : '#fafafa',
        borderRadius: 8,
        padding: 16,
        minHeight: heights[rank as keyof typeof heights],
        border: isCurrentUser ? '2px solid #1890ff' : '1px solid #f0f0f0',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        {rank === 1 ? (
          <CrownOutlined style={{ fontSize: 32, color: colors[1] }} />
        ) : (
          <TrophyOutlined style={{ fontSize: rank === 2 ? 28 : 24, color: colors[rank as keyof typeof colors] }} />
        )}
      </div>
      <Avatar
        size={rank === 1 ? 64 : rank === 2 ? 56 : 48}
        style={{
          backgroundColor: colors[rank as keyof typeof colors],
          border: `3px solid ${colors[rank as keyof typeof colors]}`,
        }}
      >
        {entry.full_name.charAt(0)}
      </Avatar>
      <div style={{ marginTop: 8 }}>
        <Text strong style={{ fontSize: rank === 1 ? 16 : 14 }}>
          {entry.full_name}
        </Text>
        {isCurrentUser && (
          <Tag color="blue" style={{ marginLeft: 4 }}>You</Tag>
        )}
      </div>
      <div style={{ marginTop: 4 }}>
        <StarOutlined style={{ color: '#faad14' }} />
        <Text strong style={{ color: '#faad14', fontSize: rank === 1 ? 24 : 18, marginLeft: 4 }}>
          {entry.points}
        </Text>
        <Text type="secondary" style={{ marginLeft: 4 }}>pts</Text>
      </div>
      <div style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {entry.inspections_completed} inspections
        </Text>
      </div>
    </div>
  );
};

export default TechnicianLeaderboard;
