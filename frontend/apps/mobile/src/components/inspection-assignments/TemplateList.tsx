import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi, AssignmentTemplate } from '@inspection/shared';

interface TemplateListProps {
  currentListId?: number;
  targetListId?: number;
  onTemplateApplied?: () => void;
  onClose?: () => void;
}

export function TemplateList({
  currentListId,
  targetListId,
  onTemplateApplied,
  onClose,
}: TemplateListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ['assignment-templates'],
    queryFn: () => inspectionAssignmentsApi.getTemplates().then((r) => r.data?.data || []),
  });

  // Save template mutation
  const saveMutation = useMutation({
    mutationFn: (values: { name: string; description?: string }) =>
      inspectionAssignmentsApi.saveTemplate(values.name, currentListId!, values.description),
    onSuccess: () => {
      Alert.alert(t('common.success', 'Success'), t('templates.save_success', 'Template saved successfully'));
      queryClient.invalidateQueries({ queryKey: ['assignment-templates'] });
      setSaveModalVisible(false);
      setTemplateName('');
      setTemplateDescription('');
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('common.error', 'Something went wrong'));
    },
  });

  // Apply template mutation
  const applyMutation = useMutation({
    mutationFn: (templateId: number) =>
      inspectionAssignmentsApi.applyTemplate(templateId, targetListId!),
    onSuccess: (res) => {
      const count = res.data?.data?.applied_count || 0;
      Alert.alert(
        t('common.success', 'Success'),
        t('templates.apply_success', `Applied template to ${count} assignments`)
      );
      onTemplateApplied?.();
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('common.error', 'Something went wrong'));
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: (templateId: number) => inspectionAssignmentsApi.deleteTemplate(templateId),
    onSuccess: () => {
      Alert.alert(t('common.success', 'Success'), t('templates.delete_success', 'Template deleted'));
      queryClient.invalidateQueries({ queryKey: ['assignment-templates'] });
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('common.error', 'Something went wrong'));
    },
  });

  const handleSave = () => {
    if (!templateName.trim()) {
      Alert.alert(t('common.error', 'Error'), t('templates.name_required', 'Name is required'));
      return;
    }
    saveMutation.mutate({ name: templateName.trim(), description: templateDescription.trim() || undefined });
  };

  const handleApply = (template: AssignmentTemplate) => {
    if (!targetListId) {
      Alert.alert(t('common.error', 'Error'), 'No target list selected');
      return;
    }
    Alert.alert(
      t('templates.apply_template', 'Apply Template'),
      `Apply "${template.name}" with ${template.items_count} assignments?`,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.apply', 'Apply'), onPress: () => applyMutation.mutate(template.id) },
      ]
    );
  };

  const handleDelete = (template: AssignmentTemplate) => {
    Alert.alert(
      t('templates.delete_confirm', 'Delete Template'),
      `Delete "${template.name}"?`,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.delete', 'Delete'), style: 'destructive', onPress: () => deleteMutation.mutate(template.id) },
      ]
    );
  };

  const renderTemplate = ({ item }: { item: AssignmentTemplate }) => (
    <View style={styles.templateCard}>
      <View style={styles.templateHeader}>
        <View style={styles.templateInfo}>
          <Text style={styles.templateName}>{item.name}</Text>
          {item.shift && (
            <View style={[styles.shiftBadge, { backgroundColor: item.shift === 'day' ? '#FFC107' : '#3F51B5' }]}>
              <Text style={styles.shiftText}>{item.shift}</Text>
            </View>
          )}
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{item.items_count}</Text>
        </View>
      </View>

      {item.description && (
        <Text style={styles.templateDescription} numberOfLines={2}>{item.description}</Text>
      )}

      <Text style={styles.createdBy}>
        {t('templates.created_by', 'Created by')} {item.created_by_name}
      </Text>

      <View style={styles.templateActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.applyButton]}
          onPress={() => handleApply(item)}
          disabled={!targetListId || applyMutation.isPending}
        >
          {applyMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.applyButtonText}>▶ {t('common.apply', 'Apply')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item)}
          disabled={deleteMutation.isPending}
        >
          <Text style={styles.deleteButtonText}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📋</Text>
          <Text style={styles.headerTitle}>{t('templates.title', 'Templates')}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.saveCurrentButton}
            onPress={() => setSaveModalVisible(true)}
            disabled={!currentListId}
          >
            <Text style={styles.saveCurrentButtonText}>+ Save Current</Text>
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : !templates || templates.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>{t('templates.no_templates', 'No templates saved yet')}</Text>
          <TouchableOpacity
            style={styles.createFirstButton}
            onPress={() => setSaveModalVisible(true)}
            disabled={!currentListId}
          >
            <Text style={styles.createFirstButtonText}>
              {t('templates.create_first', 'Create First Template')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTemplate}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Save Template Modal */}
      <Modal visible={saveModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('templates.save_template', 'Save as Template')}</Text>
              <TouchableOpacity onPress={() => setSaveModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('templates.name', 'Template Name')}</Text>
            <TextInput
              style={styles.textInput}
              value={templateName}
              onChangeText={setTemplateName}
              placeholder={t('templates.name_placeholder', 'e.g., Monday Morning Routine')}
              placeholderTextColor="#999"
            />

            <Text style={styles.fieldLabel}>{t('templates.description', 'Description')}</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={templateDescription}
              onChangeText={setTemplateDescription}
              placeholder={t('templates.description_placeholder', 'Optional description...')}
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>{t('common.save', 'Save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  saveCurrentButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  saveCurrentButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#757575',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 16,
  },
  createFirstButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createFirstButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  templateCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  templateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  shiftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  shiftText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  countBadge: {
    backgroundColor: '#E3F2FD',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
  },
  templateDescription: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 8,
  },
  createdBy: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 12,
  },
  templateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 12,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  modalClose: {
    fontSize: 20,
    color: '#757575',
    padding: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    fontSize: 15,
    color: '#212121',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default TemplateList;
