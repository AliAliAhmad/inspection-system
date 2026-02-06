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
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  defectsApi,
  usersApi,
  aiApi,
} from '@inspection/shared';
import type {
  Defect,
  DefectStatus,
  AssignSpecialistPayload,
} from '@inspection/shared';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E53935',
  high: '#FF9800',
  medium: '#FFC107',
  low: '#4CAF50',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#E53935',
  in_progress: '#1976D2',
  resolved: '#4CAF50',
  closed: '#757575',
  false_alarm: '#7B1FA2',
};

interface FilterOption {
  label: string;
  value: DefectStatus | null;
}

interface Specialist {
  id: number;
  full_name: string;
  role_id: string;
  specialization: string;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function DefectCard({
  defect,
  onAssign,
}: {
  defect: Defect;
  onAssign: (d: Defect) => void;
}) {
  const { t } = useTranslation();
  const severityColor = SEVERITY_COLORS[defect.severity] ?? '#757575';
  const statusColor = STATUS_COLORS[defect.status] ?? '#757575';

  const statusLabel = defect.status.replace(/_/g, ' ');
  const dueDateLabel = defect.created_at
    ? new Date(defect.created_at).toLocaleDateString()
    : null;

  const hasJob = !!(defect as any).specialist_job;
  const canAssign = !hasJob && defect.status !== 'closed' && defect.status !== 'resolved';

  return (
    <View style={styles.card}>
      <View style={styles.cardDescriptionRow}>
        <Text style={styles.cardDescription} numberOfLines={2}>
          {defect.description}
        </Text>
        {defect.occurrence_count > 1 && (
          <View style={styles.occurrenceBadge}>
            <Text style={styles.occurrenceBadgeText}>x{defect.occurrence_count}</Text>
          </View>
        )}
      </View>

      {defect.equipment && (
        <Text style={styles.equipmentText} numberOfLines={1}>
          {defect.equipment.name} — {defect.equipment.serial_number}
        </Text>
      )}

      <View style={styles.badgeRow}>
        <Badge label={defect.severity} color={severityColor} />
        <Badge label={statusLabel} color={statusColor} />
        {defect.category && (
          <Badge
            label={defect.category}
            color={defect.category === 'electrical' ? '#1565C0' : '#6D4C41'}
          />
        )}
      </View>

      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.priorityText}>
            Priority: <Text style={styles.priorityValue}>{defect.priority}</Text>
          </Text>
          {dueDateLabel && <Text style={styles.dateText}>{dueDateLabel}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.assignButton, !canAssign && styles.assignButtonDisabled]}
          onPress={() => onAssign(defect)}
          disabled={!canAssign}
        >
          <Text style={[styles.assignButtonText, !canAssign && styles.assignButtonTextDisabled]}>
            {hasJob ? t('defects.assigned', 'Assigned') : t('defects.assign', 'Assign')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DefectsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<DefectStatus | null>(null);
  const [page, setPage] = useState(1);

  // Assign modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<Specialist | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'minor' | 'major' | null>(null);
  const [majorReason, setMajorReason] = useState('');
  const [specialistPickerVisible, setSpecialistPickerVisible] = useState(false);

  // AI Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const filters: FilterOption[] = [
    { label: t('defects.filter_all', 'All'), value: null },
    { label: t('defects.filter_open', 'Open'), value: 'open' },
    { label: t('defects.filter_in_progress', 'In Progress'), value: 'in_progress' },
    { label: t('defects.filter_resolved', 'Resolved'), value: 'resolved' },
    { label: t('defects.filter_closed', 'Closed'), value: 'closed' },
    { label: t('defects.filter_false_alarm', 'False Alarm'), value: 'false_alarm' },
  ];

  const defectsQuery = useQuery({
    queryKey: ['defects', activeFilter, page],
    queryFn: () =>
      defectsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter } : {}),
      }),
  });

  // Fetch specialists when assign modal is open
  const specialistsQuery = useQuery({
    queryKey: ['users', 'specialists'],
    queryFn: () => usersApi.list({ role: 'specialist', per_page: 200, is_active: true }),
    enabled: assignModalVisible,
  });

  const specialists: Specialist[] =
    (specialistsQuery.data?.data as any)?.data ??
    (specialistsQuery.data?.data as any) ??
    [];

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignSpecialistPayload }) =>
      defectsApi.assignSpecialist(id, payload),
    onSuccess: (res) => {
      const job = (res.data as any)?.data;
      queryClient.invalidateQueries({ queryKey: ['defects'] });
      setAssignModalVisible(false);
      setSelectedDefect(null);
      setSelectedSpecialist(null);
      setSelectedCategory(null);
      setMajorReason('');
      Alert.alert(
        t('common.success', 'Success'),
        t('defects.assignSuccess', `Specialist job ${job?.job_id || ''} created`)
      );
    },
    onError: (err: any) => {
      Alert.alert(
        t('common.error', 'Error'),
        err?.response?.data?.message || t('defects.assignError', 'Failed to assign specialist')
      );
    },
  });

  const responseData = (defectsQuery.data?.data as any) ?? defectsQuery.data;
  const defects: Defect[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleFilterChange = useCallback((value: DefectStatus | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    defectsQuery.refetch();
  }, [defectsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !defectsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, defectsQuery.isFetching]);

  const handleAssignPress = (defect: Defect) => {
    setSelectedDefect(defect);
    setSelectedSpecialist(null);
    setSelectedCategory(null);
    setMajorReason('');
    setAssignModalVisible(true);
  };

  const handleAssignSubmit = () => {
    if (!selectedDefect || !selectedSpecialist) {
      Alert.alert(t('common.error', 'Error'), 'Please select a specialist');
      return;
    }
    if (selectedCategory === 'major' && !majorReason.trim()) {
      Alert.alert(t('common.error', 'Error'), 'Please provide a reason for major category');
      return;
    }
    const payload: AssignSpecialistPayload = {
      specialist_id: selectedSpecialist.id,
      ...(selectedCategory ? { category: selectedCategory } : {}),
      ...(selectedCategory === 'major' && majorReason ? { major_reason: majorReason } : {}),
    };
    assignMutation.mutate({ id: selectedDefect.id, payload });
  };

  const handleSearchSimilar = async () => {
    if (!searchQuery.trim()) {
      Alert.alert(t('common.error', 'Error'), 'Please enter a search query');
      return;
    }
    setIsSearching(true);
    try {
      const response = await aiApi.searchSimilarDefects(searchQuery.trim(), 10);
      const results = (response.data as any)?.data?.results || [];
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert(t('common.info', 'Info'), t('defects.noSimilarFound', 'No similar defects found'));
      }
    } catch (error) {
      Alert.alert(t('common.error', 'Error'), t('defects.searchError', 'Failed to search'));
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  if (defectsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('defects.title', 'Defects')}</Text>
        <TouchableOpacity
          style={styles.aiSearchButton}
          onPress={() => setSearchModalVisible(true)}
        >
          <Text style={styles.aiSearchButtonText}>AI Search</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;
          return (
            <TouchableOpacity
              key={filter.label}
              style={[
                styles.filterChip,
                isActive ? styles.filterChipActive : styles.filterChipInactive,
              ]}
              onPress={() => handleFilterChange(filter.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Defect List */}
      <FlatList
        data={defects}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <DefectCard defect={item} onAssign={handleAssignPress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={defectsQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          defectsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('defects.empty', 'No defects found.')}
            </Text>
          </View>
        }
      />

      {/* Assign Specialist Modal */}
      <Modal visible={assignModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setAssignModalVisible(false);
                setSelectedDefect(null);
              }}
            >
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('defects.assignSpecialist', 'Assign Specialist')}</Text>
            <TouchableOpacity onPress={handleAssignSubmit} disabled={assignMutation.isPending}>
              {assignMutation.isPending ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <Text style={styles.modalSave}>{t('common.assign', 'Assign')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedDefect && (
              <View style={styles.defectInfo}>
                <Text style={styles.defectInfoTitle}>Defect #{selectedDefect.id}</Text>
                <Text style={styles.defectInfoDescription}>{selectedDefect.description}</Text>
                <View style={styles.defectInfoBadges}>
                  <Badge label={selectedDefect.severity} color={SEVERITY_COLORS[selectedDefect.severity] || '#757575'} />
                  {selectedDefect.category && (
                    <Badge
                      label={selectedDefect.category}
                      color={selectedDefect.category === 'mechanical' ? '#6D4C41' : '#1565C0'}
                    />
                  )}
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>{t('defects.specialist', 'Specialist')}</Text>
            {specialistsQuery.isLoading ? (
              <ActivityIndicator size="small" color="#1976D2" style={{ marginVertical: 16 }} />
            ) : (
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setSpecialistPickerVisible(true)}
              >
                <Text style={[styles.pickerButtonText, !selectedSpecialist && styles.placeholderText]}>
                  {selectedSpecialist
                    ? `${selectedSpecialist.full_name} (${selectedSpecialist.role_id})`
                    : 'Select specialist...'}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.fieldLabel}>{t('defects.jobCategory', 'Job Category')}</Text>
            <View style={styles.categoryRow}>
              <TouchableOpacity
                style={[styles.categoryButton, selectedCategory === null && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory(null)}
              >
                <Text style={[styles.categoryButtonText, selectedCategory === null && styles.categoryButtonTextActive]}>
                  None
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.categoryButton, selectedCategory === 'minor' && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory('minor')}
              >
                <Text style={[styles.categoryButtonText, selectedCategory === 'minor' && styles.categoryButtonTextActive]}>
                  Minor
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.categoryButton, selectedCategory === 'major' && styles.categoryButtonActiveMajor]}
                onPress={() => setSelectedCategory('major')}
              >
                <Text style={[styles.categoryButtonText, selectedCategory === 'major' && styles.categoryButtonTextActive]}>
                  Major
                </Text>
              </TouchableOpacity>
            </View>

            {selectedCategory === 'major' && (
              <>
                <Text style={styles.fieldLabel}>{t('defects.majorReason', 'Major Reason')}</Text>
                <TextInput
                  style={styles.textArea}
                  value={majorReason}
                  onChangeText={setMajorReason}
                  placeholder="Explain why this is a major job..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Specialist Picker Modal */}
      <Modal
        visible={specialistPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSpecialistPickerVisible(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>{t('defects.selectSpecialist', 'Select Specialist')}</Text>
              <TouchableOpacity onPress={() => setSpecialistPickerVisible(false)}>
                <Text style={styles.pickerModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={specialists}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.specialistOption}
                  onPress={() => {
                    setSelectedSpecialist(item);
                    setSpecialistPickerVisible(false);
                  }}
                >
                  <Text style={styles.specialistName}>{item.full_name}</Text>
                  <Text style={styles.specialistDetail}>
                    {item.role_id} • {item.specialization || 'N/A'}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.noSpecialistsText}>No specialists available</Text>
              }
              style={styles.specialistList}
            />
          </View>
        </View>
      </Modal>

      {/* AI Search Modal */}
      <Modal visible={searchModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setSearchModalVisible(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              <Text style={styles.modalCancel}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('defects.findSimilar', 'Find Similar Defects')}</Text>
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.searchHint}>
              Describe a defect or issue to find similar past defects using AI
            </Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="e.g., hydraulic leak in cylinder..."
                placeholderTextColor="#999"
                editable={!isSearching}
                onSubmitEditing={handleSearchSimilar}
              />
              <TouchableOpacity
                style={[styles.searchButton, isSearching && styles.searchButtonDisabled]}
                onPress={handleSearchSimilar}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.searchButtonText}>Search</Text>
                )}
              </TouchableOpacity>
            </View>

            {isSearching && (
              <View style={styles.searchingContainer}>
                <ActivityIndicator size="large" color="#1976D2" />
                <Text style={styles.searchingText}>Searching with AI...</Text>
              </View>
            )}

            {!isSearching && searchResults.length > 0 && (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <View style={styles.searchResultCard}>
                    <View style={styles.searchResultHeader}>
                      <Text style={styles.searchResultId}>#{item.id}</Text>
                      <Badge label={item.severity} color={SEVERITY_COLORS[item.severity] || '#757575'} />
                      <Badge label={item.status?.replace(/_/g, ' ')} color={STATUS_COLORS[item.status] || '#757575'} />
                      <Text style={styles.similarityText}>
                        {Math.round((item.similarity || 0) * 100)}% similar
                      </Text>
                    </View>
                    <Text style={styles.searchResultDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>
                )}
                style={styles.searchResultsList}
              />
            )}

            {!isSearching && searchResults.length === 0 && searchQuery && (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsText}>No similar defects found</Text>
              </View>
            )}
          </View>
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
  aiSearchButton: { backgroundColor: '#9C27B0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  aiSearchButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  filterScroll: { maxHeight: 48, paddingBottom: 4 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  filterChipInactive: { backgroundColor: '#fff', borderColor: '#BDBDBD' },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  filterChipTextInactive: { color: '#616161' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardDescriptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardDescription: { fontSize: 14, color: '#212121', lineHeight: 20, flex: 1, marginRight: 8 },
  occurrenceBadge: { backgroundColor: '#E53935', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, minWidth: 28, alignItems: 'center' },
  occurrenceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  equipmentText: { fontSize: 13, color: '#1565C0', fontWeight: '500', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priorityText: { fontSize: 12, color: '#757575' },
  priorityValue: { fontWeight: '600', color: '#424242', textTransform: 'capitalize' },
  dateText: { fontSize: 12, color: '#757575' },
  assignButton: { backgroundColor: '#1976D2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  assignButtonDisabled: { backgroundColor: '#BDBDBD' },
  assignButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  assignButtonTextDisabled: { color: '#757575' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalCancel: { fontSize: 16, color: '#757575' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  modalSave: { fontSize: 16, color: '#1976D2', fontWeight: '600' },
  modalContent: { padding: 16, flex: 1 },
  defectInfo: { backgroundColor: '#E3F2FD', padding: 14, borderRadius: 10, marginBottom: 16 },
  defectInfoTitle: { fontSize: 16, fontWeight: '700', color: '#1976D2', marginBottom: 6 },
  defectInfoDescription: { fontSize: 14, color: '#424242', marginBottom: 8 },
  defectInfoBadges: { flexDirection: 'row', gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6, marginTop: 16 },
  pickerButton: { backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerButtonText: { fontSize: 15, color: '#212121', flex: 1 },
  placeholderText: { color: '#999' },
  chevron: { fontSize: 12, color: '#757575', marginLeft: 8 },
  categoryRow: { flexDirection: 'row', gap: 10 },
  categoryButton: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center', backgroundColor: '#fff' },
  categoryButtonActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  categoryButtonActiveMajor: { backgroundColor: '#E53935', borderColor: '#E53935' },
  categoryButtonText: { fontSize: 14, fontWeight: '600', color: '#616161' },
  categoryButtonTextActive: { color: '#fff' },
  textArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 12, fontSize: 15, color: '#212121', textAlignVertical: 'top', minHeight: 100 },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  pickerModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  pickerModalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  pickerModalClose: { fontSize: 20, color: '#757575', paddingHorizontal: 8 },
  specialistList: { padding: 8 },
  specialistOption: { padding: 14, backgroundColor: '#f5f5f5', borderRadius: 8, marginBottom: 8 },
  specialistName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  specialistDetail: { fontSize: 13, color: '#757575', marginTop: 2 },
  noSpecialistsText: { fontSize: 14, color: '#757575', textAlign: 'center', padding: 24 },
  searchHint: { fontSize: 14, color: '#757575', marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#212121' },
  searchButton: { backgroundColor: '#9C27B0', paddingHorizontal: 20, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  searchButtonDisabled: { opacity: 0.6 },
  searchButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  searchingContainer: { alignItems: 'center', paddingVertical: 40 },
  searchingText: { fontSize: 14, color: '#757575', marginTop: 12 },
  searchResultsList: { flex: 1 },
  searchResultCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  searchResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  searchResultId: { fontSize: 14, fontWeight: '700', color: '#212121' },
  similarityText: { fontSize: 12, color: '#757575' },
  searchResultDescription: { fontSize: 14, color: '#424242', lineHeight: 20 },
  noResultsContainer: { alignItems: 'center', paddingVertical: 40 },
  noResultsText: { fontSize: 15, color: '#757575' },
});
