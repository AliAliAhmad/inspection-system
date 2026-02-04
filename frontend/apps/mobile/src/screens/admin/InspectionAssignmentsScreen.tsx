import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi } from '@inspection/shared';
import type { InspectionList } from '@inspection/shared';

const STATUS_COLORS: Record<string, string> = {
  draft: '#757575',
  published: '#1976D2',
  completed: '#4CAF50',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label.replace(/_/g, ' ')}</Text>
    </View>
  );
}

function ListCard({
  list,
  onPress,
}: {
  list: InspectionList;
  onPress: (l: InspectionList) => void;
}) {
  const statusColor = STATUS_COLORS[list.status] ?? '#757575';
  const assignmentsCount = list.assignments?.length ?? 0;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(list)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardId}>List #{list.id}</Text>
        <View style={styles.badgeRow}>
          <Badge label={list.status} color={statusColor} />
          <Badge label={list.shift} color={list.shift === 'day' ? '#1976D2' : '#7B1FA2'} />
        </View>
      </View>

      <Text style={styles.cardTitle}>
        {new Date(list.target_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </Text>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Assignments: </Text>
        <Text style={styles.cardValue}>{assignmentsCount}</Text>
      </View>

      {list.created_at && (
        <Text style={styles.dateText}>
          Created: {new Date(list.created_at).toLocaleDateString()}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function InspectionAssignmentsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedShift, setSelectedShift] = useState<'day' | 'night'>('day');
  const [generateModalVisible, setGenerateModalVisible] = useState(false);

  const listsQuery = useQuery({
    queryKey: ['inspection-lists', page],
    queryFn: () =>
      inspectionAssignmentsApi.getLists({ page, per_page: 20 }).then((r) => {
        const data = (r.data as any);
        return data;
      }),
  });

  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'day' | 'night' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
      setGenerateModalVisible(false);
      Alert.alert(t('common.success', 'Success'), t('assignments.generateSuccess', 'List generated'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('assignments.generateError', 'Failed to generate list'));
    },
  });

  const responseData = listsQuery.data;
  const lists: InspectionList[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleRefresh = useCallback(() => {
    setPage(1);
    listsQuery.refetch();
  }, [listsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !listsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, listsQuery.isFetching]);

  const handleGenerate = () => {
    const today = new Date().toISOString().split('T')[0];
    generateMutation.mutate({ target_date: today, shift: selectedShift });
  };

  const handleListPress = (list: InspectionList) => {
    // Could navigate to list detail screen
    Alert.alert(
      `List #${list.id}`,
      `${list.assignments?.length ?? 0} assignments for ${list.target_date} (${list.shift} shift)`
    );
  };

  if (listsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.inspectionAssignments', 'Assignment Lists')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setGenerateModalVisible(true)}>
          <Text style={styles.addButtonText}>+ {t('assignments.generate', 'Generate')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ListCard list={item} onPress={handleListPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={listsQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          listsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('assignments.empty', 'No assignment lists found.')}</Text>
          </View>
        }
      />

      {/* Generate Modal */}
      <Modal visible={generateModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setGenerateModalVisible(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('assignments.generate', 'Generate List')}</Text>
            <TouchableOpacity onPress={handleGenerate}>
              <Text style={styles.modalSave}>{t('common.generate', 'Generate')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('assignments.shift', 'Shift')}</Text>
            <View style={styles.shiftRow}>
              <TouchableOpacity
                style={[styles.shiftButton, selectedShift === 'day' && styles.shiftButtonActive]}
                onPress={() => setSelectedShift('day')}
              >
                <Text style={[styles.shiftButtonText, selectedShift === 'day' && styles.shiftButtonTextActive]}>
                  Day
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.shiftButton, selectedShift === 'night' && styles.shiftButtonActiveNight]}
                onPress={() => setSelectedShift('night')}
              >
                <Text style={[styles.shiftButtonText, selectedShift === 'night' && styles.shiftButtonTextActive]}>
                  Night
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.noteText}>
              This will generate an inspection assignment list for today's {selectedShift} shift based on the configured inspection schedule.
            </Text>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  addButton: { backgroundColor: '#1976D2', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardId: { fontSize: 14, fontWeight: '600', color: '#757575' },
  badgeRow: { flexDirection: 'row', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 8 },
  cardInfoRow: { flexDirection: 'row', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  dateText: { fontSize: 12, color: '#757575', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalCancel: { fontSize: 16, color: '#757575' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  modalSave: { fontSize: 16, color: '#1976D2', fontWeight: '600' },
  modalContent: { padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6, marginTop: 12 },
  shiftRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  shiftButton: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center', backgroundColor: '#fff' },
  shiftButtonActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  shiftButtonActiveNight: { backgroundColor: '#7B1FA2', borderColor: '#7B1FA2' },
  shiftButtonText: { fontSize: 14, fontWeight: '600', color: '#616161' },
  shiftButtonTextActive: { color: '#fff' },
  noteText: { fontSize: 14, color: '#616161', marginTop: 16, lineHeight: 20 },
});
