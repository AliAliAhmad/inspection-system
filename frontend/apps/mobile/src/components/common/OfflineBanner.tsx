import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOffline } from '../../providers/OfflineProvider';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Colors from requirements
const COLORS = {
  offline: '#f5222d',    // Red
  syncing: '#faad14',    // Yellow
  synced: '#52c41a',     // Green
  pending: '#1677ff',    // Blue
  white: '#ffffff',
  textDark: '#1f1f1f',
};

interface OfflineBannerProps {
  onPress?: () => void;
}

export default function OfflineBanner({ onPress }: OfflineBannerProps) {
  const { t } = useTranslation();
  const {
    isOnline,
    isSyncing,
    pendingCount,
    pendingDetails,
    triggerSync,
  } = useOffline();

  const [pulseAnim] = useState(new Animated.Value(1));

  // Start pulse animation when syncing
  React.useEffect(() => {
    if (isSyncing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSyncing, pulseAnim]);

  // Don't show if online and no pending items
  if (isOnline && pendingCount === 0) return null;

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onPress?.();
  };

  const handleRetry = () => {
    if (!isSyncing && isOnline) {
      triggerSync();
    }
  };

  // Determine banner style based on state
  const getBannerStyle = () => {
    if (!isOnline) return styles.offline;
    if (isSyncing) return styles.syncing;
    if (pendingDetails?.failedCount && pendingDetails.failedCount > 0) return styles.failed;
    return styles.pending;
  };

  // Render offline state
  const renderOfflineContent = () => (
    <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={0.8}>
      <View style={styles.iconContainer}>
        <View style={styles.offlineIcon}>
          <Text style={styles.iconText}>!</Text>
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>
          {t('sync.workingOffline', 'Working Offline')}
        </Text>
        {pendingCount > 0 && (
          <Text style={styles.subtitle}>
            {t('sync.changesSaved', 'Changes saved locally')}
          </Text>
        )}
      </View>
      {pendingCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingCount}</Text>
        </View>
      )}
      <View style={styles.chevron}>
        <Text style={styles.chevronText}>&gt;</Text>
      </View>
    </TouchableOpacity>
  );

  // Render syncing state
  const renderSyncingContent = () => (
    <View style={styles.row}>
      <View style={styles.iconContainer}>
        <Animated.View style={[styles.syncIcon, { opacity: pulseAnim }]}>
          <View style={styles.syncArrows}>
            <Text style={styles.syncArrowText}>&#x21BB;</Text>
          </View>
        </Animated.View>
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, styles.syncingTitle]}>
          {t('sync.syncing', 'Syncing...')}
        </Text>
        <Text style={[styles.subtitle, styles.syncingSubtitle]}>
          {pendingCount} {t('sync.itemsRemaining', 'items remaining')}
        </Text>
      </View>
      <TouchableOpacity onPress={handlePress} style={styles.viewButton}>
        <Text style={[styles.viewButtonText, styles.syncingButtonText]}>
          {t('sync.view', 'View')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Render pending/failed state (online with pending items)
  const renderPendingContent = () => {
    const hasFailed = pendingDetails?.failedCount && pendingDetails.failedCount > 0;

    return (
      <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={0.8}>
        <View style={styles.iconContainer}>
          {hasFailed ? (
            <View style={styles.failedIcon}>
              <Text style={styles.iconText}>!</Text>
            </View>
          ) : (
            <View style={styles.pendingIcon}>
              <Text style={styles.pendingIconText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.textContainer}>
          {hasFailed ? (
            <>
              <Text style={styles.title}>
                {t('sync.syncFailed', 'Sync Failed')}
              </Text>
              <Text style={styles.subtitle}>
                {pendingDetails?.failedCount} {t('sync.itemsFailed', 'items failed')}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {pendingCount} {t('sync.pendingChanges', 'pending changes')}
              </Text>
              <Text style={styles.subtitle}>
                {t('sync.tapToSync', 'Tap to sync now')}
              </Text>
            </>
          )}
        </View>
        <TouchableOpacity
          onPress={handleRetry}
          style={[styles.retryButton, hasFailed ? styles.retryButtonFailed : undefined]}
          disabled={isSyncing}
        >
          <Text style={[styles.retryButtonText, hasFailed ? styles.retryButtonTextFailed : undefined]}>
            {t('common.retry', 'Retry')}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, getBannerStyle()]}>
      {!isOnline
        ? renderOfflineContent()
        : isSyncing
          ? renderSyncingContent()
          : renderPendingContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  offline: {
    backgroundColor: COLORS.offline,
  },
  syncing: {
    backgroundColor: COLORS.syncing,
  },
  pending: {
    backgroundColor: COLORS.pending,
  },
  failed: {
    backgroundColor: COLORS.offline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginRight: 12,
  },
  offlineIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingIconText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  syncIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncArrows: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncArrowText: {
    fontSize: 20,
    color: COLORS.textDark,
  },
  iconText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  syncingTitle: {
    color: COLORS.textDark,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  syncingSubtitle: {
    color: 'rgba(0,0,0,0.6)',
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  chevron: {
    paddingLeft: 4,
  },
  chevronText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  viewButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  viewButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  syncingButtonText: {
    color: COLORS.textDark,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  retryButtonFailed: {
    backgroundColor: COLORS.white,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  retryButtonTextFailed: {
    color: COLORS.offline,
  },
});
