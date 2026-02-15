import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  I18nManager,
  ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

// Empty state contexts
export type EmptyStateContext =
  | 'jobs'
  | 'inspections'
  | 'defects'
  | 'notifications'
  | 'search'
  | 'assignments'
  | 'leaves'
  | 'materials'
  | 'equipment'
  | 'reviews'
  | 'team'
  | 'generic';

export interface EmptyStateProps {
  context?: EmptyStateContext;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  illustration?: string; // emoji
  compact?: boolean;
  style?: ViewStyle;
}

// Context configurations
const CONTEXT_CONFIG: Record<
  EmptyStateContext,
  { illustration: string; titleKey: string; messageKey: string; actionKey?: string }
> = {
  jobs: {
    illustration: '🛠️',
    titleKey: 'empty.jobs.title',
    messageKey: 'empty.jobs.message',
    actionKey: 'empty.jobs.action',
  },
  inspections: {
    illustration: '🔍',
    titleKey: 'empty.inspections.title',
    messageKey: 'empty.inspections.message',
    actionKey: 'empty.inspections.action',
  },
  defects: {
    illustration: '✅',
    titleKey: 'empty.defects.title',
    messageKey: 'empty.defects.message',
  },
  notifications: {
    illustration: '🔔',
    titleKey: 'empty.notifications.title',
    messageKey: 'empty.notifications.message',
  },
  search: {
    illustration: '🔎',
    titleKey: 'empty.search.title',
    messageKey: 'empty.search.message',
  },
  assignments: {
    illustration: '📋',
    titleKey: 'empty.assignments.title',
    messageKey: 'empty.assignments.message',
    actionKey: 'empty.assignments.action',
  },
  leaves: {
    illustration: '🏖️',
    titleKey: 'empty.leaves.title',
    messageKey: 'empty.leaves.message',
    actionKey: 'empty.leaves.action',
  },
  materials: {
    illustration: '📦',
    titleKey: 'empty.materials.title',
    messageKey: 'empty.materials.message',
    actionKey: 'empty.materials.action',
  },
  equipment: {
    illustration: '⚙️',
    titleKey: 'empty.equipment.title',
    messageKey: 'empty.equipment.message',
  },
  reviews: {
    illustration: '📝',
    titleKey: 'empty.reviews.title',
    messageKey: 'empty.reviews.message',
  },
  team: {
    illustration: '👥',
    titleKey: 'empty.team.title',
    messageKey: 'empty.team.message',
  },
  generic: {
    illustration: '📭',
    titleKey: 'empty.generic.title',
    messageKey: 'empty.generic.message',
  },
};

// Default translations
const DEFAULT_TRANSLATIONS: Record<string, { en: string; ar: string }> = {
  'empty.jobs.title': { en: 'No Jobs', ar: 'لا توجد مهام' },
  'empty.jobs.message': {
    en: 'You have no pending jobs at the moment.',
    ar: 'ليس لديك مهام معلقة في الوقت الحالي.',
  },
  'empty.jobs.action': { en: 'Refresh', ar: 'تحديث' },
  'empty.inspections.title': { en: 'No Inspections', ar: 'لا توجد فحوصات' },
  'empty.inspections.message': {
    en: 'No inspections assigned to you right now.',
    ar: 'لا توجد فحوصات مسندة إليك حالياً.',
  },
  'empty.inspections.action': { en: 'View Schedule', ar: 'عرض الجدول' },
  'empty.defects.title': { en: 'No Defects', ar: 'لا توجد عيوب' },
  'empty.defects.message': {
    en: 'Great job! No defects to report.',
    ar: 'أحسنت! لا توجد عيوب للإبلاغ عنها.',
  },
  'empty.notifications.title': { en: 'No Notifications', ar: 'لا توجد إشعارات' },
  'empty.notifications.message': {
    en: "You're all caught up!",
    ar: 'لا يوجد جديد!',
  },
  'empty.search.title': { en: 'No Results', ar: 'لا توجد نتائج' },
  'empty.search.message': {
    en: 'Try adjusting your search or filters.',
    ar: 'جرب تعديل البحث أو الفلاتر.',
  },
  'empty.assignments.title': { en: 'No Assignments', ar: 'لا توجد مهام مسندة' },
  'empty.assignments.message': {
    en: 'No assignments waiting for you.',
    ar: 'لا توجد مهام في انتظارك.',
  },
  'empty.assignments.action': { en: 'Check Schedule', ar: 'مراجعة الجدول' },
  'empty.leaves.title': { en: 'No Leave Requests', ar: 'لا توجد طلبات إجازة' },
  'empty.leaves.message': {
    en: 'You have no pending leave requests.',
    ar: 'ليس لديك طلبات إجازة معلقة.',
  },
  'empty.leaves.action': { en: 'Request Leave', ar: 'طلب إجازة' },
  'empty.materials.title': { en: 'No Materials', ar: 'لا توجد مواد' },
  'empty.materials.message': {
    en: 'No materials found in this category.',
    ar: 'لم يتم العثور على مواد في هذه الفئة.',
  },
  'empty.materials.action': { en: 'Add Material', ar: 'إضافة مادة' },
  'empty.equipment.title': { en: 'No Equipment', ar: 'لا توجد معدات' },
  'empty.equipment.message': {
    en: 'No equipment found matching your criteria.',
    ar: 'لم يتم العثور على معدات تطابق معاييرك.',
  },
  'empty.reviews.title': { en: 'No Reviews', ar: 'لا توجد مراجعات' },
  'empty.reviews.message': {
    en: 'No pending reviews at the moment.',
    ar: 'لا توجد مراجعات معلقة حالياً.',
  },
  'empty.team.title': { en: 'No Team Members', ar: 'لا يوجد أعضاء فريق' },
  'empty.team.message': {
    en: 'No team members match your search.',
    ar: 'لا يوجد أعضاء فريق يطابقون بحثك.',
  },
  'empty.generic.title': { en: 'Nothing Here', ar: 'لا شيء هنا' },
  'empty.generic.message': {
    en: 'No data available at the moment.',
    ar: 'لا توجد بيانات متاحة حالياً.',
  },
};

function getTranslation(key: string, lang: string): string {
  const translation = DEFAULT_TRANSLATIONS[key];
  if (!translation) return key;
  return lang === 'ar' ? translation.ar : translation.en;
}

export function EmptyState({
  context = 'generic',
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  illustration,
  compact = false,
  style,
}: EmptyStateProps) {
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar';

  const config = CONTEXT_CONFIG[context];

  const displayIllustration = illustration || config.illustration;
  const displayTitle =
    title || t(config.titleKey, getTranslation(config.titleKey, i18n.language));
  const displayMessage =
    message || t(config.messageKey, getTranslation(config.messageKey, i18n.language));
  const displayAction =
    actionLabel ||
    (config.actionKey ? t(config.actionKey, getTranslation(config.actionKey, i18n.language)) : null);

  if (compact) {
    return (
      <View style={[styles.compactContainer, style]}>
        <Text style={styles.compactIcon}>{displayIllustration}</Text>
        <View style={styles.compactContent}>
          <Text style={[styles.compactTitle, isRTL && styles.rtlText]}>{displayTitle}</Text>
          <Text style={[styles.compactMessage, isRTL && styles.rtlText]}>{displayMessage}</Text>
        </View>
        {onAction && displayAction && (
          <TouchableOpacity style={styles.compactActionBtn} onPress={onAction}>
            <Text style={styles.compactActionText}>{displayAction}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.illustrationContainer}>
        <Text style={styles.illustration}>{displayIllustration}</Text>
      </View>
      <Text style={[styles.title, isRTL && styles.rtlText]}>{displayTitle}</Text>
      <Text style={[styles.message, isRTL && styles.rtlText]}>{displayMessage}</Text>

      {onAction && displayAction && (
        <TouchableOpacity style={styles.actionButton} onPress={onAction}>
          <Text style={styles.actionButtonText}>{displayAction}</Text>
        </TouchableOpacity>
      )}

      {onSecondaryAction && secondaryActionLabel && (
        <TouchableOpacity style={styles.secondaryButton} onPress={onSecondaryAction}>
          <Text style={[styles.secondaryButtonText, isRTL && styles.rtlText]}>
            {secondaryActionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Pre-configured empty states for common use cases
export function NoJobsState({ onRefresh }: { onRefresh?: () => void }) {
  return <EmptyState context="jobs" onAction={onRefresh} />;
}

export function NoInspectionsState({ onViewSchedule }: { onViewSchedule?: () => void }) {
  return <EmptyState context="inspections" onAction={onViewSchedule} />;
}

export function NoDefectsState() {
  return <EmptyState context="defects" />;
}

export function NoNotificationsState() {
  return <EmptyState context="notifications" />;
}

export function NoSearchResultsState({ onClearFilters }: { onClearFilters?: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <EmptyState
      context="search"
      onAction={onClearFilters}
      actionLabel={
        i18n.language === 'ar' ? 'مسح الفلاتر' : 'Clear Filters'
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
  },
  illustrationContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  illustration: {
    fontSize: 56,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  actionButton: {
    backgroundColor: '#1677ff',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    padding: 12,
  },
  secondaryButtonText: {
    color: '#1677ff',
    fontSize: 14,
    fontWeight: '500',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  compactIcon: {
    fontSize: 36,
    marginRight: 16,
  },
  compactContent: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  compactMessage: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  compactActionBtn: {
    backgroundColor: '#1677ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginLeft: 12,
  },
  compactActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});

export default EmptyState;
