import { useState } from 'react';
import { Card, Tabs, Space, Typography, Row, Col, Spin, message } from 'antd';
import { TrophyOutlined, UserOutlined, StarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  leaderboardsApi,
  LeaderboardEntry,
  LeaderboardAchievement,
  Challenge,
  PointBreakdown,
  HistoricalData,
  AIInsight,
  RankPrediction,
  UserStats,
} from '@inspection/shared';
import {
  AnimatedPodium,
  LeaderboardTable,
  UserRankCard,
  AchievementGrid,
  ChallengeList,
  PointBreakdownChart,
  PerformanceChart,
  AIInsightsPanel,
  PeriodSelector,
} from '../../components/leaderboard';

const { Title } = Typography;

type TabKey = 'rankings' | 'my_stats' | 'achievements' | 'challenges';
type RoleFilter = 'overall' | 'inspectors' | 'specialists' | 'engineers' | 'quality';
type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

const fetchers: Record<RoleFilter, (params?: { period?: LeaderboardPeriod }) => Promise<LeaderboardEntry[]>> = {
  overall: (p) => leaderboardsApi.getOverall(p).then((r) => r.data.data || []),
  inspectors: (p) => leaderboardsApi.getInspectors(p).then((r) => r.data.data || []),
  specialists: (p) => leaderboardsApi.getSpecialists(p).then((r) => r.data.data || []),
  engineers: (p) => leaderboardsApi.getEngineers(p).then((r) => r.data.data || []),
  quality: (p) => leaderboardsApi.getQualityEngineers(p).then((r) => r.data.data || []),
};

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('rankings');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('overall');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [historicalPeriod, setHistoricalPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  // Main leaderboard data
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['leaderboard', roleFilter, period],
    queryFn: () => fetchers[roleFilter]({ period }),
  });

  // My rank
  const { data: myRankData, isLoading: myRankLoading } = useQuery({
    queryKey: ['leaderboard', 'my-rank'],
    queryFn: () => leaderboardsApi.getMyRank().then((r) => r.data.data),
  });

  // User stats (only when my_stats tab is active)
  const { data: userStats, isLoading: statsLoading } = useQuery({
    queryKey: ['leaderboard', 'user-stats', myRankData?.user_id],
    queryFn: () =>
      myRankData?.user_id
        ? leaderboardsApi.getUserStats(myRankData.user_id).then((r) => r.data.data)
        : Promise.resolve(null),
    enabled: !!myRankData?.user_id && activeTab === 'my_stats',
  });

  // Achievements (only when achievements tab is active)
  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['leaderboard', 'achievements'],
    queryFn: () => leaderboardsApi.getAchievements().then((r) => r.data.data),
    enabled: activeTab === 'achievements',
  });

  // Challenges (only when challenges tab is active)
  const { data: challenges, isLoading: challengesLoading } = useQuery({
    queryKey: ['leaderboard', 'challenges'],
    queryFn: () => leaderboardsApi.getChallenges().then((r) => r.data.data),
    enabled: activeTab === 'challenges',
  });

  // AI suggested challenges
  const { data: suggestedChallenges } = useQuery({
    queryKey: ['leaderboard', 'suggested-challenges'],
    queryFn: () => leaderboardsApi.getSuggestedChallenges().then((r) => r.data.data),
    enabled: activeTab === 'challenges',
  });

  // Point breakdown (only when my_stats tab is active)
  const { data: pointBreakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['leaderboard', 'point-breakdown', period],
    queryFn: () => leaderboardsApi.getPointBreakdown(period).then((r) => r.data.data),
    enabled: activeTab === 'my_stats',
  });

  // Historical data (only when my_stats tab is active)
  const { data: historicalData, isLoading: historicalLoading } = useQuery({
    queryKey: ['leaderboard', 'historical', historicalPeriod],
    queryFn: () =>
      leaderboardsApi
        .getHistorical({ days: historicalPeriod === '7d' ? 7 : historicalPeriod === '30d' ? 30 : 90 })
        .then((r) => r.data.data),
    enabled: activeTab === 'my_stats',
  });

  // AI insights (only when my_stats tab is active)
  const { data: aiInsights } = useQuery({
    queryKey: ['leaderboard', 'ai-insights'],
    queryFn: () => leaderboardsApi.getAIInsights().then((r) => r.data.data),
    enabled: activeTab === 'my_stats',
  });

  // AI tips
  const { data: aiTips } = useQuery({
    queryKey: ['leaderboard', 'ai-tips'],
    queryFn: () => leaderboardsApi.getAITips().then((r) => r.data.data),
    enabled: activeTab === 'my_stats',
  });

  // Rank prediction
  const { data: rankPrediction } = useQuery({
    queryKey: ['leaderboard', 'rank-prediction'],
    queryFn: () => leaderboardsApi.getRankPrediction().then((r) => r.data.data),
    enabled: activeTab === 'my_stats',
  });

  // Join challenge mutation
  const joinChallengeMutation = useMutation({
    mutationFn: (id: number) => leaderboardsApi.joinChallenge(id),
    onSuccess: () => {
      message.success(t('leaderboard.joined_challenge', 'Joined challenge successfully!'));
      queryClient.invalidateQueries({ queryKey: ['leaderboard', 'challenges'] });
    },
    onError: () => {
      message.error(t('leaderboard.join_error', 'Failed to join challenge'));
    },
  });

  // Leave challenge mutation
  const leaveChallengeMutation = useMutation({
    mutationFn: (id: number) => leaderboardsApi.leaveChallenge(id),
    onSuccess: () => {
      message.success(t('leaderboard.left_challenge', 'Left challenge'));
      queryClient.invalidateQueries({ queryKey: ['leaderboard', 'challenges'] });
    },
    onError: () => {
      message.error(t('leaderboard.leave_error', 'Failed to leave challenge'));
    },
  });

  const entries = leaderboardData || [];
  const top3 = entries.slice(0, 3);
  const totalUsers = entries.length;

  const roleTabs = [
    { key: 'overall', label: t('common.all') },
    { key: 'inspectors', label: t('nav.inspectors', 'Inspectors') },
    { key: 'specialists', label: t('nav.specialists', 'Specialists') },
    { key: 'engineers', label: t('nav.engineers', 'Engineers') },
    { key: 'quality', label: t('nav.quality_engineers', 'Quality') },
  ];

  const mainTabs = [
    {
      key: 'rankings',
      label: (
        <Space>
          <TrophyOutlined />
          {t('leaderboard.rankings', 'Rankings')}
        </Space>
      ),
    },
    {
      key: 'my_stats',
      label: (
        <Space>
          <UserOutlined />
          {t('leaderboard.my_stats', 'My Stats')}
        </Space>
      ),
    },
    {
      key: 'achievements',
      label: (
        <Space>
          <StarOutlined />
          {t('leaderboard.achievements', 'Achievements')}
        </Space>
      ),
    },
    {
      key: 'challenges',
      label: (
        <Space>
          <ThunderboltOutlined />
          {t('leaderboard.challenges', 'Challenges')}
        </Space>
      ),
    },
  ];

  const renderRankingsTab = () => (
    <>
      {/* Role filter tabs */}
      <Tabs
        activeKey={roleFilter}
        onChange={(key) => setRoleFilter(key as RoleFilter)}
        items={roleTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
        style={{ marginBottom: 16 }}
      />

      {/* Top 3 Podium */}
      {top3.length >= 3 && <AnimatedPodium entries={top3} />}

      {/* Leaderboard Table */}
      <LeaderboardTable
        entries={entries}
        loading={leaderboardLoading}
        currentUserId={myRankData?.user_id}
        showTop3={false}
        pagination={{ pageSize: 20 }}
      />
    </>
  );

  const renderMyStatsTab = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        {/* Performance Chart */}
        <PerformanceChart
          data={historicalData || []}
          loading={historicalLoading}
          onPeriodChange={setHistoricalPeriod}
        />

        {/* Point Breakdown */}
        <div style={{ marginTop: 16 }}>
          <PointBreakdownChart data={pointBreakdown || []} loading={breakdownLoading} />
        </div>
      </Col>

      <Col xs={24} lg={8}>
        {/* AI Insights Panel */}
        <AIInsightsPanel
          insights={aiInsights || []}
          tips={aiTips}
          prediction={rankPrediction}
          loading={statsLoading}
        />
      </Col>
    </Row>
  );

  const renderAchievementsTab = () => (
    <AchievementGrid achievements={achievements || []} loading={achievementsLoading} />
  );

  const renderChallengesTab = () => (
    <ChallengeList
      challenges={challenges || []}
      suggestedChallenges={suggestedChallenges}
      loading={challengesLoading}
      onJoin={(id) => joinChallengeMutation.mutate(id)}
      onLeave={(id) => leaveChallengeMutation.mutate(id)}
      joiningId={joinChallengeMutation.isPending ? (joinChallengeMutation.variables as number) : undefined}
    />
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <Space>
          <TrophyOutlined style={{ fontSize: 24, color: '#ffd700' }} />
          <Title level={2} style={{ margin: 0 }}>
            {t('nav.leaderboard')}
          </Title>
        </Space>

        <PeriodSelector value={period} onChange={(p) => setPeriod(p as LeaderboardPeriod)} />
      </div>

      {/* User's rank card (sticky) */}
      {myRankData && (
        <UserRankCard
          entry={myRankData}
          stats={userStats || undefined}
          totalUsers={totalUsers}
          loading={myRankLoading}
        />
      )}

      {/* Main content */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          items={mainTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
        />

        <div style={{ marginTop: 16 }}>
          {activeTab === 'rankings' && renderRankingsTab()}
          {activeTab === 'my_stats' && renderMyStatsTab()}
          {activeTab === 'achievements' && renderAchievementsTab()}
          {activeTab === 'challenges' && renderChallengesTab()}
        </div>
      </Card>

      {/* Custom styles */}
      <style>{`
        .leaderboard-current-user-row {
          background-color: #e6f7ff !important;
        }
        .leaderboard-current-user-row:hover > td {
          background-color: #bae7ff !important;
        }
      `}</style>
    </div>
  );
}
