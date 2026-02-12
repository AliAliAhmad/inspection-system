import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toolkitApi } from '@inspection/shared';

interface SettingItemProps {
  icon: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}

function SettingItem({ icon, label, description, value, onToggle }: SettingItemProps) {
  return (
    <View style={styles.settingItem}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#d9d9d9', true: '#91caff' }}
        thumbColor={value ? '#1677ff' : '#f5f5f5'}
      />
    </View>
  );
}

export default function ToolkitSettingsScreen() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  const { data: prefs } = useQuery({
    queryKey: ['toolkit-preferences'],
    queryFn: () => toolkitApi.getPreferences().then(r => r.data.data),
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, any>) => toolkitApi.updatePreferences(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toolkit-preferences'] }),
  });

  const toggle = (field: string, value: boolean) => {
    mutation.mutate({ [field]: value });
  };

  const role = user?.role || 'specialist';

  const workerTools = [
    { icon: '🔔', field: 'persistent_notification', label: isAr ? 'إشعار دائم' : 'Persistent Notification', desc: isAr ? 'أزرار سريعة في شريط الإشعارات' : 'Quick action buttons in notification bar' },
    { icon: '🟢', field: 'simple_mode_enabled', label: isAr ? 'الوضع البسيط' : 'Simple Mode', desc: isAr ? '4 أزرار كبيرة ملونة' : '4 big color-coded buttons' },
    { icon: '⚡', field: 'fab_enabled', label: isAr ? 'زر عائم' : 'Floating Button', desc: isAr ? 'زر إجراء سريع عائم' : 'Floating quick action button' },
    { icon: '🎙️', field: 'voice_commands_enabled', label: isAr ? 'أوامر صوتية' : 'Voice Commands', desc: isAr ? 'تحكم بالصوت بالعربي والإنجليزي' : 'Voice control in EN/AR' },
    { icon: '📳', field: 'shake_to_pause', label: isAr ? 'هز للإيقاف' : 'Shake to Pause', desc: isAr ? 'هز الهاتف لإيقاف العمل' : 'Shake phone to pause job' },
    { icon: '📡', field: 'nfc_enabled', label: isAr ? 'مسح NFC' : 'NFC Scan', desc: isAr ? 'مسح بطاقة المعدات' : 'Scan equipment NFC tag' },
    { icon: '📱', field: 'widget_enabled', label: isAr ? 'ودجت الشاشة' : 'Home Widget', desc: isAr ? 'ودجت حالة العمل' : 'Job status home widget' },
    { icon: '⌚', field: 'smartwatch_enabled', label: isAr ? 'ساعة ذكية' : 'Smart Watch', desc: isAr ? 'إشعارات على الساعة' : 'Watch notifications & actions' },
  ];

  const inspectorTools = [
    { icon: '📸', field: 'quick_camera_enabled', label: isAr ? 'كاميرا سريعة' : 'Quick Camera', desc: isAr ? 'التقاط صور سريع' : 'Fast photo capture' },
    { icon: '📊', field: 'barcode_scanner_enabled', label: isAr ? 'ماسح الباركود' : 'Barcode Scanner', desc: isAr ? 'مسح باركود المعدات' : 'Scan equipment barcode' },
    { icon: '🎤', field: 'voice_checklist_enabled', label: isAr ? 'قائمة تفتيش صوتية' : 'Voice Checklist', desc: isAr ? 'إجابة بالصوت' : 'Answer by voice' },
    { icon: '📍', field: 'auto_location_enabled', label: isAr ? 'موقع تلقائي' : 'Auto Location', desc: isAr ? 'تسجيل الموقع تلقائي' : 'Auto-log location' },
  ];

  const engineerTools = [
    { icon: '🗺️', field: 'team_map_enabled', label: isAr ? 'خريطة الفريق' : 'Team Map', desc: isAr ? 'موقع أعضاء الفريق' : 'Team member locations' },
    { icon: '🎤', field: 'voice_review_enabled', label: isAr ? 'مراجعة صوتية' : 'Voice Review', desc: isAr ? 'مراجعة يومية بالصوت' : 'Voice daily review' },
    { icon: '🚨', field: 'red_zone_alerts', label: isAr ? 'تنبيهات المنطقة الحمراء' : 'Red Zone Alerts', desc: isAr ? 'تنبيه عند دخول منطقة خطر' : 'Alert on danger zone' },
  ];

  const qeTools = [
    { icon: '🖼️', field: 'photo_compare_enabled', label: isAr ? 'مقارنة صور' : 'Photo Compare', desc: isAr ? 'مقارنة قبل وبعد' : 'Before/after compare' },
    { icon: '🎤', field: 'voice_rating_enabled', label: isAr ? 'تقييم صوتي' : 'Voice Rating', desc: isAr ? 'تقييم بالصوت' : 'Rate by voice' },
    { icon: '📋', field: 'punch_list_enabled', label: isAr ? 'قائمة التصحيح' : 'Punch List', desc: isAr ? 'قائمة مراجعة سريعة' : 'Quick review checklist' },
  ];

  const adminTools = [
    { icon: '🌅', field: 'morning_brief_enabled', label: isAr ? 'ملخص الصباح' : 'Morning Brief', desc: isAr ? 'ملخص يومي صباحي' : 'Daily morning summary' },
    { icon: '📊', field: 'kpi_alerts_enabled', label: isAr ? 'تنبيهات الأداء' : 'KPI Alerts', desc: isAr ? 'تنبيه عند تغير الأداء' : 'Alert on KPI changes' },
    { icon: '📢', field: 'emergency_broadcast', label: isAr ? 'بث طوارئ' : 'Emergency Broadcast', desc: isAr ? 'إرسال رسالة لجميع الفريق' : 'Send message to all team' },
  ];

  const roleToolMap: Record<string, typeof workerTools> = {
    specialist: workerTools,
    inspector: [...workerTools, ...inspectorTools],
    engineer: [...workerTools, ...engineerTools],
    quality_engineer: [...workerTools, ...qeTools],
    admin: [...workerTools, ...adminTools],
  };

  const allTools = roleToolMap[role] || workerTools;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isAr ? '🛠️ إعدادات الأدوات' : '🛠️ Toolkit Settings'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isAr ? 'تخصيص أدواتك المفضلة' : 'Customize your productivity tools'}
          </Text>
        </View>

        {/* Worker Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isAr ? '⚡ أدوات سريعة' : '⚡ Quick Tools'}
          </Text>
          {allTools.map((tool) => (
            <SettingItem
              key={tool.field}
              icon={tool.icon}
              label={tool.label}
              description={tool.desc}
              value={prefs?.[tool.field as keyof typeof prefs] as boolean ?? false}
              onToggle={(val) => toggle(tool.field, val)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#262626',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8c8c8c',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#262626',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f5f5f5',
  },
  settingIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
    color: '#8c8c8c',
  },
});
