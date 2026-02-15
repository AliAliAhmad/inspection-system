/**
 * TeamLocationMap Component
 * Real-time team location map showing inspector positions
 * Uses a simple list-based view with coordinates (no external map dependency)
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export interface TeamMemberLocation {
  id: number;
  name: string;
  role: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  lastUpdated: string;
  status: 'active' | 'idle' | 'offline';
  currentTask?: string;
  equipmentName?: string;
  address?: string;
  speed?: number;
  batteryLevel?: number;
}

export interface GeoZone {
  id: string;
  name: string;
  nameAr?: string;
  type: 'work_site' | 'restricted' | 'safe_zone';
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface TeamLocationMapProps {
  /** Team member locations */
  members: TeamMemberLocation[];
  /** Geo zones for context */
  zones?: GeoZone[];
  /** Called when member card is tapped */
  onMemberPress?: (member: TeamMemberLocation) => void;
  /** Called when refresh is triggered */
  onRefresh?: () => void;
  /** Whether data is refreshing */
  isRefreshing?: boolean;
  /** Show distance from current user */
  showDistance?: boolean;
  /** Current user coordinates (for distance calculation) */
  userCoords?: { latitude: number; longitude: number };
}

const STATUS_COLORS = {
  active: '#52c41a',
  idle: '#faad14',
  offline: '#d9d9d9',
};

const STATUS_LABELS = {
  active: { en: 'Active', ar: 'نشط' },
  idle: { en: 'Idle', ar: 'خامل' },
  offline: { en: 'Offline', ar: 'غير متصل' },
};

const ZONE_CONFIG = {
  work_site: { color: '#1677ff', icon: '🏗️' },
  restricted: { color: '#f5222d', icon: '⛔' },
  safe_zone: { color: '#52c41a', icon: '✅' },
};

function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function getTimeAgo(dateStr: string, isAr: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return isAr ? 'الآن' : 'Just now';
  if (minutes < 60) return isAr ? `${minutes} دقيقة` : `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isAr ? `${hours} ساعة` : `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return isAr ? `${days} يوم` : `${days}d ago`;
}

export function TeamLocationMap({
  members,
  zones = [],
  onMemberPress,
  onRefresh,
  isRefreshing = false,
  showDistance = true,
  userCoords,
}: TeamLocationMapProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    let result = [...members];
    if (filterStatus) {
      result = result.filter((m) => m.status === filterStatus);
    }
    // Sort: active first, then by last updated
    result.sort((a, b) => {
      const statusOrder = { active: 0, idle: 1, offline: 2 };
      const orderDiff =
        (statusOrder[a.status] || 2) - (statusOrder[b.status] || 2);
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });
    return result;
  }, [members, filterStatus]);

  const statusCounts = useMemo(() => {
    const counts = { active: 0, idle: 0, offline: 0 };
    members.forEach((m) => counts[m.status]++);
    return counts;
  }, [members]);

  const openInMaps = useCallback((lat: number, lng: number) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}`,
      default: `https://maps.google.com/?q=${lat},${lng}`,
    });
    if (url) Linking.openURL(url);
  }, []);

  const renderMember = useCallback(
    ({ item }: { item: TeamMemberLocation }) => {
      const statusColor = STATUS_COLORS[item.status];
      const statusLabel = isAr
        ? STATUS_LABELS[item.status].ar
        : STATUS_LABELS[item.status].en;

      const distance =
        showDistance && userCoords
          ? getDistanceKm(
              userCoords.latitude,
              userCoords.longitude,
              item.latitude,
              item.longitude
            )
          : null;

      return (
        <TouchableOpacity
          style={styles.memberCard}
          onPress={() => onMemberPress?.(item)}
        >
          <View style={[styles.memberHeader, isAr && styles.rtlRow]}>
            {/* Avatar */}
            <View style={[styles.avatar, { borderColor: statusColor }]}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            </View>

            {/* Info */}
            <View style={[styles.memberInfo, isAr && { alignItems: 'flex-end' }]}>
              <Text style={[styles.memberName, isAr && styles.rtlText]}>
                {item.name}
              </Text>
              <Text style={[styles.memberStatus, { color: statusColor }]}>
                {statusLabel} · {getTimeAgo(item.lastUpdated, isAr)}
              </Text>
            </View>

            {/* Distance */}
            {distance !== null && (
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceText}>
                  📍 {formatDistance(distance)}
                </Text>
              </View>
            )}
          </View>

          {/* Task & location info */}
          {(item.currentTask || item.address) && (
            <View style={styles.memberDetails}>
              {item.currentTask && (
                <Text style={[styles.taskText, isAr && styles.rtlText]} numberOfLines={1}>
                  🔧 {item.currentTask}
                  {item.equipmentName ? ` — ${item.equipmentName}` : ''}
                </Text>
              )}
              {item.address && (
                <TouchableOpacity
                  onPress={() => openInMaps(item.latitude, item.longitude)}
                >
                  <Text style={[styles.addressText, isAr && styles.rtlText]} numberOfLines={1}>
                    📍 {item.address}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Battery & speed */}
          <View style={[styles.metaRow, isAr && styles.rtlRow]}>
            {item.batteryLevel !== undefined && (
              <Text
                style={[
                  styles.metaText,
                  { color: item.batteryLevel < 20 ? '#f5222d' : '#8c8c8c' },
                ]}
              >
                {item.batteryLevel < 20 ? '🪫' : '🔋'} {item.batteryLevel}%
              </Text>
            )}
            {item.speed !== undefined && item.speed > 0 && (
              <Text style={styles.metaText}>
                🚗 {Math.round(item.speed * 3.6)} km/h
              </Text>
            )}
            <Text style={styles.coordsText}>
              {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [isAr, showDistance, userCoords, onMemberPress, openInMaps]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isAr && styles.rtlRow]}>
        <Text style={[styles.title, isAr && styles.rtlText]}>
          {isAr ? '🗺️ مواقع الفريق' : '🗺️ Team Locations'}
        </Text>
        <Text style={styles.countText}>{members.length}</Text>
      </View>

      {/* Status filter chips */}
      <View style={[styles.filterRow, isAr && styles.rtlRow]}>
        <TouchableOpacity
          style={[styles.filterChip, !filterStatus && styles.filterChipActive]}
          onPress={() => setFilterStatus(null)}
        >
          <Text style={[styles.filterText, !filterStatus && styles.filterTextActive]}>
            {isAr ? 'الكل' : 'All'} ({members.length})
          </Text>
        </TouchableOpacity>
        {(Object.entries(statusCounts) as [keyof typeof STATUS_COLORS, number][]).map(
          ([status, count]) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterChip,
                filterStatus === status && styles.filterChipActive,
              ]}
              onPress={() =>
                setFilterStatus(filterStatus === status ? null : status)
              }
            >
              <View
                style={[
                  styles.filterDot,
                  { backgroundColor: STATUS_COLORS[status] },
                ]}
              />
              <Text
                style={[
                  styles.filterText,
                  filterStatus === status && styles.filterTextActive,
                ]}
              >
                {count}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Zones info */}
      {zones.length > 0 && (
        <View style={styles.zonesRow}>
          {zones.map((zone) => {
            const config = ZONE_CONFIG[zone.type];
            return (
              <View key={zone.id} style={[styles.zoneBadge, { borderColor: config.color }]}>
                <Text style={styles.zoneIcon}>{config.icon}</Text>
                <Text style={styles.zoneText}>
                  {isAr && zone.nameAr ? zone.nameAr : zone.name}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Members list */}
      <FlatList
        data={filteredMembers}
        renderItem={renderMember}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          ) : undefined
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {isAr ? 'لا توجد مواقع متاحة' : 'No locations available'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1677ff',
    backgroundColor: '#e6f4ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
  },
  filterChipActive: {
    backgroundColor: '#1677ff',
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterText: {
    fontSize: 12,
    color: '#595959',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  zonesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  zoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  zoneIcon: {
    fontSize: 12,
  },
  zoneText: {
    fontSize: 11,
    color: '#595959',
  },
  listContent: {
    gap: 8,
    paddingBottom: 16,
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#595959',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInfo: {
    flex: 1,
    gap: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  memberStatus: {
    fontSize: 11,
  },
  distanceBadge: {
    backgroundColor: '#f0f5ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  distanceText: {
    fontSize: 11,
    color: '#1677ff',
    fontWeight: '500',
  },
  memberDetails: {
    gap: 2,
    paddingLeft: 46,
  },
  taskText: {
    fontSize: 12,
    color: '#595959',
  },
  addressText: {
    fontSize: 11,
    color: '#1677ff',
    textDecorationLine: 'underline',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    paddingLeft: 46,
  },
  metaText: {
    fontSize: 10,
  },
  coordsText: {
    fontSize: 10,
    color: '#bfbfbf',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginLeft: 'auto',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
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

export default TeamLocationMap;
