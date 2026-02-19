import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rosterApi, leavesApi } from '@inspection/shared';
import type { RosterWeekUser } from '@inspection/shared';

const ROLE_COLORS: Record<string, string> = {
  inspector: '#1976D2',
  specialist: '#FF9800',
  engineer: '#4CAF50',
  quality_engineer: '#7B1FA2',
  admin: '#E53935',
};

const SHIFT_DISPLAY: Record<string, { label: string; color: string }> = {
  day: { label: 'D', color: '#1976D2' },
  night: { label: 'N', color: '#7B1FA2' },
  off: { label: 'Off', color: '#757575' },
  leave: { label: 'L', color: '#E53935' },
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function ShiftCell({ shift }: { shift: string | undefined }) {
  if (!shift) return <Text style={styles.shiftEmpty}>-</Text>;
  const display = SHIFT_DISPLAY[shift] ?? { label: shift, color: '#757575' };
  return (
    <View style={[styles.shiftCell, { backgroundColor: display.color }]}>
      <Text style={styles.shiftCellText}>{display.label}</Text>
    </View>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatDateShort(dateStr: string): { day: string; date: string } {
  const d = new Date(dateStr);
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'short' }),
    date: d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' }),
  };
}

interface UserCardProps {
  user: RosterWeekUser;
  dates: string[];
  onPress: (user: RosterWeekUser) => void;
}

function UserCard({ user, dates, onPress }: UserCardProps) {
  const roleColor = ROLE_COLORS[user.role] ?? '#757575';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(user)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user.full_name}</Text>
          <View style={styles.roleRow}>
            <Badge label={user.role} color={roleColor} />
            {user.specialization && (
              <Text style={styles.specText}>{user.specialization}</Text>
            )}
          </View>
        </View>
        <View style={styles.leaveInfo}>
          <Text style={styles.leaveLabel}>Balance</Text>
          <Text style={[styles.leaveValue, user.leave_remaining === 0 && styles.leaveZero]}>
            {user.leave_remaining ?? '-'}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesRow}>
        {dates.map((date) => {
          const formatted = formatDateShort(date);
          return (
            <View key={date} style={styles.dateColumn}>
              <Text style={styles.dateDayText}>{formatted.day}</Text>
              <Text style={styles.dateDateText}>{formatted.date}</Text>
              <ShiftCell shift={user.entries[date]} />
            </View>
          );
        })}
      </ScrollView>
    </TouchableOpacity>
  );
}

export default function TeamRosterScreen() {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedUser, setSelectedUser] = useState<RosterWeekUser | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Calculate base date
  const today = new Date();
  const baseDate = new Date(today);
  baseDate.setDate(today.getDate() + weekOffset * 7);
  const baseDateStr = baseDate.toISOString().split('T')[0];

  const weekQuery = useQuery({
    queryKey: ['roster', 'week', baseDateStr],
    queryFn: () => rosterApi.getWeek(baseDateStr).then((r) => (r.data as any).data),
  });

  // Fetch leave balance for selected user
  const balanceQuery = useQuery({
    queryKey: ['leaves', 'balance', selectedUser?.id],
    queryFn: () => leavesApi.getBalance(selectedUser!.id).then((r) => (r.data as any).data ?? r.data.data),
    enabled: !!selectedUser?.id,
  });

  const users = weekQuery.data?.users ?? [];
  const dates = weekQuery.data?.dates ?? [];

  // Sort users by role
  const roleOrder: Record<string, number> = { inspector: 0, specialist: 1, engineer: 2, quality_engineer: 3 };
  const sortedUsers = [...users].sort(
    (a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99)
  );

  const handleRefresh = useCallback(() => {
    weekQuery.refetch();
  }, [weekQuery]);

  const handleUserPress = (user: RosterWeekUser) => {
    setSelectedUser(user);
    setDetailModalVisible(true);
  };

  // Date range display
  const rangeStart = dates.length > 0 ? formatDate(dates[0]) : '';
  const rangeEnd = dates.length > 0 ? formatDate(dates[dates.length - 1]) : '';

  if (weekQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.roster', 'Team Roster')}</Text>

      {/* Week Navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => setWeekOffset((o) => o - 1)}>
          <Text style={styles.navButtonText}>{'<'} Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navCenter} onPress={() => setWeekOffset(0)}>
          <Text style={styles.navDateText}>
            {rangeStart} - {rangeEnd}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => setWeekOffset((o) => o + 1)}>
          <Text style={styles.navButtonText}>Next {'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* User List */}
      <FlatList
        data={sortedUsers}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <UserCard user={item} dates={dates} onPress={handleUserPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={weekQuery.isRefetching} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('common.noData', 'No data available')}</Text>
          </View>
        }
      />

      {/* User Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setDetailModalVisible(false); setSelectedUser(null); }}>
              <Text style={styles.modalClose}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedUser?.full_name || 'User Details'}</Text>
            <View style={{ width: 50 }} />
          </View>

          {balanceQuery.isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#1976D2" />
            </View>
          ) : (
            <ScrollView style={styles.modalContent}>
              {/* User Info */}
              <View style={styles.infoCard}>
                <View style={styles.roleRow}>
                  <Badge label={selectedUser?.role || ''} color={ROLE_COLORS[selectedUser?.role || ''] ?? '#757575'} />
                  {selectedUser?.specialization && (
                    <Text style={styles.specText}>{selectedUser.specialization}</Text>
                  )}
                </View>
              </View>

              {/* Leave Balance */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('leaves.totalBalance', 'Total')}</Text>
                  <Text style={styles.statValue}>{balanceQuery.data?.total_balance ?? '-'}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('leaves.used', 'Used')}</Text>
                  <Text style={styles.statValue}>{balanceQuery.data?.used ?? '-'}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('leaves.remaining', 'Remaining')}</Text>
                  <Text style={[styles.statValue, (balanceQuery.data?.remaining ?? 0) === 0 && styles.leaveZero]}>
                    {balanceQuery.data?.remaining ?? '-'}
                  </Text>
                </View>
              </View>

              {/* Leave History */}
              <Text style={styles.sectionTitle}>{t('leaves.history', 'Leave History')}</Text>
              {(balanceQuery.data?.leaves ?? []).length === 0 ? (
                <Text style={styles.noHistory}>{t('leaves.noHistory', 'No leave history')}</Text>
              ) : (
                (balanceQuery.data?.leaves ?? []).map((leave: any, idx: number) => (
                  <View key={leave.id ?? idx} style={styles.leaveRow}>
                    <View style={styles.leaveRowHeader}>
                      <Badge label={leave.leave_type} color="#616161" />
                      <Badge
                        label={leave.status}
                        color={leave.status === 'approved' ? '#4CAF50' : leave.status === 'rejected' ? '#E53935' : '#FF9800'}
                      />
                    </View>
                    <Text style={styles.leaveDates}>
                      {new Date(leave.date_from).toLocaleDateString()} - {new Date(leave.date_to).toLocaleDateString()}
                    </Text>
                    <Text style={styles.leaveDays}>{leave.total_days} days</Text>
                    {leave.coverage_user && (
                      <Text style={styles.leaveCoverage}>
                        Coverage: {leave.coverage_user.full_name}
                      </Text>
                    )}
                  </View>
                ))
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  navButton: { paddingHorizontal: 12, paddingVertical: 8 },
  navButtonText: { fontSize: 14, color: '#1976D2', fontWeight: '600' },
  navCenter: { flex: 1, alignItems: 'center' },
  navDateText: { fontSize: 14, fontWeight: '600', color: '#212121' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#212121', marginBottom: 4 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specText: { fontSize: 12, color: '#757575' },
  leaveInfo: { alignItems: 'center' },
  leaveLabel: { fontSize: 11, color: '#757575' },
  leaveValue: { fontSize: 16, fontWeight: '700', color: '#212121' },
  leaveZero: { color: '#E53935' },
  datesRow: { marginTop: 8 },
  dateColumn: { alignItems: 'center', marginRight: 12, minWidth: 48 },
  dateDayText: { fontSize: 11, color: '#757575' },
  dateDateText: { fontSize: 10, color: '#9e9e9e', marginBottom: 4 },
  shiftCell: { width: 32, height: 24, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  shiftCellText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  shiftEmpty: { fontSize: 14, color: '#bdbdbd' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalClose: { fontSize: 16, color: '#1976D2' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  modalContent: { padding: 16 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  statsRow: { flexDirection: 'row', marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 12, marginRight: 8, alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#757575', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#212121' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#212121', marginBottom: 12 },
  noHistory: { fontSize: 14, color: '#9e9e9e', fontStyle: 'italic' },
  leaveRow: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
  leaveRowHeader: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  leaveDates: { fontSize: 13, color: '#424242', marginBottom: 2 },
  leaveDays: { fontSize: 12, color: '#757575' },
  leaveCoverage: { fontSize: 12, color: '#1976D2', marginTop: 4 },
});
