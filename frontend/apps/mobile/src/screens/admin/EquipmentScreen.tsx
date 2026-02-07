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
import * as DocumentPicker from 'expo-document-picker';
import { equipmentApi } from '@inspection/shared';
import type { Equipment, EquipmentStatus, CreateEquipmentPayload, ImportResult, ImportLog } from '@inspection/shared';

const STATUS_COLORS: Record<EquipmentStatus, string> = {
  active: '#4CAF50',
  under_maintenance: '#FF9800',
  out_of_service: '#E53935',
  stopped: '#D32F2F',
  paused: '#FFC107',
};

const STATUSES: EquipmentStatus[] = ['active', 'under_maintenance', 'out_of_service', 'stopped', 'paused'];

interface FilterOption {
  label: string;
  value: string | null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label.replace(/_/g, ' ')}</Text>
    </View>
  );
}

function EquipmentCard({ equipment, onEdit }: { equipment: Equipment; onEdit: (e: Equipment) => void }) {
  const statusColor = STATUS_COLORS[equipment.status] ?? '#757575';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onEdit(equipment)} activeOpacity={0.7}>
      <Text style={styles.cardTitle}>{equipment.name}</Text>
      <Text style={styles.cardSubtitle}>{equipment.equipment_type}</Text>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Serial: </Text>
        <Text style={styles.cardValue}>{equipment.serial_number || '-'}</Text>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Location: </Text>
        <Text style={styles.cardValue}>{equipment.location || '-'}</Text>
      </View>

      {equipment.berth && (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Berth: </Text>
          <Text style={styles.cardValue}>{equipment.berth}</Text>
        </View>
      )}

      <View style={styles.badgeRow}>
        <Badge label={equipment.status} color={statusColor} />
      </View>
    </TouchableOpacity>
  );
}

export default function EquipmentScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [formData, setFormData] = useState<Partial<CreateEquipmentPayload>>({});

  // Import state
  const [importHistoryVisible, setImportHistoryVisible] = useState(false);
  const [importing, setImporting] = useState(false);

  const filters: FilterOption[] = [
    { label: t('equipment.filter_all', 'All'), value: null },
    { label: t('equipment.active', 'Active'), value: 'active' },
    { label: t('equipment.maintenance', 'Maintenance'), value: 'under_maintenance' },
    { label: t('equipment.out_of_service', 'Out of Service'), value: 'out_of_service' },
  ];

  const equipmentQuery = useQuery({
    queryKey: ['equipment', activeFilter, typeFilter, page, search],
    queryFn: () =>
      equipmentApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter } : {}),
        ...(typeFilter ? { equipment_type: typeFilter } : {}),
        ...(search ? { search } : {}),
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateEquipmentPayload) => equipmentApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setModalVisible(false);
      resetForm();
      Alert.alert(t('common.success', 'Success'), t('equipment.createSuccess', 'Equipment created'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('equipment.createError', 'Failed to create equipment'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateEquipmentPayload> }) =>
      equipmentApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setModalVisible(false);
      resetForm();
      Alert.alert(t('common.success', 'Success'), t('equipment.updateSuccess', 'Equipment updated'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('equipment.updateError', 'Failed to update equipment'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => equipmentApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setModalVisible(false);
      resetForm();
      Alert.alert(t('common.success', 'Success'), t('equipment.deleteSuccess', 'Equipment deleted'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('equipment.deleteError', 'Failed to delete equipment'));
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => equipmentApi.import(file),
    onSuccess: (response) => {
      const result = response.data.data as ImportResult;
      if (result) {
        Alert.alert(
          t('common.success', 'Success'),
          t('equipment.importSuccess', 'Created: {{created}}, Updated: {{updated}}, Failed: {{failed}}', {
            created: result.created.length,
            updated: result.updated.length,
            failed: result.failed.length,
          })
        );
      }
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setImporting(false);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Import failed';
      Alert.alert(t('common.error', 'Error'), msg);
      setImporting(false);
    },
  });

  // Import history query
  const { data: importHistoryData, isLoading: importHistoryLoading } = useQuery({
    queryKey: ['equipment-import-history'],
    queryFn: () => equipmentApi.getImportHistory(),
    enabled: importHistoryVisible,
  });

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImporting(true);
        // React Native FormData format - pass uri/type/name object directly
        const fileData = {
          uri: asset.uri,
          type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: asset.name || 'import.xlsx',
        };
        importMutation.mutate(fileData as any);
      }
    } catch (error) {
      Alert.alert(t('common.error', 'Error'), t('equipment.importPickError', 'Failed to pick file'));
    }
  };

  const responseData = (equipmentQuery.data?.data as any) ?? equipmentQuery.data;
  const items: Equipment[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const resetForm = () => {
    setFormData({});
    setEditingEquipment(null);
  };

  const handleFilterChange = useCallback((value: string | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    equipmentQuery.refetch();
  }, [equipmentQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !equipmentQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, equipmentQuery.isFetching]);

  const handleOpenCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (equipment: Equipment) => {
    setEditingEquipment(equipment);
    setFormData({
      name: equipment.name,
      equipment_type: equipment.equipment_type,
      serial_number: equipment.serial_number,
      location: equipment.location || undefined,
      status: equipment.status,
      berth: equipment.berth || undefined,
      manufacturer: equipment.manufacturer || undefined,
      model_number: equipment.model_number || undefined,
      installation_date: (equipment as any).installation_date || undefined,
    } as any);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.equipment_type || !formData.serial_number) {
      Alert.alert(t('common.error', 'Error'), t('equipment.requiredFields', 'Name, type, and serial number are required'));
      return;
    }
    if (editingEquipment) {
      updateMutation.mutate({ id: editingEquipment.id, payload: formData });
    } else {
      createMutation.mutate(formData as CreateEquipmentPayload);
    }
  };

  const handleDelete = () => {
    if (!editingEquipment) return;
    Alert.alert(
      t('equipment.deleteConfirm', 'Delete Equipment'),
      t('equipment.deleteMessage', 'Are you sure you want to delete this equipment?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.delete', 'Delete'), style: 'destructive', onPress: () => deleteMutation.mutate(editingEquipment.id) },
      ]
    );
  };

  if (equipmentQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.equipment', 'Equipment')}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.importButton}
            onPress={handleImport}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <Text style={styles.importButtonText}>{t('equipment.import', 'Import')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => setImportHistoryVisible(true)}
          >
            <Text style={styles.historyButtonText}>{t('equipment.history', 'History')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleOpenCreate}>
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('equipment.search', 'Search equipment...')}
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            setPage(1);
          }}
        />
        <TextInput
          style={[styles.searchInput, { marginTop: 8 }]}
          placeholder={t('equipment.filterType', 'Filter by type...')}
          value={typeFilter}
          onChangeText={(text) => {
            setTypeFilter(text);
            setPage(1);
          }}
        />
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

      {/* Equipment List */}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <EquipmentCard equipment={item} onEdit={handleOpenEdit} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={equipmentQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          equipmentQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('equipment.empty', 'No equipment found.')}</Text>
          </View>
        }
      />

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingEquipment ? t('equipment.edit', 'Edit Equipment') : t('equipment.create', 'Add Equipment')}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.modalSave}>{t('common.save', 'Save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('equipment.name', 'Name')} *</Text>
            <TextInput
              style={styles.input}
              value={formData.name || ''}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder={t('equipment.namePlaceholder', 'Equipment name')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.type', 'Type')} *</Text>
            <TextInput
              style={styles.input}
              value={formData.equipment_type || ''}
              onChangeText={(text) => setFormData({ ...formData, equipment_type: text })}
              placeholder={t('equipment.typePlaceholder', 'e.g. Crane, Pump')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.serialNumber', 'Serial Number')} *</Text>
            <TextInput
              style={styles.input}
              value={formData.serial_number || ''}
              onChangeText={(text) => setFormData({ ...formData, serial_number: text })}
              placeholder={t('equipment.serialPlaceholder', 'Serial number')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.location', 'Location')}</Text>
            <TextInput
              style={styles.input}
              value={formData.location || ''}
              onChangeText={(text) => setFormData({ ...formData, location: text })}
              placeholder={t('equipment.locationPlaceholder', 'Location')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.berth', 'Berth')}</Text>
            <TextInput
              style={styles.input}
              value={formData.berth || ''}
              onChangeText={(text) => setFormData({ ...formData, berth: text })}
              placeholder={t('equipment.berthPlaceholder', 'Berth number')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.status', 'Status')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusRow}>
              {STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusChip,
                    formData.status === status && { backgroundColor: STATUS_COLORS[status] },
                  ]}
                  onPress={() => setFormData({ ...formData, status })}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      formData.status === status && styles.statusChipTextActive,
                    ]}
                  >
                    {status.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>{t('equipment.manufacturer', 'Manufacturer')}</Text>
            <TextInput
              style={styles.input}
              value={formData.manufacturer || ''}
              onChangeText={(text) => setFormData({ ...formData, manufacturer: text })}
              placeholder={t('equipment.manufacturerPlaceholder', 'Manufacturer name')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.modelNumber', 'Model Number')}</Text>
            <TextInput
              style={styles.input}
              value={formData.model_number || ''}
              onChangeText={(text) => setFormData({ ...formData, model_number: text })}
              placeholder={t('equipment.modelPlaceholder', 'Model number')}
            />

            <Text style={styles.fieldLabel}>{t('equipment.installationDate', 'Installation Date')}</Text>
            <TextInput
              style={styles.input}
              value={(formData as any).installation_date || ''}
              onChangeText={(text) => setFormData({ ...formData, installation_date: text } as any)}
              placeholder="YYYY-MM-DD"
            />

            {editingEquipment && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>{t('common.delete', 'Delete Equipment')}</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Import History Modal */}
      <Modal visible={importHistoryVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setImportHistoryVisible(false)}>
              <Text style={styles.modalCancel}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('equipment.importHistory', 'Import History')}</Text>
            <View style={{ width: 50 }} />
          </View>
          {importHistoryLoading ? (
            <ActivityIndicator size="large" color="#1976D2" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={(importHistoryData?.data?.data || []) as ImportLog[]}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.historyCard}>
                  <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleString()}</Text>
                  <Text style={styles.historyFile}>{item.file_name}</Text>
                  <Text style={styles.historyAdmin}>By: {item.admin_name}</Text>
                  <View style={styles.historyStats}>
                    <Text style={styles.historyStatGreen}>Created: {item.created_count}</Text>
                    <Text style={styles.historyStatOrange}>Updated: {item.updated_count}</Text>
                    <Text style={styles.historyStatRed}>Failed: {item.failed_count}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{t('equipment.noImportHistory', 'No import history')}</Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  importButton: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#E3F2FD', borderRadius: 8 },
  importButtonText: { color: '#1976D2', fontSize: 13, fontWeight: '600' },
  historyButton: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#F5F5F5', borderRadius: 8 },
  historyButtonText: { color: '#616161', fontSize: 13, fontWeight: '500' },
  addButton: { backgroundColor: '#1976D2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0' },
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
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#212121', marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: '#757575', marginBottom: 8 },
  cardRow: { flexDirection: 'row', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
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
  input: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  statusRow: { flexDirection: 'row', marginTop: 4 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#BDBDBD', backgroundColor: '#fff', marginRight: 8 },
  statusChipText: { fontSize: 12, fontWeight: '500', color: '#616161', textTransform: 'capitalize' },
  statusChipTextActive: { color: '#fff' },
  deleteButton: { marginTop: 24, padding: 14, borderRadius: 8, backgroundColor: '#ffebee', alignItems: 'center' },
  deleteButtonText: { color: '#E53935', fontWeight: '600', fontSize: 15 },
  historyCard: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10 },
  historyDate: { fontSize: 12, color: '#757575', marginBottom: 4 },
  historyFile: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 4 },
  historyAdmin: { fontSize: 13, color: '#616161', marginBottom: 8 },
  historyStats: { flexDirection: 'row', gap: 16 },
  historyStatGreen: { color: '#4CAF50', fontSize: 13, fontWeight: '600' },
  historyStatOrange: { color: '#FF9800', fontSize: 13, fontWeight: '600' },
  historyStatRed: { color: '#E53935', fontSize: 13, fontWeight: '600' },
});
