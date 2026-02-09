import { Row, Col, Typography, Segmented, Empty, Spin, Card, Space } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ThunderboltOutlined,
  CalendarOutlined,
  FireOutlined,
  StarOutlined,
} from '@ant-design/icons';
import ChallengeCard from './ChallengeCard';
import type { Challenge } from '@inspection/shared';

const { Title, Text } = Typography;

export interface ChallengeListProps {
  challenges: Challenge[];
  suggestedChallenges?: Challenge[];
  loading?: boolean;
  onJoin?: (id: number) => void;
  onLeave?: (id: number) => void;
  onViewDetails?: (challenge: Challenge) => void;
  joiningId?: number;
}

type FilterType = 'all' | 'weekly' | 'monthly' | 'special' | 'joined';

export function ChallengeList({
  challenges,
  suggestedChallenges,
  loading = false,
  onJoin,
  onLeave,
  onViewDetails,
  joiningId,
}: ChallengeListProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');

  const joinedCount = challenges.filter((c) => c.is_joined).length;
  const weeklyCount = challenges.filter((c) => c.challenge_type === 'weekly').length;
  const monthlyCount = challenges.filter((c) => c.challenge_type === 'monthly').length;
  const specialCount = challenges.filter((c) => c.challenge_type === 'special').length;

  const filteredChallenges = challenges.filter((challenge) => {
    switch (filter) {
      case 'weekly':
        return challenge.challenge_type === 'weekly';
      case 'monthly':
        return challenge.challenge_type === 'monthly';
      case 'special':
        return challenge.challenge_type === 'special';
      case 'joined':
        return challenge.is_joined;
      default:
        return true;
    }
  });

  const filterOptions = [
    { label: t('leaderboard.all', 'All'), value: 'all' },
    { label: `${t('leaderboard.joined', 'Joined')} (${joinedCount})`, value: 'joined' },
    { label: <><CalendarOutlined /> Weekly ({weeklyCount})</>, value: 'weekly' },
    { label: <><FireOutlined /> Monthly ({monthlyCount})</>, value: 'monthly' },
    { label: <><StarOutlined /> Special ({specialCount})</>, value: 'special' },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* Header with filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space>
          <ThunderboltOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 16 }}>
            {challenges.length} {t('leaderboard.active_challenges', 'Active Challenges')}
          </Text>
        </Space>

        <Segmented
          value={filter}
          onChange={(val) => setFilter(val as FilterType)}
          options={filterOptions}
          size="small"
        />
      </div>

      {/* Suggested challenges from AI */}
      {suggestedChallenges && suggestedChallenges.length > 0 && filter === 'all' && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)',
            borderColor: '#91d5ff',
          }}
        >
          <Space style={{ marginBottom: 8 }}>
            <StarOutlined style={{ color: '#1677ff' }} />
            <Text strong>{t('leaderboard.ai_suggested', 'AI Suggested for You')}</Text>
          </Space>
          <Row gutter={[12, 12]}>
            {suggestedChallenges.slice(0, 2).map((challenge) => (
              <Col xs={24} sm={12} key={challenge.id}>
                <ChallengeCard
                  challenge={challenge}
                  onJoin={() => onJoin?.(challenge.id)}
                  loading={joiningId === challenge.id}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Challenge grid */}
      {filteredChallenges.length === 0 ? (
        <Empty description={t('leaderboard.no_challenges', 'No challenges found')} />
      ) : (
        <Row gutter={[16, 16]}>
          {filteredChallenges.map((challenge) => (
            <Col xs={24} sm={12} lg={8} key={challenge.id}>
              <ChallengeCard
                challenge={challenge}
                onJoin={() => onJoin?.(challenge.id)}
                onLeave={() => onLeave?.(challenge.id)}
                onViewDetails={() => onViewDetails?.(challenge)}
                loading={joiningId === challenge.id}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default ChallengeList;
