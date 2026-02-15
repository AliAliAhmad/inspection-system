import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';

// WhatsApp brand color
const WHATSAPP_GREEN = '#25D366';
const WHATSAPP_DARK = '#128C7E';

export type ShareTemplateType = 'inspection_complete' | 'defect_found' | 'needs_review' | 'custom';

export interface ShareContent {
  type: ShareTemplateType;
  equipmentName?: string;
  equipmentId?: number;
  defectCount?: number;
  criticalCount?: number;
  findings?: string[];
  customMessage?: string;
  verdict?: 'operational' | 'urgent';
  inspectionId?: number;
  photos?: string[];
}

export interface WhatsAppShareProps {
  content: ShareContent;
  onShareComplete?: () => void;
  buttonStyle?: 'icon' | 'full' | 'compact';
  disabled?: boolean;
}

// Generate message based on template type
const generateMessage = (content: ShareContent, language: string): string => {
  const isArabic = language === 'ar';

  switch (content.type) {
    case 'inspection_complete': {
      const icon = content.verdict === 'urgent' ? '' : '';
      const title = isArabic
        ? `${icon} اكتمل الفحص`
        : `${icon} Inspection Complete`;

      const equipment = isArabic
        ? `المعدة: ${content.equipmentName || `#${content.equipmentId}`}`
        : `Equipment: ${content.equipmentName || `#${content.equipmentId}`}`;

      const status = isArabic
        ? `الحالة: ${content.verdict === 'urgent' ? 'عاجل' : 'قيد التشغيل'}`
        : `Status: ${content.verdict === 'urgent' ? 'Urgent' : 'Operational'}`;

      const findingsText = content.findings && content.findings.length > 0
        ? (isArabic ? '\n\nالنتائج الرئيسية:' : '\n\nKey Findings:') +
          content.findings.map(f => `\n- ${f}`).join('')
        : '';

      return `${title}\n\n${equipment}\n${status}${findingsText}`;
    }

    case 'defect_found': {
      const title = isArabic
        ? ' تم اكتشاف عيب'
        : ' Defect Found';

      const equipment = isArabic
        ? `المعدة: ${content.equipmentName || `#${content.equipmentId}`}`
        : `Equipment: ${content.equipmentName || `#${content.equipmentId}`}`;

      const count = content.defectCount || 1;
      const defectInfo = isArabic
        ? `عدد العيوب: ${count}${content.criticalCount ? ` (${content.criticalCount} حرج)` : ''}`
        : `Defects: ${count}${content.criticalCount ? ` (${content.criticalCount} critical)` : ''}`;

      const findingsText = content.findings && content.findings.length > 0
        ? (isArabic ? '\n\nالتفاصيل:' : '\n\nDetails:') +
          content.findings.map(f => `\n- ${f}`).join('')
        : '';

      return `${title}\n\n${equipment}\n${defectInfo}${findingsText}`;
    }

    case 'needs_review': {
      const title = isArabic
        ? ' يحتاج مراجعة'
        : ' Needs Review';

      const equipment = isArabic
        ? `المعدة: ${content.equipmentName || `#${content.equipmentId}`}`
        : `Equipment: ${content.equipmentName || `#${content.equipmentId}`}`;

      const message = isArabic
        ? 'يرجى مراجعة نتائج الفحص'
        : 'Please review inspection results';

      return `${title}\n\n${equipment}\n\n${message}`;
    }

    case 'custom':
    default:
      return content.customMessage || '';
  }
};

// Share via WhatsApp
const shareViaWhatsApp = async (message: string): Promise<boolean> => {
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `whatsapp://send?text=${encodedMessage}`;

  try {
    const supported = await Linking.canOpenURL(whatsappUrl);
    if (supported) {
      await Linking.openURL(whatsappUrl);
      return true;
    } else {
      // WhatsApp not installed, use web fallback
      const webUrl = `https://wa.me/?text=${encodedMessage}`;
      await Linking.openURL(webUrl);
      return true;
    }
  } catch (error) {
    console.error('Error sharing to WhatsApp:', error);
    return false;
  }
};

// Native share fallback
const shareNative = async (message: string, title: string): Promise<boolean> => {
  try {
    const result = await Share.share({
      message,
      title,
    });
    return result.action !== Share.dismissedAction;
  } catch (error) {
    console.error('Error sharing:', error);
    return false;
  }
};

export function WhatsAppShareButton({
  content,
  onShareComplete,
  buttonStyle = 'full',
  disabled = false,
}: WhatsAppShareProps) {
  const { t, i18n } = useTranslation();
  const [isSharing, setIsSharing] = React.useState(false);

  const handleShare = useCallback(async () => {
    if (disabled || isSharing) return;

    setIsSharing(true);
    const message = generateMessage(content, i18n.language);

    const success = await shareViaWhatsApp(message);

    if (success) {
      onShareComplete?.();
    } else {
      // Fallback to native share
      const title = content.type === 'inspection_complete'
        ? (i18n.language === 'ar' ? 'نتائج الفحص' : 'Inspection Results')
        : content.type === 'defect_found'
        ? (i18n.language === 'ar' ? 'تقرير العيوب' : 'Defect Report')
        : (i18n.language === 'ar' ? 'مشاركة' : 'Share');

      await shareNative(message, title);
      onShareComplete?.();
    }

    setIsSharing(false);
  }, [content, i18n.language, onShareComplete, disabled, isSharing]);

  const handleLongPress = useCallback(async () => {
    if (disabled || isSharing) return;

    // Show options: WhatsApp, Copy, Native Share
    Alert.alert(
      i18n.language === 'ar' ? 'خيارات المشاركة' : 'Share Options',
      '',
      [
        {
          text: 'WhatsApp',
          onPress: handleShare,
        },
        {
          text: i18n.language === 'ar' ? 'مشاركة أخرى' : 'Other Apps',
          onPress: async () => {
            setIsSharing(true);
            const message = generateMessage(content, i18n.language);
            await shareNative(message, 'Share');
            setIsSharing(false);
            onShareComplete?.();
          },
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ]
    );
  }, [content, i18n.language, t, handleShare, onShareComplete, disabled, isSharing]);

  if (buttonStyle === 'icon') {
    return (
      <TouchableOpacity
        style={[styles.iconButton, disabled && styles.buttonDisabled]}
        onPress={handleShare}
        onLongPress={handleLongPress}
        disabled={disabled || isSharing}
        activeOpacity={0.7}
      >
        {isSharing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.iconText}>📱</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (buttonStyle === 'compact') {
    return (
      <TouchableOpacity
        style={[styles.compactButton, disabled && styles.buttonDisabled]}
        onPress={handleShare}
        onLongPress={handleLongPress}
        disabled={disabled || isSharing}
        activeOpacity={0.7}
      >
        {isSharing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Text style={styles.whatsappIcon}>📱</Text>
            <Text style={styles.compactText}>
              {i18n.language === 'ar' ? 'مشاركة' : 'Share'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  // Full button style
  return (
    <TouchableOpacity
      style={[styles.fullButton, disabled && styles.buttonDisabled]}
      onPress={handleShare}
      onLongPress={handleLongPress}
      disabled={disabled || isSharing}
      activeOpacity={0.7}
    >
      {isSharing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <View style={styles.fullButtonContent}>
          <Text style={styles.whatsappIconLarge}>📱</Text>
          <Text style={styles.fullButtonText}>
            {i18n.language === 'ar' ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Template Picker Component
export interface TemplatePickerProps {
  onSelectTemplate: (type: ShareTemplateType) => void;
  selectedTemplate?: ShareTemplateType;
}

export function ShareTemplatePicker({ onSelectTemplate, selectedTemplate }: TemplatePickerProps) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const templates: { type: ShareTemplateType; icon: string; label: string; labelAr: string }[] = [
    {
      type: 'inspection_complete',
      icon: '',
      label: 'Inspection Complete',
      labelAr: 'اكتمل الفحص',
    },
    {
      type: 'defect_found',
      icon: '',
      label: 'Defect Found',
      labelAr: 'تم اكتشاف عيب',
    },
    {
      type: 'needs_review',
      icon: '',
      label: 'Needs Review',
      labelAr: 'يحتاج مراجعة',
    },
  ];

  return (
    <View style={styles.templatePicker}>
      <Text style={[styles.templatePickerTitle, isArabic && styles.textRtl]}>
        {isArabic ? 'اختر قالب الرسالة' : 'Select Message Template'}
      </Text>
      <View style={styles.templateList}>
        {templates.map((template) => (
          <TouchableOpacity
            key={template.type}
            style={[
              styles.templateItem,
              selectedTemplate === template.type && styles.templateItemSelected,
            ]}
            onPress={() => onSelectTemplate(template.type)}
            activeOpacity={0.7}
          >
            <Text style={styles.templateIcon}>{template.icon}</Text>
            <Text
              style={[
                styles.templateLabel,
                selectedTemplate === template.type && styles.templateLabelSelected,
              ]}
            >
              {isArabic ? template.labelAr : template.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Quick Share Row (for displaying at bottom of screens)
export interface QuickShareRowProps {
  content: ShareContent;
  onShareComplete?: () => void;
}

export function QuickShareRow({ content, onShareComplete }: QuickShareRowProps) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  return (
    <View style={[styles.quickShareRow, isArabic && styles.rowRtl]}>
      <Text style={styles.quickShareLabel}>
        {isArabic ? 'مشاركة النتائج:' : 'Share results:'}
      </Text>
      <WhatsAppShareButton
        content={content}
        buttonStyle="compact"
        onShareComplete={onShareComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Icon button
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WHATSAPP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  iconText: {
    fontSize: 20,
  },

  // Compact button
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHATSAPP_GREEN,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  whatsappIcon: {
    fontSize: 16,
  },
  compactText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Full button
  fullButton: {
    backgroundColor: WHATSAPP_GREEN,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  fullButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  whatsappIconLarge: {
    fontSize: 22,
  },
  fullButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  // Template picker
  templatePicker: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  templatePickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
  },
  textRtl: {
    textAlign: 'right',
  },
  templateList: {
    gap: 8,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    gap: 10,
  },
  templateItemSelected: {
    borderColor: WHATSAPP_GREEN,
    backgroundColor: '#E8F5E9',
  },
  templateIcon: {
    fontSize: 20,
  },
  templateLabel: {
    fontSize: 15,
    color: '#424242',
    fontWeight: '500',
  },
  templateLabelSelected: {
    color: WHATSAPP_DARK,
    fontWeight: '600',
  },

  // Quick share row
  quickShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  rowRtl: {
    flexDirection: 'row-reverse',
  },
  quickShareLabel: {
    fontSize: 14,
    color: '#616161',
    fontWeight: '500',
  },
});

export default WhatsAppShareButton;
