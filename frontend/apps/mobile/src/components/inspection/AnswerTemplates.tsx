import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Colors
const TEMPLATE_BLUE = '#1677ff';
const QUICK_ACTION_GREEN = '#52c41a';

export type AnswerCategory = 'general' | 'condition' | 'maintenance' | 'safety' | 'custom';
export type AnswerStatus = 'ok' | 'warning' | 'critical' | 'neutral';

export interface AnswerTemplate {
  id: string;
  text: string;
  textAr: string;
  category: AnswerCategory;
  status: AnswerStatus;
  isFavorite: boolean;
  usageCount: number;
  isCustom: boolean;
}

// Default pre-defined answer templates
const DEFAULT_TEMPLATES: AnswerTemplate[] = [
  // General OK responses
  {
    id: 'ok_no_issues',
    text: 'Equipment OK - No issues',
    textAr: 'المعدة بحالة جيدة - لا توجد مشاكل',
    category: 'general',
    status: 'ok',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'ok_normal_operation',
    text: 'Normal operation - All systems functional',
    textAr: 'تشغيل طبيعي - جميع الأنظمة تعمل',
    category: 'general',
    status: 'ok',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'ok_meets_specs',
    text: 'Meets specifications',
    textAr: 'مطابق للمواصفات',
    category: 'general',
    status: 'ok',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },

  // Condition assessments
  {
    id: 'condition_minor_wear',
    text: 'Minor wear - Monitor',
    textAr: 'تآكل بسيط - يتطلب مراقبة',
    category: 'condition',
    status: 'warning',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'condition_moderate_wear',
    text: 'Moderate wear - Schedule maintenance',
    textAr: 'تآكل متوسط - جدولة صيانة',
    category: 'condition',
    status: 'warning',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'condition_severe_wear',
    text: 'Severe wear - Requires immediate attention',
    textAr: 'تآكل شديد - يتطلب اهتمام فوري',
    category: 'condition',
    status: 'critical',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },

  // Maintenance related
  {
    id: 'maint_requires',
    text: 'Requires maintenance',
    textAr: 'يتطلب صيانة',
    category: 'maintenance',
    status: 'warning',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'maint_lubrication',
    text: 'Requires lubrication',
    textAr: 'يتطلب تشحيم',
    category: 'maintenance',
    status: 'warning',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'maint_cleaning',
    text: 'Requires cleaning',
    textAr: 'يتطلب تنظيف',
    category: 'maintenance',
    status: 'warning',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'maint_adjustment',
    text: 'Requires adjustment',
    textAr: 'يتطلب ضبط',
    category: 'maintenance',
    status: 'warning',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'maint_replacement',
    text: 'Part replacement needed',
    textAr: 'يحتاج استبدال قطعة',
    category: 'maintenance',
    status: 'critical',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },

  // Safety related
  {
    id: 'safety_stop',
    text: 'Critical - Stop operation',
    textAr: 'حرج - أوقف التشغيل',
    category: 'safety',
    status: 'critical',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'safety_hazard',
    text: 'Safety hazard detected',
    textAr: 'تم اكتشاف خطر على السلامة',
    category: 'safety',
    status: 'critical',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
  {
    id: 'safety_guard_missing',
    text: 'Safety guard missing/damaged',
    textAr: 'واقي السلامة مفقود/تالف',
    category: 'safety',
    status: 'critical',
    isFavorite: false,
    usageCount: 0,
    isCustom: false,
  },
];

const STORAGE_KEY = '@inspection_answer_templates';

// Hook for managing templates
export function useAnswerTemplates() {
  const [templates, setTemplates] = useState<AnswerTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load templates from storage
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const storedData = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedData) {
          const parsed = JSON.parse(storedData);
          // Merge with defaults (in case new defaults were added)
          const merged = [...DEFAULT_TEMPLATES];
          parsed.forEach((stored: AnswerTemplate) => {
            const existingIndex = merged.findIndex(t => t.id === stored.id);
            if (existingIndex >= 0) {
              merged[existingIndex] = { ...merged[existingIndex], ...stored };
            } else if (stored.isCustom) {
              merged.push(stored);
            }
          });
          setTemplates(merged);
        } else {
          setTemplates(DEFAULT_TEMPLATES);
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
        setTemplates(DEFAULT_TEMPLATES);
      }
      setIsLoading(false);
    };
    loadTemplates();
  }, []);

  // Save templates to storage
  const saveTemplates = useCallback(async (newTemplates: AnswerTemplate[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newTemplates));
      setTemplates(newTemplates);
    } catch (error) {
      console.error('Failed to save templates:', error);
    }
  }, []);

  // Add custom template
  const addTemplate = useCallback(async (text: string, textAr: string, category: AnswerCategory) => {
    const newTemplate: AnswerTemplate = {
      id: `custom_${Date.now()}`,
      text,
      textAr,
      category,
      status: 'neutral',
      isFavorite: false,
      usageCount: 0,
      isCustom: true,
    };
    const newTemplates = [...templates, newTemplate];
    await saveTemplates(newTemplates);
    return newTemplate;
  }, [templates, saveTemplates]);

  // Update template (favorite, usage count)
  const updateTemplate = useCallback(async (id: string, updates: Partial<AnswerTemplate>) => {
    const newTemplates = templates.map(t =>
      t.id === id ? { ...t, ...updates } : t
    );
    await saveTemplates(newTemplates);
  }, [templates, saveTemplates]);

  // Delete custom template
  const deleteTemplate = useCallback(async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (template && !template.isCustom) {
      return; // Can't delete default templates
    }
    const newTemplates = templates.filter(t => t.id !== id);
    await saveTemplates(newTemplates);
  }, [templates, saveTemplates]);

  // Record usage (for smart suggestions)
  const recordUsage = useCallback(async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (template) {
      await updateTemplate(id, { usageCount: template.usageCount + 1 });
    }
  }, [templates, updateTemplate]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (template) {
      await updateTemplate(id, { isFavorite: !template.isFavorite });
    }
  }, [templates, updateTemplate]);

  // Get frequently used templates
  const frequentlyUsed = templates
    .filter(t => t.usageCount > 0)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);

  // Get favorites
  const favorites = templates.filter(t => t.isFavorite);

  return {
    templates,
    isLoading,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    recordUsage,
    toggleFavorite,
    frequentlyUsed,
    favorites,
  };
}

// Quick fill component for inspection wizard
export interface QuickFillProps {
  onSelect: (text: string) => void;
  questionType?: 'text' | 'numeric' | 'pass_fail' | 'yes_no';
  questionContext?: string; // Question text for smart suggestions
}

export function QuickFill({ onSelect, questionType = 'text', questionContext }: QuickFillProps) {
  const { i18n } = useTranslation();
  const { templates, recordUsage, frequentlyUsed, favorites } = useAnswerTemplates();
  const isArabic = i18n.language === 'ar';

  // Only show for text type questions
  if (questionType !== 'text') {
    return null;
  }

  // Get smart suggestions based on question context
  const getSuggestedTemplates = (): AnswerTemplate[] => {
    const contextLower = (questionContext || '').toLowerCase();

    // Check for safety-related keywords
    if (
      contextLower.includes('safety') ||
      contextLower.includes('guard') ||
      contextLower.includes('hazard') ||
      contextLower.includes('سلامة')
    ) {
      return templates.filter(t => t.category === 'safety');
    }

    // Check for condition-related keywords
    if (
      contextLower.includes('condition') ||
      contextLower.includes('wear') ||
      contextLower.includes('حالة') ||
      contextLower.includes('تآكل')
    ) {
      return templates.filter(t => t.category === 'condition');
    }

    // Check for maintenance-related keywords
    if (
      contextLower.includes('maintenance') ||
      contextLower.includes('lubrication') ||
      contextLower.includes('cleaning') ||
      contextLower.includes('صيانة') ||
      contextLower.includes('تشحيم')
    ) {
      return templates.filter(t => t.category === 'maintenance');
    }

    // Default: show frequently used or OK responses
    if (frequentlyUsed.length > 0) {
      return frequentlyUsed;
    }

    return templates.filter(t => t.status === 'ok').slice(0, 3);
  };

  const suggestedTemplates = getSuggestedTemplates();
  const displayTemplates = favorites.length > 0
    ? [...favorites.slice(0, 2), ...suggestedTemplates.slice(0, 3)]
    : suggestedTemplates.slice(0, 5);

  // Remove duplicates
  const uniqueTemplates = displayTemplates.filter(
    (t, i, self) => self.findIndex(x => x.id === t.id) === i
  );

  const handleSelect = (template: AnswerTemplate) => {
    recordUsage(template.id);
    onSelect(isArabic ? template.textAr : template.text);
  };

  return (
    <View style={styles.quickFillContainer}>
      <Text style={[styles.quickFillTitle, isArabic && styles.textRtl]}>
        {isArabic ? 'إجابات سريعة:' : 'Quick answers:'}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickFillScroll}
      >
        {uniqueTemplates.map((template) => (
          <TouchableOpacity
            key={template.id}
            style={[
              styles.quickFillChip,
              template.status === 'ok' && styles.chipOk,
              template.status === 'warning' && styles.chipWarning,
              template.status === 'critical' && styles.chipCritical,
              template.isFavorite && styles.chipFavorite,
            ]}
            onPress={() => handleSelect(template)}
            activeOpacity={0.7}
          >
            {template.isFavorite && <Text style={styles.favoriteIcon}></Text>}
            <Text
              style={[
                styles.quickFillText,
                template.status === 'critical' && styles.textCritical,
              ]}
              numberOfLines={1}
            >
              {isArabic ? template.textAr : template.text}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// Full template selector modal
export interface TemplateSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (text: string) => void;
}

export function TemplateSelector({ visible, onClose, onSelect }: TemplateSelectorProps) {
  const { t, i18n } = useTranslation();
  const { templates, recordUsage, toggleFavorite } = useAnswerTemplates();
  const [selectedCategory, setSelectedCategory] = useState<AnswerCategory | 'all'>('all');
  const isArabic = i18n.language === 'ar';

  const categories: { key: AnswerCategory | 'all'; label: string; labelAr: string }[] = [
    { key: 'all', label: 'All', labelAr: 'الكل' },
    { key: 'general', label: 'General', labelAr: 'عام' },
    { key: 'condition', label: 'Condition', labelAr: 'الحالة' },
    { key: 'maintenance', label: 'Maintenance', labelAr: 'الصيانة' },
    { key: 'safety', label: 'Safety', labelAr: 'السلامة' },
    { key: 'custom', label: 'Custom', labelAr: 'مخصص' },
  ];

  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter(t => t.category === selectedCategory);

  const handleSelect = (template: AnswerTemplate) => {
    recordUsage(template.id);
    onSelect(isArabic ? template.textAr : template.text);
    onClose();
  };

  const handleToggleFavorite = (id: string) => {
    toggleFavorite(id);
  };

  const getStatusColor = (status: AnswerStatus) => {
    switch (status) {
      case 'ok':
        return QUICK_ACTION_GREEN;
      case 'warning':
        return '#faad14';
      case 'critical':
        return '#ff4d4f';
      default:
        return '#8c8c8c';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isArabic ? 'اختر قالب إجابة' : 'Select Answer Template'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}></Text>
            </TouchableOpacity>
          </View>

          {/* Category filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryContainer}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat.key && styles.categoryChipSelected,
                ]}
                onPress={() => setSelectedCategory(cat.key)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === cat.key && styles.categoryChipTextSelected,
                  ]}
                >
                  {isArabic ? cat.labelAr : cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Template list */}
          <FlatList
            data={filteredTemplates}
            keyExtractor={(item) => item.id}
            style={styles.templateList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.templateRow}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.statusIndicator,
                    { backgroundColor: getStatusColor(item.status) },
                  ]}
                />
                <View style={styles.templateInfo}>
                  <Text style={styles.templateText}>
                    {isArabic ? item.textAr : item.text}
                  </Text>
                  {item.usageCount > 0 && (
                    <Text style={styles.usageCount}>
                      {isArabic ? `استخدم ${item.usageCount} مرة` : `Used ${item.usageCount} times`}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.favoriteButton}
                  onPress={() => handleToggleFavorite(item.id)}
                >
                  <Text style={styles.favoriteIcon}>
                    {item.isFavorite ? '' : ''}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {isArabic ? 'لا توجد قوالب في هذه الفئة' : 'No templates in this category'}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// Create template modal
export interface CreateTemplateModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (text: string, textAr: string, category: AnswerCategory) => void;
}

export function CreateTemplateModal({ visible, onClose, onSave }: CreateTemplateModalProps) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [textAr, setTextAr] = useState('');
  const [category, setCategory] = useState<AnswerCategory>('custom');
  const isArabic = i18n.language === 'ar';

  const categories: { key: AnswerCategory; label: string; labelAr: string }[] = [
    { key: 'general', label: 'General', labelAr: 'عام' },
    { key: 'condition', label: 'Condition', labelAr: 'الحالة' },
    { key: 'maintenance', label: 'Maintenance', labelAr: 'الصيانة' },
    { key: 'safety', label: 'Safety', labelAr: 'السلامة' },
    { key: 'custom', label: 'Custom', labelAr: 'مخصص' },
  ];

  const handleSave = () => {
    if (!text.trim()) {
      Alert.alert(
        isArabic ? 'خطأ' : 'Error',
        isArabic ? 'يرجى إدخال نص الإجابة' : 'Please enter answer text'
      );
      return;
    }
    onSave(text.trim(), textAr.trim() || text.trim(), category);
    setText('');
    setTextAr('');
    setCategory('custom');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.createModalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isArabic ? 'إنشاء قالب جديد' : 'Create New Template'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}></Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <ScrollView style={styles.formScroll}>
            <Text style={styles.inputLabel}>
              {isArabic ? 'النص بالإنجليزية' : 'English Text'}
            </Text>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder={isArabic ? 'أدخل النص بالإنجليزية' : 'Enter English text'}
              multiline
            />

            <Text style={styles.inputLabel}>
              {isArabic ? 'النص بالعربية (اختياري)' : 'Arabic Text (optional)'}
            </Text>
            <TextInput
              style={[styles.textInput, styles.textInputAr]}
              value={textAr}
              onChangeText={setTextAr}
              placeholder={isArabic ? 'أدخل النص بالعربية' : 'Enter Arabic text'}
              multiline
              textAlign="right"
            />

            <Text style={styles.inputLabel}>
              {isArabic ? 'الفئة' : 'Category'}
            </Text>
            <View style={styles.categoryPicker}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryOption,
                    category === cat.key && styles.categoryOptionSelected,
                  ]}
                  onPress={() => setCategory(cat.key)}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      category === cat.key && styles.categoryOptionTextSelected,
                    ]}
                  >
                    {isArabic ? cat.labelAr : cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.formButton, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Quick fill
  quickFillContainer: {
    marginVertical: 8,
  },
  quickFillTitle: {
    fontSize: 12,
    color: '#8c8c8c',
    marginBottom: 6,
    fontWeight: '500',
  },
  textRtl: {
    textAlign: 'right',
  },
  quickFillScroll: {
    paddingRight: 16,
  },
  quickFillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxWidth: 200,
  },
  chipOk: {
    backgroundColor: '#f6ffed',
    borderColor: QUICK_ACTION_GREEN,
  },
  chipWarning: {
    backgroundColor: '#fffbe6',
    borderColor: '#faad14',
  },
  chipCritical: {
    backgroundColor: '#fff2f0',
    borderColor: '#ff4d4f',
  },
  chipFavorite: {
    borderColor: TEMPLATE_BLUE,
  },
  favoriteIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  quickFillText: {
    fontSize: 13,
    color: '#262626',
  },
  textCritical: {
    color: '#cf1322',
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  createModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#262626',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#8c8c8c',
  },

  // Category chips
  categoryScroll: {
    maxHeight: 50,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  categoryChipSelected: {
    backgroundColor: TEMPLATE_BLUE,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#595959',
    fontWeight: '500',
  },
  categoryChipTextSelected: {
    color: '#fff',
  },

  // Template list
  templateList: {
    flex: 1,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  statusIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateText: {
    fontSize: 15,
    color: '#262626',
    lineHeight: 20,
  },
  usageCount: {
    fontSize: 11,
    color: '#8c8c8c',
    marginTop: 2,
  },
  favoriteButton: {
    padding: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#8c8c8c',
  },

  // Create form
  formScroll: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
    color: '#262626',
  },
  textInputAr: {
    fontFamily: 'System',
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    backgroundColor: '#fafafa',
  },
  categoryOptionSelected: {
    borderColor: TEMPLATE_BLUE,
    backgroundColor: '#e6f4ff',
  },
  categoryOptionText: {
    fontSize: 14,
    color: '#595959',
  },
  categoryOptionTextSelected: {
    color: TEMPLATE_BLUE,
    fontWeight: '600',
  },
  formButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  formButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#595959',
  },
  saveButton: {
    backgroundColor: TEMPLATE_BLUE,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default QuickFill;
