/**
 * KPIAlerts Component
 * KPI monitoring with threshold alerts
 * Displays key performance indicators with visual alerts when thresholds are breached
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export type KPIStatus = 'good' | 'warning' | 'critical';
export type KPITrend = 'up' | 'down' | 'stable';

export interface KPIDefinition {
  id: string;
  name: string;
  nameAr?: string;
  icon: string;
  /** Current value */
  value: number;
  /** Target/threshold value */
  target: number;
  /** Whether higher is better */
  higherIsBetter: boolean;
  /** Warning threshold percentage (e.g., 0.9 = 90% of target) */
  warningThreshold: number;
  /** Critical threshold percentage (e.g., 0.7 = 70% of target) */
  criticalThreshold: number;
  /** Unit for display */
  unit: string;
  /** Trend direction */
  trend: KPITrend;
  /** Change from last period */
  changePercent: number;
  /** Time period for this KPI */
  period?: string;
}

export interface KPIAlertsProps {
  /** KPI definitions with current values */
  kpis: KPIDefinition[];
  /** Called when a KPI card is tapped */
  onKPIPress?: (kpi: KPIDefinition) => void;
  /** Show only alerts (breached KPIs) */
  alertsOnly?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Number of columns */
  columns?: number;
}

function getKPIStatus(kpi: KPIDefinition): KPIStatus {
  const ratio = kpi.higherIsBetter
    ? kpi.value / kpi.target
    : kpi.target / kpi.value;

  if (ratio >= 1) return 'good';
  if (ratio >= kpi.warningThreshold) return 'warning';
  return 'critical';
}

const STATUS_CONFIG: Record<KPIStatus, { color: string; bg: string; icon: string }> = {
  good: { color: '#52c41a', bg: '#f6ffed', icon: '✅' },
  warning: { color: '#faad14', bg: '#fffbe6', icon: '⚠️' },
  critical: { color: '#f5222d', bg: '#fff1f0', icon: '🔴' },
};

const TREND_ICONS: Record<KPITrend, string> = {
  up: '📈',
  down: '📉',
  stable: '➡️',
};

export function KPIAlerts({
  kpis,
  onKPIPress,
  alertsOnly = false,
  compact = false,
  columns = 2,
}: KPIAlertsProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const processedKPIs = useMemo(() => {
    const withStatus = kpis.map((kpi) => ({
      ...kpi,
      status: getKPIStatus(kpi),
    }));

    if (alertsOnly) {
      return withStatus.filter((k) => k.status !== 'good');
    }

    // Sort: critical > warning > good
    const order: Record<KPIStatus, number> = { critical: 0, warning: 1, good: 2 };
    return withStatus.sort((a, b) => order[a.status] - order[b.status]);
  }, [kpis, alertsOnly]);

  const criticalCount = processedKPIs.filter((k) => k.status === 'critical').length;
  const warningCount = processedKPIs.filter((k) => k.status === 'warning').length;

  if (processedKPIs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>✅</Text>
        <Text style={[styles.emptyText, isAr && styles.rtlText]}>
          {isAr ? 'جميع المؤشرات ضمن الهدف' : 'All KPIs on target'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isAr && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isAr && styles.rtlText]}>
          {isAr ? '📊 مؤشرات الأداء' : '📊 KPI Monitor'}
        </Text>
        <View style={styles.headerBadges}>
          {criticalCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: '#fff1f0' }]}>
              <Text style={[styles.countText, { color: '#f5222d' }]}>
                🔴 {criticalCount}
              </Text>
            </View>
          )}
          {warningCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: '#fffbe6' }]}>
              <Text style={[styles.countText, { color: '#faad14' }]}>
                ⚠️ {warningCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* KPI Grid */}
      <View style={styles.grid}>
        {processedKPIs.map((kpi) => {
          const config = STATUS_CONFIG[kpi.status];
          const name = isAr && kpi.nameAr ? kpi.nameAr : kpi.name;
          const progressPct = kpi.higherIsBetter
            ? Math.min((kpi.value / kpi.target) * 100, 100)
            : Math.min((kpi.target / Math.max(kpi.value, 1)) * 100, 100);

          const trendColor =
            (kpi.higherIsBetter && kpi.trend === 'up') ||
            (!kpi.higherIsBetter && kpi.trend === 'down')
              ? '#52c41a'
              : kpi.trend === 'stable'
              ? '#8c8c8c'
              : '#f5222d';

          if (compact) {
            return (
              <TouchableOpacity
                key={kpi.id}
                style={[
                  styles.compactCard,
                  { backgroundColor: config.bg, borderColor: config.color },
                ]}
                onPress={() => onKPIPress?.(kpi)}
              >
                <Text style={styles.compactIcon}>{kpi.icon}</Text>
                <Text style={[styles.compactValue, { color: config.color }]}>
                  {kpi.value}{kpi.unit}
                </Text>
                <Text style={styles.compactName} numberOfLines={1}>
                  {name}
                </Text>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={kpi.id}
              style={[styles.kpiCard, { borderColor: config.color + '40' }]}
              onPress={() => onKPIPress?.(kpi)}
            >
              {/* KPI Header */}
              <View style={[styles.kpiHeader, isAr && styles.rtlRow]}>
                <Text style={styles.kpiIcon}>{kpi.icon}</Text>
                <Text
                  style={[styles.kpiName, isAr && styles.rtlText]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text style={styles.statusIcon}>{config.icon}</Text>
              </View>

              {/* Value */}
              <View style={styles.valueRow}>
                <Text style={[styles.kpiValue, { color: config.color }]}>
                  {kpi.value}
                  <Text style={styles.kpiUnit}>{kpi.unit}</Text>
                </Text>
                <Text style={styles.kpiTarget}>
                  / {kpi.target}{kpi.unit}
                </Text>
              </View>

              {/* Progress bar */}
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPct}%`,
                      backgroundColor: config.color,
                    },
                  ]}
                />
              </View>

              {/* Trend */}
              <View style={[styles.trendRow, isAr && styles.rtlRow]}>
                <Text style={styles.trendIcon}>{TREND_ICONS[kpi.trend]}</Text>
                <Text style={[styles.trendText, { color: trendColor }]}>
                  {kpi.changePercent > 0 ? '+' : ''}
                  {kpi.changePercent}%
                </Text>
                {kpi.period && (
                  <Text style={styles.periodText}>{kpi.period}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  countBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kpiIcon: {
    fontSize: 16,
  },
  kpiName: {
    fontSize: 11,
    color: '#595959',
    flex: 1,
  },
  statusIcon: {
    fontSize: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  kpiUnit: {
    fontSize: 12,
    fontWeight: '400',
  },
  kpiTarget: {
    fontSize: 12,
    color: '#bfbfbf',
  },
  progressBg: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendIcon: {
    fontSize: 12,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  periodText: {
    fontSize: 10,
    color: '#bfbfbf',
    marginLeft: 'auto',
  },
  compactCard: {
    alignItems: 'center',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    minWidth: 80,
    gap: 2,
  },
  compactIcon: {
    fontSize: 18,
  },
  compactValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  compactName: {
    fontSize: 9,
    color: '#595959',
    textAlign: 'center',
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

export default KPIAlerts;
