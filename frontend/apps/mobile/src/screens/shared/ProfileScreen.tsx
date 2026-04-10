import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { scale, vscale, mscale, fontScale } from '../../utils/scale';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useThemeContext } from '../../providers/ThemeProvider';
import { useAccessibility } from '../../providers/AccessibilityProvider';
import { useTheme, createThemedStyles } from '../../hooks/useTheme';
import { getRoleColor } from '../../theme/colors';
import { ThemeMode } from '../../storage/theme-storage';
import { minutesToTimeString } from '../../storage/theme-storage';
import { clearAllCache } from '../../storage/storage-cleanup';
import type { TextScale } from '../../storage/accessibility-storage';

const THEME_MODE_I18N_KEYS: Record<ThemeMode, string> = {
  system: 'profile.theme_system',
  light: 'profile.theme_light',
  dark: 'profile.theme_dark',
  schedule: 'profile.theme_schedule',
};

const TEXT_SCALE_I18N_KEYS: Record<TextScale, string> = {
  1: 'profile.text_scale_small',
  1.25: 'profile.text_scale_normal',
  1.5: 'profile.text_scale_large',
  2: 'profile.text_scale_extra_large',
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

  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      t('storage.clearCache'),
      t('storage.clearConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('storage.clearCache'),
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              const result = await clearAllCache();
              const parts: string[] = [];
              if (result.cacheCleared > 0) parts.push(`${result.cacheCleared} ${t('storage.cacheCleared')}`);
              if (result.draftsCleared > 0) parts.push(`${result.draftsCleared} ${t('storage.draftsCleared')}`);
              if (result.filesRemoved > 0) parts.push(`${result.filesRemoved} ${t('storage.filesRemoved')}`);
              Alert.alert(
                t('storage.cleared'),
                parts.length > 0 ? parts.join('\n') : t('storage.cleared'),
              );
            } catch {
              // Silent fail — cleanup is best-effort
            } finally {
              setIsClearing(false);
            }
          },
        },
      ],
    );
  }, [t]);

  if (!user) return null;

  const handleLogout = () => {
    Alert.alert(
      t('auth.logout'),
      t('profile.logout_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.logout'), style: 'destructive', onPress: async () => { await logout(); } },
      ],
    );
  };

  const handleThemeModeChange = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const roleColor = getRoleColor(user.role, isDark);

  return (
    <ScrollView testID="profile-screen" style={styles.container}>
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
          label={t('profile.employeeId')}
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
            label={t('profile.specialization')}
            value={user.specialization}
            colors={colors}
          />
        )}
        {user.shift && (
          <InfoRow
            label={t('profile.shift')}
            value={user.shift}
            colors={colors}
          />
        )}
        <InfoRow
          label={t('profile.points')}
          value={String(user.total_points)}
          colors={colors}
        />
      </View>

      {/* Theme Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('profile.appearance')}
        </Text>
        <View style={styles.themeOptions}>
          {(['system', 'light', 'dark', 'schedule'] as ThemeMode[]).map((themeMode) => (
            <TouchableOpacity
              key={themeMode}
              testID={`theme-${themeMode}`}
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
                {t(THEME_MODE_I18N_KEYS[themeMode])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'schedule' && (
          <View style={styles.scheduleInfo}>
            <Text style={styles.scheduleText}>
              {t('profile.dark_from_to', { sunset: minutesToTimeString(sunsetTime), sunrise: minutesToTimeString(sunriseTime) })}
            </Text>
          </View>
        )}
        <Text style={styles.themeHint}>
          {isDark
            ? t('profile.dark_mode_active')
            : t('profile.light_mode_active')}
        </Text>
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.languageSettings')}</Text>
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>English</Text>
          <Switch
            testID="language-toggle"
            value={language === 'ar'}
            onValueChange={(checked) => setLanguage(checked ? 'ar' : 'en')}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
          <Text style={styles.langLabel}>{'\u0627\u0644\u0639\u0631\u0628\u064A\u0629'}</Text>
        </View>
        <Text style={styles.dirText}>
          {isRTL
            ? t('profile.direction_rtl')
            : t('profile.direction_ltr')}
        </Text>
      </View>

      {/* Accessibility Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('profile.accessibility')}
        </Text>

        {/* High Contrast */}
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>
            {t('profile.high_contrast')}
          </Text>
          <Switch
            testID="high-contrast-toggle"
            value={isHighContrast}
            onValueChange={(checked) => updatePreferences({ highContrastEnabled: checked })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Bold Text */}
        <View style={[styles.langRow, { marginTop: vscale(8) }]}>
          <Text style={styles.langLabel}>
            {t('profile.bold_text')}
          </Text>
          <Switch
            testID="bold-text-toggle"
            value={isBoldText}
            onValueChange={(checked) => updatePreferences({ boldTextEnabled: checked })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Reduce Motion */}
        <View style={[styles.langRow, { marginTop: vscale(8) }]}>
          <Text style={styles.langLabel}>
            {t('profile.reduce_motion')}
          </Text>
          <Switch
            testID="reduce-motion-toggle"
            value={isReduceMotion}
            onValueChange={(checked) => updatePreferences({ reduceMotionEnabled: checked })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Text Scale */}
        <Text style={[styles.langLabel, { marginTop: vscale(12), marginBottom: vscale(8) }]}>
          {t('profile.text_size')}
        </Text>
        <View style={styles.themeOptions}>
          {([1, 1.25, 1.5, 2] as TextScale[]).map((scale) => (
            <TouchableOpacity
              key={scale}
              testID={`text-scale-${scale}`}
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
                {t(TEXT_SCALE_I18N_KEYS[scale])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('profile.quick_links')}
        </Text>
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate('ChannelList')}
        >
          <Text style={styles.quickLinkIcon}>💬</Text>
          <Text style={[styles.langLabel, { flex: 1 }]}>
            {t('profile.team_chat')}
          </Text>
          <Text style={styles.quickLinkArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate('ToolkitSettings')}
        >
          <Text style={styles.quickLinkIcon}>⚙️</Text>
          <Text style={[styles.langLabel, { flex: 1 }]}>
            {t('profile.toolkit_settings')}
          </Text>
          <Text style={styles.quickLinkArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="notification-prefs-link"
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate('NotificationPreferences')}
        >
          <Text style={styles.quickLinkIcon}>🔔</Text>
          <Text style={[styles.langLabel, { flex: 1 }]}>
            {t('profile.notification_preferences', 'Notification Preferences')}
          </Text>
          <Text style={styles.quickLinkArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Storage */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('storage.title')}
        </Text>
        <TouchableOpacity
          testID="clear-cache-btn"
          style={styles.quickLinkRow}
          onPress={handleClearCache}
          disabled={isClearing}
        >
          <Text style={styles.quickLinkIcon}>{isClearing ? '' : '\uD83D\uDDD1\uFE0F'}</Text>
          {isClearing ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: scale(12) }} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.langLabel}>
              {isClearing ? t('storage.clearing') : t('storage.clearCache')}
            </Text>
            <Text style={[styles.dirText, { marginTop: vscale(2) }]}>
              {t('storage.clearCacheDesc')}
            </Text>
          </View>
          <Text style={styles.quickLinkArrow}>{isClearing ? '' : '\u203A'}</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity testID="logout-btn" style={styles.logoutButton} onPress={handleLogout}>
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
        paddingVertical: vscale(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}
    >
      <Text style={{ fontSize: fontScale(14), color: colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: fontScale(14), color: colors.text, fontWeight: '500' }}>{value}</Text>
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
    paddingVertical: vscale(24),
    backgroundColor: colors.surface,
  },
  avatar: {
    width: scale(80),
    height: vscale(80),
    borderRadius: mscale(40),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: vscale(12),
  },
  avatarText: {
    fontSize: fontScale(32),
    fontWeight: 'bold',
    color: colors.textInverse,
  },
  name: {
    fontSize: fontScale(20),
    fontWeight: 'bold',
    color: colors.text,
  },
  roleBadge: {
    marginTop: vscale(8),
    paddingHorizontal: scale(12),
    paddingVertical: vscale(4),
    borderRadius: mscale(12),
  },
  roleText: {
    color: '#fff',
    fontSize: fontScale(12),
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: vscale(12),
    paddingHorizontal: scale(16),
    paddingVertical: vscale(12),
  },
  sectionTitle: {
    fontSize: fontScale(16),
    fontWeight: '600',
    marginBottom: vscale(12),
    color: colors.text,
  },
  themeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  themeOption: {
    paddingHorizontal: scale(16),
    paddingVertical: vscale(10),
    borderRadius: mscale(8),
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeOptionActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  themeOptionText: {
    fontSize: fontScale(14),
    color: colors.textSecondary,
  },
  themeOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  scheduleInfo: {
    marginTop: vscale(12),
    padding: scale(12),
    backgroundColor: colors.backgroundSecondary,
    borderRadius: mscale(8),
  },
  scheduleText: {
    fontSize: fontScale(13),
    color: colors.textSecondary,
    textAlign: 'center',
  },
  themeHint: {
    fontSize: fontScale(12),
    color: colors.textTertiary,
    marginTop: vscale(8),
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  langLabel: {
    fontSize: fontScale(14),
    color: colors.text,
  },
  dirText: {
    fontSize: fontScale(12),
    color: colors.textTertiary,
    marginTop: vscale(8),
  },
  quickLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vscale(12),
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  quickLinkIcon: {
    fontSize: fontScale(18),
    marginRight: scale(12),
  },
  quickLinkArrow: {
    fontSize: fontScale(20),
    color: colors.textTertiary,
  },
  logoutButton: {
    margin: scale(16),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: mscale(8),
    paddingVertical: vscale(14),
    alignItems: 'center',
  },
  logoutText: {
    color: colors.error,
    fontSize: fontScale(16),
    fontWeight: '600',
  },
}));
