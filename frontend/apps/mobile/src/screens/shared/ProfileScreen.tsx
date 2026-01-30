import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';

const roleColors: Record<string, string> = {
  admin: '#f5222d',
  inspector: '#1677ff',
  specialist: '#52c41a',
  engineer: '#fa8c16',
  quality_engineer: '#722ed1',
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const { t } = useTranslation();

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

  return (
    <ScrollView style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.full_name.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{user.full_name}</Text>
        <View style={[styles.roleBadge, { backgroundColor: roleColors[user.role] || '#999' }]}>
          <Text style={styles.roleText}>{user.role.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <InfoRow label={t('auth.username')} value={user.username} />
        <InfoRow label={t('common.email')} value={user.email} />
        <InfoRow label="Employee ID" value={user.employee_id} />
        <InfoRow label={t('common.role')} value={user.role} />
        {user.specialization && <InfoRow label="Specialization" value={user.specialization} />}
        {user.shift && <InfoRow label="Shift" value={user.shift} />}
        <InfoRow label="Points" value={String(user.total_points)} />
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('common.language')}</Text>
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>English</Text>
          <Switch
            value={language === 'ar'}
            onValueChange={(checked) => setLanguage(checked ? 'ar' : 'en')}
            trackColor={{ false: '#d9d9d9', true: '#1677ff' }}
          />
          <Text style={styles.langLabel}>{'\u0627\u0644\u0639\u0631\u0628\u064A\u0629'}</Text>
        </View>
        <Text style={styles.dirText}>
          {isRTL ? '\u0627\u0644\u0627\u062A\u062C\u0627\u0647: \u0645\u0646 \u0627\u0644\u064A\u0645\u064A\u0646 \u0625\u0644\u0649 \u0627\u0644\u064A\u0633\u0627\u0631' : 'Direction: Left to Right'}
        </Text>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('auth.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  avatarSection: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#fff' },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1677ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#1a1a1a' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: { fontSize: 14, color: '#666' },
  infoValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  langLabel: { fontSize: 14, color: '#1a1a1a' },
  dirText: { fontSize: 12, color: '#999', marginTop: 8 },
  logoutButton: {
    margin: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f5222d',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#f5222d', fontSize: 16, fontWeight: '600' },
});
