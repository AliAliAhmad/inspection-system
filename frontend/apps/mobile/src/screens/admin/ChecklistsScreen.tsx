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
  TextInput,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checklistsApi } from '@inspection/shared';
import type { ChecklistTemplate, ChecklistItem, CreateTemplatePayload, CreateChecklistItemPayload } from '@inspection/shared';

const ANSWER_TYPES = [
  { value: 'pass_fail', label: 'Pass / Fail' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'text', label: 'Text' },
];

const CATEGORIES = [
  { value: 'mechanical', label: 'Mechanical', color: '#1565C0' },
  { value: 'electrical', label: 'Electrical', color: '#FFC107' },
];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function ChecklistCard({
  template,
  onPress,
  onAddItem,
}: {
  template: ChecklistTemplate;
  onPress: (t: ChecklistTemplate) => void;
  onAddItem: (t: ChecklistTemplate) => void;
}) {
  const itemsCount = template.items?.length || 0;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(template)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{template.name}</Text>
          {template.description && (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {template.description}
            </Text>
          )}
        </View>
        <Badge
          label={template.is_active ? 'Active' : 'Inactive'}
          color={template.is_active ? '#4CAF50' : '#757575'}
        />
      </View>

      <View style={styles.cardMetaRow}>
        {template.function && (
          <Text style={styles.cardMeta}>Function: {template.function}</Text>
        )}
        {template.assembly && (
          <Text style={styles.cardMeta}>Assembly: {template.assembly}</Text>
        )}
        {template.part && (
          <Text style={styles.cardMeta}>Part: {template.part}</Text>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.itemsCount}>{itemsCount} items</Text>
        <TouchableOpacity style={styles.addItemButton} onPress={() => onAddItem(template)}>
          <Text style={styles.addItemButtonText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ChecklistItemRow({ item, onEdit }: { item: ChecklistItem; onEdit: (i: ChecklistItem) => void }) {
  const categoryColor = item.category === 'mechanical' ? '#1565C0' : item.category === 'electrical' ? '#FFC107' : '#757575';

  return (
    <TouchableOpacity style={styles.itemRow} onPress={() => onEdit(item)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemQuestion}>{item.question_text}</Text>
        {item.question_text_ar && (
          <Text style={styles.itemQuestionAr}>{item.question_text_ar}</Text>
        )}
      </View>
      <View style={styles.itemBadges}>
        <Badge label={item.answer_type.replace('_', ' ')} color="#1976D2" />
        {item.category && <Badge label={item.category} color={categoryColor} />}
        {item.critical_failure && <Badge label="Critical" color="#E53935" />}
      </View>
    </TouchableOpacity>
  );
}

export default function ChecklistsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Modal states
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  // Form states
  const [templateForm, setTemplateForm] = useState<Partial<CreateTemplatePayload>>({ is_active: true });
  const [itemForm, setItemForm] = useState<Partial<CreateChecklistItemPayload>>({ critical_failure: false });

  const checklistsQuery = useQuery({
    queryKey: ['checklists', page],
    queryFn: () => checklistsApi.listTemplates({ page, per_page: 20 }),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (payload: CreateTemplatePayload) => checklistsApi.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setTemplateModalVisible(false);
      setTemplateForm({ is_active: true });
      Alert.alert(t('common.success', 'Success'), t('checklists.templateCreated', 'Template created'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('checklists.templateCreateError', 'Failed to create template'));
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ templateId, payload }: { templateId: number; payload: CreateChecklistItemPayload }) =>
      checklistsApi.addItem(templateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setItemModalVisible(false);
      setItemForm({ critical_failure: false });
      setEditingItem(null);
      Alert.alert(t('common.success', 'Success'), t('checklists.itemAdded', 'Item added'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('checklists.itemAddError', 'Failed to add item'));
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ templateId, itemId, payload }: { templateId: number; itemId: number; payload: Partial<CreateChecklistItemPayload> }) =>
      checklistsApi.updateItem(templateId, itemId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setItemModalVisible(false);
      setItemForm({ critical_failure: false });
      setEditingItem(null);
      Alert.alert(t('common.success', 'Success'), t('checklists.itemUpdated', 'Item updated'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('checklists.itemUpdateError', 'Failed to update item'));
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ templateId, itemId }: { templateId: number; itemId: number }) =>
      checklistsApi.deleteItem(templateId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setItemModalVisible(false);
      setItemForm({ critical_failure: false });
      setEditingItem(null);
      Alert.alert(t('common.success', 'Success'), t('checklists.itemDeleted', 'Item deleted'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('checklists.itemDeleteError', 'Failed to delete item'));
    },
  });

  const responseData = (checklistsQuery.data?.data as any) ?? checklistsQuery.data;
  const templates: ChecklistTemplate[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleRefresh = useCallback(() => {
    setPage(1);
    checklistsQuery.refetch();
  }, [checklistsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !checklistsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, checklistsQuery.isFetching]);

  const handleTemplatePress = (template: ChecklistTemplate) => {
    setExpandedId(expandedId === template.id ? null : template.id);
  };

  const handleAddItem = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    setEditingItem(null);
    setItemForm({ critical_failure: false });
    setItemModalVisible(true);
  };

  const handleEditItem = (template: ChecklistTemplate, item: ChecklistItem) => {
    setSelectedTemplate(template);
    setEditingItem(item);
    setItemForm({
      question_text: item.question_text,
      question_text_ar: item.question_text_ar || undefined,
      answer_type: item.answer_type,
      category: item.category || undefined,
      critical_failure: item.critical_failure,
    });
    setItemModalVisible(true);
  };

  const handleSaveTemplate = () => {
    if (!templateForm.name || !templateForm.function || !templateForm.assembly || !templateForm.description) {
      Alert.alert(t('common.error', 'Error'), t('checklists.requiredFields', 'Please fill all required fields'));
      return;
    }
    createTemplateMutation.mutate(templateForm as CreateTemplatePayload);
  };

  const handleSaveItem = () => {
    if (!selectedTemplate || !itemForm.question_text || !itemForm.answer_type) {
      Alert.alert(t('common.error', 'Error'), t('checklists.itemRequired', 'Question and answer type are required'));
      return;
    }
    if (editingItem) {
      updateItemMutation.mutate({
        templateId: selectedTemplate.id,
        itemId: editingItem.id,
        payload: itemForm as Partial<CreateChecklistItemPayload>,
      });
    } else {
      addItemMutation.mutate({
        templateId: selectedTemplate.id,
        payload: itemForm as CreateChecklistItemPayload,
      });
    }
  };

  const handleDeleteItem = () => {
    if (!selectedTemplate || !editingItem) return;
    Alert.alert(
      t('checklists.deleteItemConfirm', 'Delete Item'),
      t('checklists.deleteItemMessage', 'Are you sure?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => deleteItemMutation.mutate({ templateId: selectedTemplate.id, itemId: editingItem.id }),
        },
      ]
    );
  };

  if (checklistsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.checklists', 'Checklists')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setTemplateModalVisible(true)}>
          <Text style={styles.addButtonText}>+ {t('checklists.createTemplate', 'Template')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={templates}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View>
            <ChecklistCard
              template={item}
              onPress={handleTemplatePress}
              onAddItem={handleAddItem}
            />
            {expandedId === item.id && item.items && item.items.length > 0 && (
              <View style={styles.itemsContainer}>
                {item.items.map((checklistItem) => (
                  <ChecklistItemRow
                    key={checklistItem.id}
                    item={checklistItem}
                    onEdit={(i) => handleEditItem(item, i)}
                  />
                ))}
              </View>
            )}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={checklistsQuery.isRefetching && page === 1} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          checklistsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('checklists.empty', 'No checklists found.')}</Text>
          </View>
        }
      />

      {/* Create Template Modal */}
      <Modal visible={templateModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTemplateModalVisible(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('checklists.createTemplate', 'Create Template')}</Text>
            <TouchableOpacity onPress={handleSaveTemplate}>
              <Text style={styles.modalSave}>{t('common.save', 'Save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('checklists.title', 'Title')} *</Text>
            <TextInput
              style={styles.input}
              value={templateForm.name || ''}
              onChangeText={(text) => setTemplateForm({ ...templateForm, name: text })}
              placeholder="Template name"
            />

            <Text style={styles.fieldLabel}>{t('checklists.function', 'Function')} *</Text>
            <TextInput
              style={styles.input}
              value={templateForm.function || ''}
              onChangeText={(text) => setTemplateForm({ ...templateForm, function: text })}
              placeholder="e.g. Pumping, Cooling"
            />

            <Text style={styles.fieldLabel}>{t('checklists.assembly', 'Assembly')} *</Text>
            <TextInput
              style={styles.input}
              value={templateForm.assembly || ''}
              onChangeText={(text) => setTemplateForm({ ...templateForm, assembly: text })}
              placeholder="e.g. Motor Assembly"
            />

            <Text style={styles.fieldLabel}>{t('checklists.part', 'Part')}</Text>
            <TextInput
              style={styles.input}
              value={templateForm.part || ''}
              onChangeText={(text) => setTemplateForm({ ...templateForm, part: text })}
              placeholder="e.g. Impeller (optional)"
            />

            <Text style={styles.fieldLabel}>{t('checklists.description', 'Description')} *</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={templateForm.description || ''}
              onChangeText={(text) => setTemplateForm({ ...templateForm, description: text })}
              placeholder="What this checklist covers"
              multiline
            />

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('checklists.active', 'Active')}</Text>
              <Switch
                value={templateForm.is_active ?? true}
                onValueChange={(value) => setTemplateForm({ ...templateForm, is_active: value })}
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Add/Edit Item Modal */}
      <Modal visible={itemModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setItemModalVisible(false); setEditingItem(null); }}>
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingItem ? t('checklists.editItem', 'Edit Item') : t('checklists.addItem', 'Add Item')}
            </Text>
            <TouchableOpacity onPress={handleSaveItem}>
              <Text style={styles.modalSave}>{t('common.save', 'Save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('checklists.question', 'Question')} *</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={itemForm.question_text || ''}
              onChangeText={(text) => setItemForm({ ...itemForm, question_text: text })}
              placeholder="Question text"
              multiline
            />

            <Text style={styles.fieldLabel}>{t('checklists.questionAr', 'Question (Arabic)')}</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={itemForm.question_text_ar || ''}
              onChangeText={(text) => setItemForm({ ...itemForm, question_text_ar: text })}
              placeholder="Arabic translation"
              multiline
            />

            <Text style={styles.fieldLabel}>{t('checklists.answerType', 'Answer Type')} *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {ANSWER_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.chip,
                    itemForm.answer_type === type.value && styles.chipActive,
                  ]}
                  onPress={() => setItemForm({ ...itemForm, answer_type: type.value as any })}
                >
                  <Text
                    style={[
                      styles.chipText,
                      itemForm.answer_type === type.value && styles.chipTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>{t('checklists.category', 'Category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !itemForm.category && styles.chipActive]}
                onPress={() => setItemForm({ ...itemForm, category: undefined })}
              >
                <Text style={[styles.chipText, !itemForm.category && styles.chipTextActive]}>None</Text>
              </TouchableOpacity>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.chip,
                    itemForm.category === cat.value && { backgroundColor: cat.color, borderColor: cat.color },
                  ]}
                  onPress={() => setItemForm({ ...itemForm, category: cat.value as any })}
                >
                  <Text
                    style={[
                      styles.chipText,
                      itemForm.category === cat.value && styles.chipTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('checklists.critical', 'Critical Failure')}</Text>
              <Switch
                value={itemForm.critical_failure ?? false}
                onValueChange={(value) => setItemForm({ ...itemForm, critical_failure: value })}
              />
            </View>

            {editingItem && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteItem}>
                <Text style={styles.deleteButtonText}>{t('common.delete', 'Delete Item')}</Text>
              </TouchableOpacity>
            )}

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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#212121', marginBottom: 4 },
  cardDescription: { fontSize: 13, color: '#757575', marginBottom: 8 },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  cardMeta: { fontSize: 12, color: '#616161' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  itemsCount: { fontSize: 13, color: '#757575' },
  addItemButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e3f2fd', borderRadius: 16 },
  addItemButtonText: { fontSize: 12, color: '#1976D2', fontWeight: '600' },
  itemsContainer: { marginTop: -8, marginBottom: 12, marginHorizontal: 8, backgroundColor: '#fafafa', borderRadius: 8, padding: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#fff', borderRadius: 8, marginBottom: 6 },
  itemQuestion: { fontSize: 14, color: '#212121', flex: 1 },
  itemQuestionAr: { fontSize: 12, color: '#757575', marginTop: 2 },
  itemBadges: { flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
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
  chipRow: { flexDirection: 'row', marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#BDBDBD', backgroundColor: '#fff', marginRight: 8 },
  chipActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#616161' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  deleteButton: { marginTop: 24, padding: 14, borderRadius: 8, backgroundColor: '#ffebee', alignItems: 'center' },
  deleteButtonText: { color: '#E53935', fontWeight: '600', fontSize: 15 },
});
