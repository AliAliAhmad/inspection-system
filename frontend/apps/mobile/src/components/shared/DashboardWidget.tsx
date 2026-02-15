/**
 * DashboardWidget Component
 * Team status and system health overview widget
 * Shows real-time team availability, workload, and system alerts
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export interface TeamMemberStatus {
  id: number;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'on_leave' | 'offline';
  currentTask?: string;
  completedToday: number;
  pendingToday: number;
}

export interface SystemHealth {
  apiStatus: 'healthy' | 'degraded' | 'down';
  dbStatus: 'healthy' | 'degraded' | 'down';
  syncStatus: 'synced' | 'syncing' | 'error';
  pendingSyncs: number;
  lastSyncAt?: string;
}

export interface DashboardStats {
  totalInspections: number;
  completedToday: number;
  pendingToday: number;
  overdueCount: number;
  defectsOpen: number;
  avgCompletionTime: number;
  completionRate: number;
}

export interface DashboardWidgetProps {
  /** Team member statuses */
  team: TeamMemberStatus[];
  /** System health info */
  health: SystemHealth;
  /** Stats summary */
  stats: DashboardStats;
  /** Called when team member is tapped */
  onMemberPress?: (member: TeamMemberStatus) => void;
  /** Called when stats section is tapped */
  onStatsPress?: () => void;
  /** Compact mode */
  compact?: boolean;
}

const STATUS_CONFIG = {
  active: { color: '#52c41a', icon: '🟢', label: 'Active', labelAr: 'نشط' },
  idle: { color: '#faad14', icon: '🟡', label: 'Idle', labelAr: 'خامل' },
  on_leave: { color: '#8c8c8c', icon: '⚪', label: 'Leave', labelAr: 'إجازة' },
  offline: { color: '#d9d9d9', icon: '⚫', label: 'Offline', labelAr: 'غير متصل' },
};

const HEALTH_CONFIG = {
  healthy: { color: '#52c41a', icon: '✅', label: 'Healthy', labelAr: 'سليم' },
  degraded: { color: '#faad14', icon: '⚠️', label: 'Degraded', labelAr: 'متدهور' },
  down: { color: '#f5222d', icon: '❌', label: 'Down', labelAr: 'متوقف' },
};

export function DashboardWidget({
  team,
  health,
  stats,
  onMemberPress,
  onStatsPress,
  compact = false,
}: DashboardWidgetProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const teamSummary = useMemo(() => {
    const counts = { active: 0, idle: 0, on_leave: 0, offline: 0 };
    team.forEach((m) => counts[m.status]++);
    return counts;
  }, [team]);

  const overallHealth =
    health.apiStatus === 'down' || health.dbStatus === 'down'
      ? 'down'
      : health.apiStatus === 'degraded' || health.dbStatus === 'degraded'
      ? 'degraded'
      : 'healthy';

  return (
    <View style={styles.container}>
      {/* Stats Row */}
      <TouchableOpacity
        style={styles.statsSection}
        onPress={onStatsPress}
        activeOpacity={0.7}
      >
        <View style={[styles.statsGrid]}>
          <StatBox
            icon="📋"
            value={stats.completedToday}
            total={stats.totalInspections}
            label={isAr ? 'مكتملة اليوم' : 'Completed'}
            color="#52c41a"
          />
          <StatBox
            icon="⏳"
            value={stats.pendingToday}
            label={isAr ? 'معلقة' : 'Pending'}
            color="#1677ff"
          />
          <StatBox
            icon="⚠️"
            value={stats.overdueCount}
            label={isAr ? 'متأخرة' : 'Overdue'}
            color={stats.overdueCount > 0 ? '#f5222d' : '#8c8c8c'}
          />
          <StatBox
            icon="🐛"
            value={stats.defectsOpen}
            label={isAr ? 'عيوب مفتوحة' : 'Open Defects'}
            color={stats.defectsOpen > 5 ? '#f5222d' : '#faad14'}
          />
        </View>

        {/* Completion Rate Bar */}
        <View style={styles.rateRow}>
          <Text style={[styles.rateLabel, isAr && styles.rtlText]}>
            {isAr ? 'معدل الإنجاز' : 'Completion Rate'}
          </Text>
          <View style={styles.rateBarBg}>
            <View
              style={[
                styles.rateBarFill,
                {
                  width: `${Math.min(stats.completionRate, 100)}%`,
                  backgroundColor:
                    stats.completionRate >= 80
                      ? '#52c41a'
                      : stats.completionRate >= 60
                      ? '#faad14'
                      : '#f5222d',
                },
              ]}
            />
          </View>
          <Text style={styles.rateValue}>{stats.completionRate}%</Text>
        </View>
      </TouchableOpacity>

      {!compact && (
        <>
          {/* Team Status */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>
              {isAr ? '👥 حالة الفريق' : '👥 Team Status'}
            </Text>

            {/* Team summary badges */}
            <View style={[styles.teamSummary, isAr && styles.rtlRow]}>
              {(Object.entries(teamSummary) as [keyof typeof STATUS_CONFIG, number][]).map(
                ([status, count]) =>
                  count > 0 ? (
                    <View key={status} style={styles.summaryBadge}>
                      <Text style={styles.summaryIcon}>
                        {STATUS_CONFIG[status].icon}
                      </Text>
                      <Text style={styles.summaryCount}>{count}</Text>
                      <Text style={styles.summaryLabel}>
                        {isAr
                          ? STATUS_CONFIG[status].labelAr
                          : STATUS_CONFIG[status].label}
                      </Text>
                    </View>
                  ) : null
              )}
            </View>

            {/* Team member list */}
            <View style={styles.teamList}>
              {team.slice(0, 6).map((member) => {
                const statusConfig = STATUS_CONFIG[member.status];
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.memberRow, isAr && styles.rtlRow]}
                    onPress={() => onMemberPress?.(member)}
                  >
                    <View
                      style={[
                        styles.memberAvatar,
                        { borderColor: statusConfig.color },
                      ]}
                    >
                      <Text style={styles.memberInitial}>
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.memberInfo, isAr && { alignItems: 'flex-end' }]}>
                      <Text style={[styles.memberName, isAr && styles.rtlText]}>
                        {member.name}
                      </Text>
                      <Text style={[styles.memberTask, isAr && styles.rtlText]} numberOfLines={1}>
                        {member.currentTask ||
                          (isAr ? statusConfig.labelAr : statusConfig.label)}
                      </Text>
                    </View>
                    <Text style={styles.memberStats}>
                      {member.completedToday}/{member.completedToday + member.pendingToday}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* System Health */}
          <View style={styles.section}>
            <View style={[styles.healthHeader, isAr && styles.rtlRow]}>
              <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>
                {isAr ? '🖥️ صحة النظام' : '🖥️ System Health'}
              </Text>
              <View
                style={[
                  styles.healthBadge,
                  { backgroundColor: HEALTH_CONFIG[overallHealth].color + '20' },
                ]}
              >
                <Text style={styles.healthBadgeIcon}>
                  {HEALTH_CONFIG[overallHealth].icon}
                </Text>
                <Text
                  style={[
                    styles.healthBadgeText,
                    { color: HEALTH_CONFIG[overallHealth].color },
                  ]}
                >
                  {isAr
                    ? HEALTH_CONFIG[overallHealth].labelAr
                    : HEALTH_CONFIG[overallHealth].label}
                </Text>
              </View>
            </View>

            <View style={styles.healthGrid}>
              <HealthItem
                label={isAr ? 'الخادم' : 'API'}
                status={health.apiStatus}
                isAr={isAr}
              />
              <HealthItem
                label={isAr ? 'قاعدة البيانات' : 'Database'}
                status={health.dbStatus}
                isAr={isAr}
              />
              <HealthItem
                label={isAr ? 'المزامنة' : 'Sync'}
                status={
                  health.syncStatus === 'synced'
                    ? 'healthy'
                    : health.syncStatus === 'syncing'
                    ? 'degraded'
                    : 'down'
                }
                extra={
                  health.pendingSyncs > 0
                    ? `${health.pendingSyncs} ${isAr ? 'معلق' : 'pending'}`
                    : undefined
                }
                isAr={isAr}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function StatBox({
  icon,
  value,
  total,
  label,
  color,
}: {
  icon: string;
  value: number;
  total?: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>
        {value}
        {total !== undefined && (
          <Text style={styles.statTotal}>/{total}</Text>
        )}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function HealthItem({
  label,
  status,
  extra,
  isAr,
}: {
  label: string;
  status: 'healthy' | 'degraded' | 'down';
  extra?: string;
  isAr: boolean;
}) {
  const config = HEALTH_CONFIG[status];
  return (
    <View style={[styles.healthItem, isAr && styles.rtlRow]}>
      <Text style={styles.healthItemIcon}>{config.icon}</Text>
      <Text style={[styles.healthItemLabel, isAr && styles.rtlText]}>
        {label}
      </Text>
      {extra && <Text style={styles.healthItemExtra}>{extra}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  statsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  statIcon: {
    fontSize: 18,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statTotal: {
    fontSize: 13,
    fontWeight: '400',
    color: '#bfbfbf',
  },
  statLabel: {
    fontSize: 10,
    color: '#8c8c8c',
    textAlign: 'center',
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateLabel: {
    fontSize: 11,
    color: '#8c8c8c',
    width: 80,
  },
  rateBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  rateBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  rateValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#262626',
    width: 36,
    textAlign: 'right',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  teamSummary: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryIcon: {
    fontSize: 10,
  },
  summaryCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#262626',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#8c8c8c',
  },
  teamList: {
    gap: 6,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  memberInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: '#595959',
  },
  memberInfo: {
    flex: 1,
    gap: 1,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#262626',
  },
  memberTask: {
    fontSize: 11,
    color: '#8c8c8c',
  },
  memberStats: {
    fontSize: 12,
    fontWeight: '600',
    color: '#595959',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  healthBadgeIcon: {
    fontSize: 12,
  },
  healthBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  healthGrid: {
    gap: 6,
  },
  healthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  healthItemIcon: {
    fontSize: 14,
  },
  healthItemLabel: {
    fontSize: 13,
    color: '#595959',
    flex: 1,
  },
  healthItemExtra: {
    fontSize: 11,
    color: '#8c8c8c',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default DashboardWidget;
