/**
 * TrendingAlerts Component
 * Detects and displays recurring inspection patterns and trends
 * Shows alerts when repeated failures or anomalies are detected
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export type TrendSeverity = 'critical' | 'warning' | 'info';
export type TrendType = 'recurring_failure' | 'degrading_quality' | 'overdue_pattern' | 'anomaly' | 'improvement';

export interface TrendAlert {
  id: string;
  type: TrendType;
  severity: TrendSeverity;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  /** Equipment or area involved */
  subject: string;
  /** Number of occurrences */
  occurrences: number;
  /** Time span in days */
  timeSpanDays: number;
  /** When first detected */
  firstDetected: string;
  /** Whether user has acknowledged */
  acknowledged: boolean;
  /** Suggested action */
  suggestion?: string;
  suggestionAr?: string;
}

export interface TrendingAlertsProps {
  /** List of trend alerts */
  alerts: TrendAlert[];
  /** Called when alert is acknowledged */
  onAcknowledge?: (alertId: string) => void;
  /** Called when alert action is taken */
  onAction?: (alert: TrendAlert) => void;
  /** Show acknowledged alerts */
  showAcknowledged?: boolean;
  /** Maximum alerts to show initially */
  maxVisible?: number;
  /** Compact mode for embedding in other screens */
  compact?: boolean;
}

const SEVERITY_CONFIG: Record<TrendSeverity, { color: string; bg: string; border: string; icon: string }> = {
  critical: { color: '#cf1322', bg: '#fff1f0', border: '#ffa39e', icon: '🔴' },
  warning: { color: '#d48806', bg: '#fffbe6', border: '#ffe58f', icon: '🟡' },
  info: { color: '#1677ff', bg: '#e6f4ff', border: '#91caff', icon: '🔵' },
};

const TYPE_ICONS: Record<TrendType, string> = {
  recurring_failure: '🔄',
  degrading_quality: '📉',
  overdue_pattern: '⏰',
  anomaly: '⚡',
  improvement: '📈',
};

export function TrendingAlerts({
  alerts,
  onAcknowledge,
  onAction,
  showAcknowledged = false,
  maxVisible = 5,
  compact = false,
}: TrendingAlertsProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [showAll, setShowAll] = useState(false);

  const filteredAlerts = useMemo(() => {
    let filtered = showAcknowledged
      ? alerts
      : alerts.filter((a) => !a.acknowledged);

    // Sort by severity: critical > warning > info
    const severityOrder: Record<TrendSeverity, number> = { critical: 0, warning: 1, info: 2 };
    filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return showAll ? filtered : filtered.slice(0, maxVisible);
  }, [alerts, showAcknowledged, showAll, maxVisible]);

  const totalUnacknowledged = alerts.filter((a) => !a.acknowledged).length;
  const hasMore = !showAll && alerts.length > maxVisible;

  const renderAlert = useCallback(
    ({ item }: { item: TrendAlert }) => {
      const severity = SEVERITY_CONFIG[item.severity];
      const typeIcon = TYPE_ICONS[item.type];
      const title = isAr && item.titleAr ? item.titleAr : item.title;
      const description = isAr && item.descriptionAr ? item.descriptionAr : item.description;
      const suggestion = isAr && item.suggestionAr ? item.suggestionAr : item.suggestion;

      return (
        <View
          style={[
            styles.alertCard,
            {
              backgroundColor: severity.bg,
              borderColor: severity.border,
            },
            item.acknowledged && styles.acknowledgedCard,
          ]}
        >
          <View style={[styles.alertHeader, isAr && styles.rtlRow]}>
            <Text style={styles.typeIcon}>{typeIcon}</Text>
            <Text style={styles.severityIcon}>{severity.icon}</Text>
            <Text
              style={[
                styles.alertTitle,
                { color: severity.color },
                isAr && styles.rtlText,
              ]}
              numberOfLines={compact ? 1 : 2}
            >
              {title}
            </Text>
          </View>

          {!compact && (
            <>
              <Text style={[styles.alertDescription, isAr && styles.rtlText]}>
                {description}
              </Text>

              <View style={[styles.metaRow, isAr && styles.rtlRow]}>
                <Text style={styles.metaText}>
                  📍 {item.subject}
                </Text>
                <Text style={styles.metaText}>
                  ×{item.occurrences} {isAr ? 'في' : 'in'} {item.timeSpanDays}{isAr ? ' يوم' : 'd'}
                </Text>
              </View>

              {suggestion && (
                <View style={styles.suggestionBox}>
                  <Text style={[styles.suggestionText, isAr && styles.rtlText]}>
                    💡 {suggestion}
                  </Text>
                </View>
              )}
            </>
          )}

          <View style={[styles.actionRow, isAr && styles.rtlRow]}>
            {!item.acknowledged && onAcknowledge && (
              <TouchableOpacity
                style={styles.ackButton}
                onPress={() => onAcknowledge(item.id)}
              >
                <Text style={styles.ackButtonText}>
                  {isAr ? 'تمت الملاحظة' : 'Acknowledge'}
                </Text>
              </TouchableOpacity>
            )}
            {onAction && (
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: severity.color }]}
                onPress={() => onAction(item)}
              >
                <Text style={[styles.actionButtonText, { color: severity.color }]}>
                  {isAr ? 'اتخاذ إجراء' : 'Take Action'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [isAr, compact, onAcknowledge, onAction]
  );

  if (filteredAlerts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>✅</Text>
        <Text style={[styles.emptyText, isAr && styles.rtlText]}>
          {isAr ? 'لا توجد تنبيهات اتجاهات' : 'No trending alerts'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isAr && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isAr && styles.rtlText]}>
          {isAr ? '📊 تنبيهات الاتجاهات' : '📊 Trending Alerts'}
        </Text>
        {totalUnacknowledged > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalUnacknowledged}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={filteredAlerts}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
      />

      {hasMore && (
        <TouchableOpacity
          style={styles.showMoreButton}
          onPress={() => setShowAll(true)}
        >
          <Text style={styles.showMoreText}>
            {isAr
              ? `عرض ${alerts.length - maxVisible} المزيد`
              : `Show ${alerts.length - maxVisible} more`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  badge: {
    backgroundColor: '#f5222d',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    gap: 8,
  },
  alertCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  acknowledgedCard: {
    opacity: 0.6,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeIcon: {
    fontSize: 16,
  },
  severityIcon: {
    fontSize: 10,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  alertDescription: {
    fontSize: 13,
    color: '#595959',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaText: {
    fontSize: 11,
    color: '#8c8c8c',
  },
  suggestionBox: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 6,
    padding: 8,
  },
  suggestionText: {
    fontSize: 12,
    color: '#595959',
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  ackButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ackButtonText: {
    fontSize: 12,
    color: '#595959',
    fontWeight: '500',
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  showMoreButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  showMoreText: {
    fontSize: 13,
    color: '#1677ff',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 24,
  },
  emptyText: {
    fontSize: 14,
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

export default TrendingAlerts;
