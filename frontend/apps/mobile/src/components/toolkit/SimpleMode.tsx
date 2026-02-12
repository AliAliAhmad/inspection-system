import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Vibration,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = (SCREEN_WIDTH - 48) / 2;

interface SimpleModeProps {
  onPause: () => void;
  onComplete: () => void;
  onIncomplete: () => void;
  onHelp: () => void;
  currentJobName?: string;
  isJobActive: boolean;
}

const BUTTONS = [
  {
    id: 'pause',
    icon: '⏸️',
    color: '#fa8c16',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    action: 'onPause',
    labelKey: 'toolkit.pause',
    labelFallback: 'PAUSE',
    labelFallbackAr: 'إيقاف',
  },
  {
    id: 'complete',
    icon: '✅',
    color: '#52c41a',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    action: 'onComplete',
    labelKey: 'toolkit.complete',
    labelFallback: 'DONE',
    labelFallbackAr: 'تم',
  },
  {
    id: 'incomplete',
    icon: '❌',
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    borderColor: '#ffa39e',
    action: 'onIncomplete',
    labelKey: 'toolkit.incomplete',
    labelFallback: 'NOT DONE',
    labelFallbackAr: 'لم يتم',
  },
  {
    id: 'help',
    icon: '🆘',
    color: '#1677ff',
    bgColor: '#e6f4ff',
    borderColor: '#91caff',
    action: 'onHelp',
    labelKey: 'toolkit.help',
    labelFallback: 'HELP',
    labelFallbackAr: 'مساعدة',
  },
];

export default function SimpleMode({
  onPause,
  onComplete,
  onIncomplete,
  onHelp,
  currentJobName,
  isJobActive,
}: SimpleModeProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const actionMap: Record<string, () => void> = {
    onPause,
    onComplete,
    onIncomplete,
    onHelp,
  };

  const handlePress = (btn: typeof BUTTONS[0]) => {
    Vibration.vibrate(50);
    actionMap[btn.action]?.();
  };

  return (
    <View style={styles.container}>
      {/* Current Job Header */}
      {currentJobName && (
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🔧</Text>
          <Text style={styles.headerText} numberOfLines={2}>
            {currentJobName}
          </Text>
          {isJobActive && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>
                {isAr ? 'نشط' : 'ACTIVE'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Big Buttons Grid */}
      <View style={styles.grid}>
        {BUTTONS.map((btn) => (
          <TouchableOpacity
            key={btn.id}
            style={[
              styles.button,
              {
                backgroundColor: btn.bgColor,
                borderColor: btn.borderColor,
              },
            ]}
            onPress={() => handlePress(btn)}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonIcon}>{btn.icon}</Text>
            <Text style={[styles.buttonLabel, { color: btn.color }]}>
              {isAr ? btn.labelFallbackAr : btn.labelFallback}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Simple Mode Indicator */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {isAr ? '🟢 الوضع البسيط' : '🟢 Simple Mode'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#262626',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f6ffed',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#52c41a',
    marginRight: 6,
  },
  activeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52c41a',
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'center',
    gap: 16,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 24,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  buttonIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  buttonLabel: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 14,
    color: '#8c8c8c',
    fontWeight: '600',
  },
});
