import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@inspection/shared';
import type { User, UserRole } from '@inspection/shared';

type RoleFilter = UserRole | 'all';
const ROLE_FILTERS: RoleFilter[] = ['all', 'admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];

const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#E53935',
  inspector: '#1976D2',
  specialist: '#FF9800',
  engineer: '#4CAF50',
  quality_engineer: '#7B1FA2',
};

const ROLE_OPTIONS: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
const SHIFT_OPTIONS = ['day', 'night'];
const LANGUAGE_OPTIONS = ['en', 'ar'];

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role: '' as UserRole,
    specialization: '',
    shift: '',
    language: '',
    is_active: true,
  });

  // Create modal state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    full_name: '',
    employee_id: '',
    role: 'inspector' as UserRole,
    specialization: '',
    shift: 'day',
    language: 'en',
  });

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['users', roleFilter, search, page],
    queryFn: () =>
      usersApi.list({
        ...(roleFilter !== 'all' && { role: roleFilter }),
        ...(search && { search }),
        page,
        per_page: 20,
      }),
  });

  const users: User[] = (data?.data as any)?.items ?? (data?.data as any)?.data ?? (data?.data as any) ?? [];
  const totalPages: number = (data?.data as any)?.total_pages ?? (data?.data as any)?.pages ?? 1;

  const createMutation = useMutation({
    mutationFn: (payload: any) => usersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateModalVisible(false);
      resetCreateForm();
      Alert.alert(t('common.success', 'Success'), t('users.created', 'User created successfully.'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('users.create_failed', 'Failed to create user.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: any }) =>
      usersApi.update(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditModalVisible(false);
      setEditingUser(null);
      Alert.alert(t('common.success', 'Success'), t('users.updated', 'User updated successfully.'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('users.update_failed', 'Failed to update user.'));
    },
  });

  const resetCreateForm = () => {
    setCreateForm({
      email: '',
      password: '',
      full_name: '',
      employee_id: '',
      role: 'inspector',
      specialization: '',
      shift: 'day',
      language: 'en',
    });
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name ?? '',
      email: user.email ?? '',
      role: user.role as UserRole,
      specialization: user.specialization ?? '',
      shift: user.shift ?? '',
      language: user.language ?? 'en',
      is_active: user.is_active !== false,
    });
    setEditModalVisible(true);
  };

  const handleCreate = () => {
    if (!createForm.email || !createForm.password || !createForm.full_name || !createForm.employee_id) {
      Alert.alert(t('common.error', 'Error'), t('common.fill_all_fields', 'Please fill in all required fields.'));
      return;
    }
    createMutation.mutate({
      email: createForm.email,
      password: createForm.password,
      full_name: createForm.full_name,
      employee_id: createForm.employee_id,
      role: createForm.role,
      ...(createForm.specialization && { specialization: createForm.specialization }),
      ...(createForm.shift && { shift: createForm.shift }),
      ...(createForm.language && { language: createForm.language }),
    });
  };

  const handleUpdate = () => {
    if (!editingUser) return;
    updateMutation.mutate({
      userId: editingUser.id,
      payload: {
        full_name: editForm.full_name,
        email: editForm.email,
        role: editForm.role,
        specialization: editForm.specialization || undefined,
        shift: editForm.shift || undefined,
        language: editForm.language || undefined,
        is_active: editForm.is_active,
      },
    });
  };

  const handleLoadMore = () => {
    if (page < totalPages) {
      setPage((prev) => prev + 1);
    }
  };

  const renderRoleFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {ROLE_FILTERS.map((role) => (
        <TouchableOpacity
          key={role}
          style={[styles.filterChip, roleFilter === role && styles.filterChipActive]}
          onPress={() => { setRoleFilter(role); setPage(1); }}
        >
          <Text style={[styles.filterChipText, roleFilter === role && styles.filterChipTextActive]}>
            {role === 'all' ? t('common.all', 'All') : t(`roles.${role}`, role)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderUserCard = useCallback(({ item }: { item: User }) => {
    const roleColor = ROLE_COLORS[item.role as UserRole] ?? '#757575';
    const isActive = item.is_active !== false;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openEditModal(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.nameRow}>
            <View style={[styles.activeDot, { backgroundColor: isActive ? '#4CAF50' : '#E53935' }]} />
            <Text style={styles.fullName} numberOfLines={1}>{item.full_name}</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
            <Text style={styles.roleBadgeText}>{t(`roles.${item.role}`, item.role)}</Text>
          </View>
        </View>

        <Text style={styles.emailText}>{item.email}</Text>
        {item.employee_id ? (
          <Text style={styles.detailText}>
            {t('users.employee_id', 'Employee ID')}: {item.employee_id}
          </Text>
        ) : null}
        {item.specialization ? (
          <Text style={styles.detailText}>
            {t('users.specialization', 'Specialization')}: {item.specialization}
          </Text>
        ) : null}
        {item.shift ? (
          <Text style={styles.detailText}>
            {t('users.shift', 'Shift')}: {item.shift}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }, [t]);

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('users.no_users', 'No Users Found')}</Text>
        <Text style={styles.emptySubtitle}>
          {t('users.no_users_message', 'Try adjusting your search or filters.')}
        </Text>
      </View>
    );
  };

  if (isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error', 'Error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('nav.users', 'Users')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.addButtonText}>{t('users.add_user', '+ Add User')}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={(val) => { setSearch(val); setPage(1); }}
          placeholder={t('common.search', 'Search...')}
          placeholderTextColor="#999"
        />
      </View>

      {renderRoleFilterChips()}

      <FlatList
        data={users}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderUserCard}
        contentContainerStyle={users.length === 0 ? styles.emptyListContainer : styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => { setPage(1); refetch(); }} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          page < totalPages ? (
            <ActivityIndicator size="small" color="#1976D2" style={{ paddingVertical: 16 }} />
          ) : null
        }
      />

      {/* Edit User Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{t('users.edit_user', 'Edit User')}</Text>

              <Text style={styles.fieldLabel}>{t('users.full_name', 'Full Name')}</Text>
              <TextInput
                style={styles.input}
                value={editForm.full_name}
                onChangeText={(v) => setEditForm((p) => ({ ...p, full_name: v }))}
              />

              <Text style={styles.fieldLabel}>{t('users.email', 'Email')}</Text>
              <TextInput
                style={styles.input}
                value={editForm.email}
                onChangeText={(v) => setEditForm((p) => ({ ...p, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>{t('users.role', 'Role')}</Text>
              <View style={styles.chipRow}>
                {ROLE_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, editForm.role === r && { backgroundColor: ROLE_COLORS[r] }]}
                    onPress={() => setEditForm((p) => ({ ...p, role: r }))}
                  >
                    <Text style={[styles.roleChipText, editForm.role === r && styles.roleChipTextActive]}>
                      {t(`roles.${r}`, r)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('users.specialization', 'Specialization')}</Text>
              <TextInput
                style={styles.input}
                value={editForm.specialization}
                onChangeText={(v) => setEditForm((p) => ({ ...p, specialization: v }))}
                placeholder={t('users.specialization_placeholder', 'e.g. mechanical, electrical')}
                placeholderTextColor="#999"
              />

              <Text style={styles.fieldLabel}>{t('users.shift', 'Shift')}</Text>
              <View style={styles.chipRow}>
                {SHIFT_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.shiftChip, editForm.shift === s && styles.shiftChipActive]}
                    onPress={() => setEditForm((p) => ({ ...p, shift: s }))}
                  >
                    <Text style={[styles.shiftChipText, editForm.shift === s && styles.shiftChipTextActive]}>
                      {t(`shifts.${s}`, s)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('users.language', 'Language')}</Text>
              <View style={styles.chipRow}>
                {LANGUAGE_OPTIONS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.langChip, editForm.language === l && styles.langChipActive]}
                    onPress={() => setEditForm((p) => ({ ...p, language: l }))}
                  >
                    <Text style={[styles.langChipText, editForm.language === l && styles.langChipTextActive]}>
                      {l === 'en' ? 'English' : 'Arabic'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>{t('users.active', 'Active')}</Text>
                <Switch
                  value={editForm.is_active}
                  onValueChange={(v) => setEditForm((p) => ({ ...p, is_active: v }))}
                  trackColor={{ false: '#ccc', true: '#81C784' }}
                  thumbColor={editForm.is_active ? '#4CAF50' : '#f4f3f4'}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, updateMutation.isPending && styles.disabledButton]}
                  onPress={handleUpdate}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>{t('common.save', 'Save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal visible={createModalVisible} animationType="slide" transparent onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{t('users.add_user', 'Add User')}</Text>

              <Text style={styles.fieldLabel}>{t('users.full_name', 'Full Name')} *</Text>
              <TextInput
                style={styles.input}
                value={createForm.full_name}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, full_name: v }))}
              />

              <Text style={styles.fieldLabel}>{t('users.email', 'Email')} *</Text>
              <TextInput
                style={styles.input}
                value={createForm.email}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>{t('users.password', 'Password')} *</Text>
              <TextInput
                style={styles.input}
                value={createForm.password}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, password: v }))}
                secureTextEntry
              />

              <Text style={styles.fieldLabel}>{t('users.employee_id', 'Employee ID')} *</Text>
              <TextInput
                style={styles.input}
                value={createForm.employee_id}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, employee_id: v }))}
              />

              <Text style={styles.fieldLabel}>{t('users.role', 'Role')}</Text>
              <View style={styles.chipRow}>
                {ROLE_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, createForm.role === r && { backgroundColor: ROLE_COLORS[r] }]}
                    onPress={() => setCreateForm((p) => ({ ...p, role: r }))}
                  >
                    <Text style={[styles.roleChipText, createForm.role === r && styles.roleChipTextActive]}>
                      {t(`roles.${r}`, r)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('users.specialization', 'Specialization')}</Text>
              <TextInput
                style={styles.input}
                value={createForm.specialization}
                onChangeText={(v) => setCreateForm((p) => ({ ...p, specialization: v }))}
                placeholder={t('users.specialization_placeholder', 'e.g. mechanical, electrical')}
                placeholderTextColor="#999"
              />

              <Text style={styles.fieldLabel}>{t('users.shift', 'Shift')}</Text>
              <View style={styles.chipRow}>
                {SHIFT_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.shiftChip, createForm.shift === s && styles.shiftChipActive]}
                    onPress={() => setCreateForm((p) => ({ ...p, shift: s }))}
                  >
                    <Text style={[styles.shiftChipText, createForm.shift === s && styles.shiftChipTextActive]}>
                      {t(`shifts.${s}`, s)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('users.language', 'Language')}</Text>
              <View style={styles.chipRow}>
                {LANGUAGE_OPTIONS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.langChip, createForm.language === l && styles.langChipActive]}
                    onPress={() => setCreateForm((p) => ({ ...p, language: l }))}
                  >
                    <Text style={[styles.langChipText, createForm.language === l && styles.langChipTextActive]}>
                      {l === 'en' ? 'English' : 'Arabic'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => { setCreateModalVisible(false); resetCreateForm(); }}
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, createMutation.isPending && styles.disabledButton]}
                  onPress={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>{t('common.create', 'Create')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterScroll: { maxHeight: 50 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
  },
  filterChipActive: { backgroundColor: '#1976D2' },
  filterChipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  listContent: { padding: 12 },
  emptyListContainer: { flexGrow: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  activeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  fullName: { fontSize: 16, fontWeight: '700', color: '#212121', flex: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  roleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  emailText: { fontSize: 13, color: '#616161', marginBottom: 4 },
  detailText: { fontSize: 12, color: '#757575', marginBottom: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#212121', marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#fafafa',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
  },
  roleChipText: { fontSize: 12, fontWeight: '500', color: '#555' },
  roleChipTextActive: { color: '#fff' },
  shiftChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e8e8e8' },
  shiftChipActive: { backgroundColor: '#1976D2' },
  shiftChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  shiftChipTextActive: { color: '#fff' },
  langChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e8e8e8' },
  langChipActive: { backgroundColor: '#1976D2' },
  langChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  langChipTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#424242' },
  submitButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    minWidth: 80,
    alignItems: 'center',
  },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  disabledButton: { opacity: 0.6 },
});
