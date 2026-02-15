import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useThemeContext } from '../../providers/ThemeProvider';
import { useAccessibility } from '../../providers/AccessibilityProvider';
import { useTheme, createThemedStyles } from '../../hooks/useTheme';
import { getRoleColor } from '../../theme/colors';
import { ThemeMode } from '../../storage/theme-storage';
import { minutesToTimeString } from '../../storage/theme-storage';
import type { TextScale } from '../../storage/accessibility-storage';

const THEME_MODE_LABELS: Record<ThemeMode, { en: string; ar: string }> = {
  system: { en: 'System', ar: '\u0627\u0644\u0646\u0638\u0627\u0645' },
  light: { en: 'Light', ar: '\u0641\u0627\u062A\u062D' },
  dark: { en: 'Dark', ar: '\u062F\u0627\u0643\u0646' },
  schedule: { en: 'Schedule', ar: '\u062C\u062F\u0648\u0644\u0629' },
};

const TEXT_SCALE_LABELS: Record<TextScale, { en: string; ar: string }> = {
  small: { en: 'Small', ar: '\u0635\u063A\u064A\u0631' },
  normal: { en: 'Normal', ar: '\u0639\u0627\u062F\u064A' },
  large: { en: 'Large', ar: '\u0643\u0628\u064A\u0631' },
  xlarge: { en: 'Extra Large', ar: '\u0643\u0628\u064A\u0631 \u062C\u062F\u0627' },
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { mode, setMode, sunriseTime, sunsetTime } = useThemeContext();
  const navigation = useNavigation<any>();
  const {
    preferences,
    updatePreferences,
    isHighContrast,
    isBoldText,
    textScale,
    isReduceMotion,
  } = useAccessibility();
  const styles = useStyles();

  if (!user) return null;

  const handleLogout = () => {
    Alert.alert(
      t('auth.logout'),
      'Are you sure you want to logout?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.logout'), style: 'destructive', onPress: logout },
      ],
    );
  };

  const handleThemeModeChange = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const roleColor = getRoleColor(user.role, isDark);

  return (
    <ScrollView style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{user.full_name.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{user.full_name}</Text>
        <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
          <Text style={styles.roleText}>{user.role.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <InfoRow
          label={t('auth.username')}
          value={user.username}
          colors={colors}
        />
        <InfoRow
          label={t('common.email')}
          value={user.email}
          colors={colors}
        />
        <InfoRow
          label="Employee ID"
          value={user.employee_id}
          colors={colors}
        />
        <InfoRow
          label={t('common.role')}
          value={user.role}
          colors={colors}
        />
        {user.specialization && (
          <InfoRow
            label="Specialization"
            value={user.specialization}
            colors={colors}
          />
        )}
        {user.shift && (
          <InfoRow
            label="Shift"
            value={user.shift}
            colors={colors}
          />
        )}
        <InfoRow
          label="Points"
          value={String(user.total_points)}
          colors={colors}
        />
      </View>

      {/* Theme Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {language === 'ar' ? '\u0627\u0644\u0645\u0638\u0647\u0631' : 'Appearance'}
        </Text>
        <View style={styles.themeOptions}>
          {(['system', 'light', 'dark', 'schedule'] as ThemeMode[]).map((themeMode) => (
            <TouchableOpacity
              key={themeMode}
              style={[
                styles.themeOption,
                mode === themeMode && styles.themeOptionActive,
              ]}
              onPress={() => handleThemeModeChange(themeMode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === themeMode }}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  mode === themeMode && styles.themeOptionTextActive,
                ]}
              >
                {THEME_MODE_LABELS[themeMode][language]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'schedule' && (
          <View style={styles.scheduleInfo}>
            <Text style={styles.scheduleText}>
              {language === 'ar'
                ? `\u062F\u0627\u0643\u0646 \u0645\u0646 ${minutesToTimeString(sunsetTime)} \u0625\u0644\u0649 ${minutesToTimeString(sunriseTime)}`
                : `Dark from ${minutesToTimeString(sunsetTime)} to ${minutesToTimeString(sunriseTime)}`}
            </Text>
          </View>
        )}
        <Text style={styles.themeHint}>
          {isDark
            ? (language === 'ar' ? '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u062F\u0627\u0643\u0646 \u0645\u064F\u0641\u0639\u064E\u0644' : 'Dark mode is active')
            : (language === 'ar' ? '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0641\u0627\u062A\u062D \u0645\u064F\u0641\u0639\u064E\u0644' : 'Light mode is active')}
        </Text>
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.languageSettings')}</Text>
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>English</Text>
          <Switch
            value={language === 'ar'}
            onValueChange={(checked) => setLanguage(checked ? 'ar' : 'en')}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
          <Text style={styles.langLabel}>{'\u0627\u0644\u0639\u0631\u0628\u064A\u0629'}</Text>
        </View>
        <Text style={styles.dirText}>
          {isRTL
            ? '\u0627\u0644\u0627\u062A\u062C\u0627\u0647: \u0645\u0646 \u0627\u0644\u064A\u0645\u064A\u0646 \u0625\u0644\u0649 \u0627\u0644\u064A\u0633\u0627\u0631'
            : 'Direction: Left to Right'}
        </Text>
      </View>

      {/* Accessibility Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {language === 'ar' ? '\u0625\u0645\u0643\u0627\u0646\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644' : 'Accessibility'}
        </Text>

        {/* High Contrast */}
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>
            {language === 'ar' ? '\u062A\u0628\u0627\u064A\u0646 \u0639\u0627\u0644\u064A' : 'High Contrast'}
          </Text>
          <Switch
            value={isHighContrast}
            onValueChange={(checked) => updatePreferences({ highContrastEnabled: checked })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Bold Text */}
        <View style={[styles.langRow, { marginTop: 8 }]}>
          <Text style={styles.langLabel}>
            {language === 'ar' ? '\u0646\u0635 \u0639\u0631\u064A\u0636' : 'Bold Text'}
          </Text>
          <Switch
            value={isBoldText}
            onValueChange={(checked) => updatePreferences({ boldTextEnabled: checked })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Reduce Motion */}
        <View style={[styles.langRow, { marginTop: 8 }]}>
          <Text style={styles.langLabel}>
            {language === 'ar' ? '\u062A\u0642\u0644\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0629' : 'Reduce Motion'}
          </Text>
          <Switch
            value={isReduceMotion}
            onValueChange={(checked) => updatePreferences({ reduceMotionEnabled: checked })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Text Scale */}
        <Text style={[styles.langLabel, { marginTop: 12, marginBottom: 8 }]}>
          {language === 'ar' ? '\u062D\u062C\u0645 \u0627\u0644\u0646\u0635' : 'Text Size'}
        </Text>
        <View style={styles.themeOptions}>
          {(['small', 'normal', 'large', 'xlarge'] as TextScale[]).map((scale) => (
            <TouchableOpacity
              key={scale}
              style={[
                styles.themeOption,
                textScale === scale && styles.themeOptionActive,
              ]}
              onPress={() => updatePreferences({ textScale: scale })}
              accessibilityRole="radio"
              accessibilityState={{ checked: textScale === scale }}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  textScale === scale && styles.themeOptionTextActive,
                ]}
              >
                {TEXT_SCALE_LABELS[scale][language]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {language === 'ar' ? '\u0631\u0648\u0627\u0628\u0637 \u0633\u0631\u064A\u0639\u0629' : 'Quick Links'}
        </Text>
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate('ChannelList')}
        >
          <Text style={styles.quickLinkIcon}>💬</Text>
          <Text style={[styles.langLabel, { flex: 1 }]}>
            {language === 'ar' ? '\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0627\u0644\u0641\u0631\u064A\u0642' : 'Team Chat'}
          </Text>
          <Text style={styles.quickLinkArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate('ToolkitSettings')}
        >
          <Text style={styles.quickLinkIcon}>⚙️</Text>
          <Text style={[styles.langLabel, { flex: 1 }]}>
            {language === 'ar' ? '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0623\u062F\u0648\u0627\u062A' : 'Toolkit Settings'}
          </Text>
          <Text style={styles.quickLinkArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('auth.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function InfoRow({ label, value, colors }: InfoRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}
    >
      <Text style={{ fontSize: 14, color: colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.text, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors, isDark) => ({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textInverse,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.text,
  },
  themeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeOptionActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  themeOptionText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  themeOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  scheduleInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
  },
  scheduleText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  themeHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langLabel: {
    fontSize: 14,
    color: colors.text,
  },
  dirText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
  },
  quickLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  quickLinkIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  quickLinkArrow: {
    fontSize: 20,
    color: colors.textTertiary,
  },
  logoutButton: {
    margin: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
}));
