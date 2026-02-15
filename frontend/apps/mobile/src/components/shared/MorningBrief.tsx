/**
 * MorningBrief Component
 * Daily morning summary with AI-generated insights
 * Shows yesterday's recap, today's priorities, and alerts
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export interface DailyBriefData {
  /** Date of the brief */
  date: string;
  /** Greeting message */
  greeting: string;
  greetingAr?: string;

  /** Yesterday's recap */
  yesterdayRecap: {
    inspectionsCompleted: number;
    inspectionsTotal: number;
    defectsFound: number;
    defectsResolved: number;
    avgQualityScore: number;
    topPerformer?: string;
    notableEvent?: string;
    notableEventAr?: string;
  };

  /** Today's priorities */
  todayPriorities: Array<{
    id: string;
    title: string;
    titleAr?: string;
    priority: 'critical' | 'high' | 'medium';
    type: 'inspection' | 'job' | 'review' | 'defect' | 'meeting';
    dueTime?: string;
    assignee?: string;
  }>;

  /** Alerts and warnings */
  alerts: Array<{
    id: string;
    type: 'overdue' | 'sla_risk' | 'weather' | 'equipment' | 'team';
    message: string;
    messageAr?: string;
    severity: 'high' | 'medium' | 'low';
  }>;

  /** AI insight */
  aiInsight?: string;
  aiInsightAr?: string;

  /** Weather (if relevant for outdoor inspections) */
  weather?: {
    temp: number;
    condition: string;
    icon: string;
    advisory?: string;
    advisoryAr?: string;
  };

  /** Team availability */
  teamAvailability: {
    total: number;
    available: number;
    onLeave: number;
    onSite: number;
  };
}

export interface MorningBriefProps {
  /** Brief data */
  data: DailyBriefData | null;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Called when priority item is tapped */
  onPriorityPress?: (priorityId: string) => void;
  /** Called when alert is tapped */
  onAlertPress?: (alertId: string) => void;
  /** Called when "View All" is tapped for priorities */
  onViewAllPriorities?: () => void;
  /** Called when dismissed */
  onDismiss?: () => void;
}

const PRIORITY_ICONS = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
};

const TYPE_ICONS = {
  inspection: '🔍',
  job: '🔧',
  review: '📋',
  defect: '🐛',
  meeting: '📅',
};

const ALERT_ICONS = {
  overdue: '⏰',
  sla_risk: '⚡',
  weather: '🌤️',
  equipment: '🔧',
  team: '👥',
};

export function MorningBrief({
  data,
  isLoading = false,
  onPriorityPress,
  onAlertPress,
  onViewAllPriorities,
  onDismiss,
}: MorningBriefProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [isDismissed, setIsDismissed] = useState(false);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return isAr ? 'صباح الخير' : 'Good Morning';
    if (hour < 17) return isAr ? 'مساء الخير' : 'Good Afternoon';
    return isAr ? 'مساء الخير' : 'Good Evening';
  }, [isAr]);

  if (isDismissed) return null;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1677ff" />
        <Text style={[styles.loadingText, isAr && styles.rtlText]}>
          {isAr ? 'جاري تحضير ملخصك...' : 'Preparing your brief...'}
        </Text>
      </View>
    );
  }

  if (!data) return null;

  const completionRate = data.yesterdayRecap.inspectionsTotal > 0
    ? Math.round(
        (data.yesterdayRecap.inspectionsCompleted /
          data.yesterdayRecap.inspectionsTotal) *
          100
      )
    : 0;

  const highAlerts = data.alerts.filter((a) => a.severity === 'high');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isAr && styles.rtlRow]}>
        <View style={[styles.headerText, isAr && { alignItems: 'flex-end' }]}>
          <Text style={[styles.greetingText, isAr && styles.rtlText]}>
            ☀️ {data.greeting || greeting}
          </Text>
          <Text style={[styles.dateText, isAr && styles.rtlText]}>
            {new Date(data.date).toLocaleDateString(isAr ? 'ar' : 'en', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        {data.weather && (
          <View style={styles.weatherBox}>
            <Text style={styles.weatherIcon}>{data.weather.icon}</Text>
            <Text style={styles.weatherTemp}>{data.weather.temp}°</Text>
          </View>
        )}
        {onDismiss && (
          <TouchableOpacity
            onPress={() => {
              setIsDismissed(true);
              onDismiss();
            }}
            style={styles.dismissBtn}
          >
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Weather advisory */}
      {data.weather?.advisory && (
        <View style={styles.advisoryBox}>
          <Text style={[styles.advisoryText, isAr && styles.rtlText]}>
            {data.weather.icon}{' '}
            {isAr && data.weather.advisoryAr
              ? data.weather.advisoryAr
              : data.weather.advisory}
          </Text>
        </View>
      )}

      {/* High alerts banner */}
      {highAlerts.length > 0 && (
        <View style={styles.alertsBanner}>
          {highAlerts.map((alert) => (
            <TouchableOpacity
              key={alert.id}
              style={styles.alertItem}
              onPress={() => onAlertPress?.(alert.id)}
            >
              <Text style={[styles.alertText, isAr && styles.rtlText]}>
                {ALERT_ICONS[alert.type]}{' '}
                {isAr && alert.messageAr ? alert.messageAr : alert.message}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Yesterday's Recap */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>
          {isAr ? '📊 ملخص الأمس' : '📊 Yesterday\'s Recap'}
        </Text>
        <View style={styles.recapGrid}>
          <RecapStat
            icon="✅"
            value={`${data.yesterdayRecap.inspectionsCompleted}/${data.yesterdayRecap.inspectionsTotal}`}
            label={isAr ? 'فحوصات' : 'Inspections'}
            color={completionRate >= 80 ? '#52c41a' : completionRate >= 60 ? '#faad14' : '#f5222d'}
          />
          <RecapStat
            icon="🐛"
            value={`${data.yesterdayRecap.defectsResolved}/${data.yesterdayRecap.defectsFound}`}
            label={isAr ? 'عيوب حُلّت' : 'Defects Fixed'}
            color="#1677ff"
          />
          <RecapStat
            icon="⭐"
            value={`${data.yesterdayRecap.avgQualityScore}%`}
            label={isAr ? 'جودة' : 'Quality'}
            color={data.yesterdayRecap.avgQualityScore >= 80 ? '#52c41a' : '#faad14'}
          />
        </View>
        {data.yesterdayRecap.notableEvent && (
          <Text style={[styles.notableText, isAr && styles.rtlText]}>
            💡{' '}
            {isAr && data.yesterdayRecap.notableEventAr
              ? data.yesterdayRecap.notableEventAr
              : data.yesterdayRecap.notableEvent}
          </Text>
        )}
      </View>

      {/* Today's Priorities */}
      <View style={styles.section}>
        <View style={[styles.sectionHeader, isAr && styles.rtlRow]}>
          <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>
            {isAr ? '🎯 أولويات اليوم' : '🎯 Today\'s Priorities'}
          </Text>
          <Text style={styles.priorityCount}>{data.todayPriorities.length}</Text>
        </View>

        {data.todayPriorities.slice(0, 5).map((priority) => (
          <TouchableOpacity
            key={priority.id}
            style={[styles.priorityItem, isAr && styles.rtlRow]}
            onPress={() => onPriorityPress?.(priority.id)}
          >
            <Text style={styles.priorityIcon}>
              {PRIORITY_ICONS[priority.priority]}
            </Text>
            <Text style={styles.typeIcon}>
              {TYPE_ICONS[priority.type]}
            </Text>
            <Text
              style={[styles.priorityTitle, isAr && styles.rtlText]}
              numberOfLines={1}
            >
              {isAr && priority.titleAr ? priority.titleAr : priority.title}
            </Text>
            {priority.dueTime && (
              <Text style={styles.dueTime}>{priority.dueTime}</Text>
            )}
          </TouchableOpacity>
        ))}

        {data.todayPriorities.length > 5 && onViewAllPriorities && (
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={onViewAllPriorities}
          >
            <Text style={styles.viewAllText}>
              {isAr
                ? `عرض الكل (${data.todayPriorities.length})`
                : `View All (${data.todayPriorities.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Team Availability */}
      <View style={styles.teamRow}>
        <Text style={styles.teamIcon}>👥</Text>
        <Text style={[styles.teamText, isAr && styles.rtlText]}>
          {isAr
            ? `${data.teamAvailability.available} متاح من ${data.teamAvailability.total} · ${data.teamAvailability.onSite} في الموقع · ${data.teamAvailability.onLeave} إجازة`
            : `${data.teamAvailability.available}/${data.teamAvailability.total} available · ${data.teamAvailability.onSite} on-site · ${data.teamAvailability.onLeave} on leave`}
        </Text>
      </View>

      {/* AI Insight */}
      {data.aiInsight && (
        <View style={styles.aiBox}>
          <Text style={[styles.aiText, isAr && styles.rtlText]}>
            🤖{' '}
            {isAr && data.aiInsightAr ? data.aiInsightAr : data.aiInsight}
          </Text>
        </View>
      )}
    </View>
  );
}

function RecapStat({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.recapStat}>
      <Text style={styles.recapIcon}>{icon}</Text>
      <Text style={[styles.recapValue, { color }]}>{value}</Text>
      <Text style={styles.recapLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loadingContainer: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#8c8c8c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  greetingText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#262626',
  },
  dateText: {
    fontSize: 13,
    color: '#8c8c8c',
  },
  weatherBox: {
    alignItems: 'center',
    gap: 2,
  },
  weatherIcon: {
    fontSize: 24,
  },
  weatherTemp: {
    fontSize: 12,
    fontWeight: '600',
    color: '#595959',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    fontSize: 18,
    color: '#bfbfbf',
  },
  advisoryBox: {
    backgroundColor: '#e6f4ff',
    borderRadius: 8,
    padding: 8,
  },
  advisoryText: {
    fontSize: 12,
    color: '#1677ff',
  },
  alertsBanner: {
    backgroundColor: '#fff1f0',
    borderRadius: 8,
    padding: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#ffa39e',
  },
  alertItem: {
    paddingVertical: 2,
  },
  alertText: {
    fontSize: 12,
    color: '#cf1322',
    fontWeight: '500',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  priorityCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1677ff',
    backgroundColor: '#e6f4ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  recapGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  recapStat: {
    alignItems: 'center',
    gap: 2,
  },
  recapIcon: {
    fontSize: 16,
  },
  recapValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  recapLabel: {
    fontSize: 10,
    color: '#8c8c8c',
  },
  notableText: {
    fontSize: 12,
    color: '#595959',
    fontStyle: 'italic',
  },
  priorityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  priorityIcon: {
    fontSize: 10,
  },
  typeIcon: {
    fontSize: 14,
  },
  priorityTitle: {
    fontSize: 13,
    color: '#262626',
    flex: 1,
  },
  dueTime: {
    fontSize: 11,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  viewAllBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  viewAllText: {
    fontSize: 13,
    color: '#1677ff',
    fontWeight: '500',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
  },
  teamIcon: {
    fontSize: 16,
  },
  teamText: {
    fontSize: 12,
    color: '#595959',
    flex: 1,
  },
  aiBox: {
    backgroundColor: '#f0f5ff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d6e4ff',
  },
  aiText: {
    fontSize: 12,
    color: '#1677ff',
    lineHeight: 18,
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default MorningBrief;
