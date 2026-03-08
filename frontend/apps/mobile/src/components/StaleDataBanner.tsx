import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOffline } from '../providers/OfflineProvider';
import { offlineCache } from '../storage/offline-cache';

interface StaleDataBannerProps {
  cacheKey: string;
  thresholdHours?: number;
}

export default function StaleDataBanner({ cacheKey, thresholdHours = 24 }: StaleDataBannerProps) {
  const { t } = useTranslation();
  const { isOnline } = useOffline();
  const [staleHours, setStaleHours] = useState<number | null>(null);

  useEffect(() => {
    offlineCache.getTimestamp(cacheKey).then(ts => {
      if (ts) {
        const hours = Math.floor((Date.now() - ts) / (1000 * 60 * 60));
        if (hours >= thresholdHours) {
          setStaleHours(hours);
        } else {
          setStaleHours(null);
        }
      }
    });
  }, [cacheKey, thresholdHours]);

  // Only show when offline and data is stale
  if (isOnline || staleHours === null) return null;

  const days = Math.floor(staleHours / 24);
  const timeText = days > 0
    ? t('offline.days_ago', { count: days, defaultValue: `${days} day(s) ago` })
    : t('offline.hours_ago', { count: staleHours, defaultValue: `${staleHours} hour(s) ago` });

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>
        {t('offline.stale_data', { time: timeText, defaultValue: `Data from ${timeText} — may be outdated` })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  bannerText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
    fontWeight: '500',
  },
});
