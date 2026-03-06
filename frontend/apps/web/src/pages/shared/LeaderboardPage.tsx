import { useState } from 'react';
import { Card, Tabs, Space, Typography, Row, Col, Spin, message, Progress, Segmented } from 'antd';
import { TrophyOutlined, UserOutlined, StarOutlined, ThunderboltOutlined, TeamOutlined, ToolOutlined } from '@ant-design/icons';
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
  EPIBreakdown,
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
import { useAuth } from '../../providers/AuthProvider';

const { Title, Text } = Typography;

type TabKey = 'rankings' | 'my_stats' | 'achievements' | 'challenges';
type PageView = 'field_staff' | 'engineers';
type FieldSubFilter = 'all' | 'inspectors' | 'specialists';
type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

/** Fetcher for the combined field staff (inspectors + specialists) */
const fieldStaffFetcher = async (params?: { period?: LeaderboardPeriod }): Promise<LeaderboardEntry[]> => {
  const [inspectors, specialists] = await Promise.all([
    leaderboardsApi.getInspectors(params).then((r) => r.data.data || []),
    leaderboardsApi.getSpecialists(params).then((r) => r.data.data || []),
  ]);
  // Merge & re-rank by total_points descending
  const merged = [...inspectors, ...specialists].sort((a, b) => b.total_points - a.total_points);
  return merged.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
};

type FetcherKey = 'all' | 'inspectors' | 'specialists' | 'engineers';
const fetchers: Record<FetcherKey, (params?: { period?: LeaderboardPeriod }) => Promise<LeaderboardEntry[]>> = {
  all: fieldStaffFetcher,
  inspectors: (p) => leaderboardsApi.getInspectors(p).then((r) => r.data.data || []),
  specialists: (p) => leaderboardsApi.getSpecialists(p).then((r) => r.data.data || []),
  engineers: (p) => leaderboardsApi.getEngineers(p).then((r) => r.data.data || []),
};

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('rankings');
  const [pageView, setPageView] = useState<PageView>('field_staff');
  const [fieldSubFilter, setFieldSubFilter] = useState<FieldSubFilter>('all');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [historicalPeriod, setHistoricalPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  // Determine active fetcher key based on page view + sub-filter
  const activeFetcherKey: FetcherKey = pageView === 'engineers' ? 'engineers' : fieldSubFilter;

  // Show Engineers tab only to engineers, quality engineers, and admins
  const canSeeEngineers = user && ['engineer', 'quality_engineer', 'admin'].includes(user.role);

  // Main leaderboard data
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['leaderboard', activeFetcherKey, period],
    queryFn: () => fetchers[activeFetcherKey]({ period }),
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

  // EPI data (only when my_stats tab is active)
  const { data: epiData, isLoading: epiLoading } = useQuery({
    queryKey: ['leaderboard', 'epi'],
    queryFn: () => leaderboardsApi.getMyEPI().then((r) => r.data.data),
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

  const pageViewOptions = [
    {
      value: 'field_staff' as PageView,
      label: (
        <Space>
          <TeamOutlined />
          {t('leaderboard.field_staff', 'Field Staff')}
        </Space>
      ),
    },
    ...(canSeeEngineers
      ? [
          {
            value: 'engineers' as PageView,
            label: (
              <Space>
                <ToolOutlined />
                {t('nav.engineers', 'Engineers')}
              </Space>
            ),
          },
        ]
      : []),
  ];

  const fieldSubTabs = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'inspectors', label: t('nav.inspectors', 'Inspectors') },
    { key: 'specialists', label: t('nav.specialists', 'Specialists') },
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
      {/* Page-level split: Field Staff vs Engineers */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={pageView}
          onChange={(val) => setPageView(val as PageView)}
          options={pageViewOptions}
          size="large"
        />
      </div>

      {/* Sub-filter tabs for Field Staff */}
      {pageView === 'field_staff' && (
        <Tabs
          activeKey={fieldSubFilter}
          onChange={(key) => setFieldSubFilter(key as FieldSubFilter)}
          items={fieldSubTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
          style={{ marginBottom: 16 }}
          size="small"
        />
      )}

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

  const epiComponents: { key: keyof Omit<EPIBreakdown, 'total_epi'>; label: string; color: string }[] = [
    { key: 'completion', label: t('leaderboard.epi_completion', 'Completion'), color: '#1677ff' },
    { key: 'quality', label: t('leaderboard.epi_quality', 'Quality'), color: '#52c41a' },
    { key: 'timeliness', label: t('leaderboard.epi_timeliness', 'Timeliness'), color: '#faad14' },
    { key: 'contribution', label: t('leaderboard.epi_contribution', 'Contribution'), color: '#722ed1' },
    { key: 'safety', label: t('leaderboard.epi_safety', 'Safety'), color: '#eb2f96' },
  ];

  const renderMyStatsTab = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        {/* EPI Score Card */}
        <Card
          title={
            <Space>
              <StarOutlined style={{ color: '#faad14' }} />
              <span>{t('leaderboard.epi_title', 'Employee Performance Index (EPI)')}</span>
            </Space>
          }
          loading={epiLoading}
          style={{ marginBottom: 16 }}
        >
          {epiData ? (
            <Row gutter={[24, 16]} align="middle">
              <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                <Progress
                  type="dashboard"
                  percent={epiData.total_epi}
                  format={(pct) => (
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>{pct}</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>/ 100</div>
                    </div>
                  )}
                  size={140}
                  strokeColor={{
                    '0%': '#1677ff',
                    '100%': '#52c41a',
                  }}
                />
                <Text strong style={{ display: 'block', marginTop: 8, fontSize: 14 }}>
                  {t('leaderboard.total_epi', 'Total EPI')}
                </Text>
              </Col>
              <Col xs={24} sm={16}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {epiComponents.map(({ key, label, color }) => (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13 }}>{label}</Text>
                        <Text strong style={{ fontSize: 13 }}>
                          {epiData[key]} / 20
                        </Text>
                      </div>
                      <Progress
                        percent={(epiData[key] / 20) * 100}
                        strokeColor={color}
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  ))}
                </Space>
              </Col>
            </Row>
          ) : (
            <Text type="secondary">{t('leaderboard.no_epi_data', 'No EPI data available yet.')}</Text>
          )}
        </Card>

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
