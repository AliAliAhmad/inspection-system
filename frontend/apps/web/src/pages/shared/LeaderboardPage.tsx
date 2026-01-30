import { useState } from 'react';
import { Card, Table, Tabs, Tag, Space, Typography, Avatar } from 'antd';
import { TrophyOutlined, CrownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { leaderboardsApi, LeaderboardEntry } from '@inspection/shared';

type TabKey = 'overall' | 'inspectors' | 'specialists' | 'engineers' | 'quality';

const fetchers: Record<TabKey, (params?: any) => Promise<any>> = {
  overall: (p) => leaderboardsApi.getOverall(p).then(r => r.data.data),
  inspectors: (p) => leaderboardsApi.getInspectors(p).then(r => r.data.data),
  specialists: (p) => leaderboardsApi.getSpecialists(p).then(r => r.data.data),
  engineers: (p) => leaderboardsApi.getEngineers(p).then(r => r.data.data),
  quality: (p) => leaderboardsApi.getQualityEngineers(p).then(r => r.data.data),
};

function getRankColor(rank: number) {
  if (rank === 1) return '#ffd700';
  if (rank === 2) return '#c0c0c0';
  if (rank === 3) return '#cd7f32';
  return undefined;
}

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('overall');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', activeTab],
    queryFn: () => fetchers[activeTab](),
  });

  const columns = [
    {
      title: '#',
      dataIndex: 'rank',
      width: 60,
      render: (rank: number) => {
        const color = getRankColor(rank);
        return color ? (
          <Space>
            <CrownOutlined style={{ color, fontSize: 18 }} />
            <strong>{rank}</strong>
          </Space>
        ) : rank;
      },
    },
    {
      title: t('common.name'),
      dataIndex: 'full_name',
      render: (name: string, record: LeaderboardEntry) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
            {name.charAt(0)}
          </Avatar>
          <span>{name}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ({record.employee_id})
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('common.role'),
      dataIndex: 'role',
      render: (role: string) => <Tag>{role}</Tag>,
    },
    {
      title: 'Points',
      dataIndex: 'total_points',
      sorter: (a: LeaderboardEntry, b: LeaderboardEntry) => a.total_points - b.total_points,
      render: (points: number) => (
        <Typography.Text strong style={{ color: '#1677ff' }}>
          {points}
        </Typography.Text>
      ),
    },
  ];

  const tabs = [
    { key: 'overall', label: t('common.all') },
    { key: 'inspectors', label: 'Inspectors' },
    { key: 'specialists', label: 'Specialists' },
    { key: 'engineers', label: 'Engineers' },
    { key: 'quality', label: 'Quality Engineers' },
  ];

  return (
    <Card
      title={
        <Space>
          <TrophyOutlined />
          <span>{t('nav.leaderboard')}</span>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={tabs.map(tab => ({ key: tab.key, label: tab.label }))}
      />
      <Table
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        rowKey="user_id"
        pagination={{ pageSize: 20 }}
      />
    </Card>
  );
}
