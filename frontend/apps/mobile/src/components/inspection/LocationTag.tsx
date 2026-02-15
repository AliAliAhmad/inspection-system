/**
 * LocationTag Component
 * Displays GPS coordinates and address as a tag on inspection items
 * Auto-tags photos and answers with GPS location
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocation } from '../../hooks/useLocation';
import type { LocationData } from '../../hooks/useLocation';

export interface LocationTagProps {
  /** Called when location is captured */
  onLocationCaptured?: (location: LocationData) => void;
  /** Show compact version (coordinates only) */
  compact?: boolean;
  /** Pre-existing location to display */
  existingLocation?: LocationData | null;
  /** Whether to auto-capture on mount */
  autoCapture?: boolean;
  /** Show refresh button */
  showRefresh?: boolean;
}

export function LocationTag({
  onLocationCaptured,
  compact = false,
  existingLocation,
  autoCapture = true,
  showRefresh = true,
}: LocationTagProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const { location, isLoading, error, getCurrentLocation, hasPermission, openSettings } =
    useLocation({ autoRequest: autoCapture });

  const displayLocation = existingLocation || location;

  const handleRefresh = useCallback(async () => {
    const loc = await getCurrentLocation();
    if (loc && onLocationCaptured) {
      onLocationCaptured(loc);
    }
  }, [getCurrentLocation, onLocationCaptured]);

  const handleCapture = useCallback(async () => {
    const loc = await getCurrentLocation();
    if (loc && onLocationCaptured) {
      onLocationCaptured(loc);
    }
  }, [getCurrentLocation, onLocationCaptured]);

  // Auto-capture callback
  React.useEffect(() => {
    if (autoCapture && location && onLocationCaptured) {
      onLocationCaptured(location);
    }
  }, [location?.timestamp]);

  if (!hasPermission && !isLoading) {
    return (
      <TouchableOpacity style={styles.permissionTag} onPress={openSettings}>
        <Text style={styles.permissionIcon}>📍</Text>
        <Text style={[styles.permissionText, isAr && styles.rtlText]}>
          {isAr ? 'تفعيل الموقع' : 'Enable Location'}
        </Text>
      </TouchableOpacity>
    );
  }

  if (isLoading && !displayLocation) {
    return (
      <View style={styles.loadingTag}>
        <ActivityIndicator size="small" color="#1677ff" />
        <Text style={[styles.loadingText, isAr && styles.rtlText]}>
          {isAr ? 'جاري تحديد الموقع...' : 'Getting location...'}
        </Text>
      </View>
    );
  }

  if (error && !displayLocation) {
    return (
      <TouchableOpacity style={styles.errorTag} onPress={handleCapture}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, isAr && styles.rtlText]}>
          {isAr ? 'فشل تحديد الموقع - انقر للمحاولة' : 'Location failed - tap to retry'}
        </Text>
      </TouchableOpacity>
    );
  }

  if (!displayLocation) return null;

  const coords = displayLocation.coords;
  const coordsText = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
  const accuracyText = coords.accuracy
    ? `±${Math.round(coords.accuracy)}m`
    : '';

  if (compact) {
    return (
      <View style={[styles.compactTag, isAr && styles.rtlRow]}>
        <Text style={styles.compactIcon}>📍</Text>
        <Text style={styles.compactCoords} numberOfLines={1}>
          {coordsText}
        </Text>
        {accuracyText ? (
          <Text style={styles.accuracyBadge}>{accuracyText}</Text>
        ) : null}
        {showRefresh && (
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
            <Text style={styles.refreshIcon}>{isLoading ? '⏳' : '🔄'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.fullTag}>
      <View style={[styles.tagHeader, isAr && styles.rtlRow]}>
        <Text style={styles.tagIcon}>📍</Text>
        <Text style={[styles.tagTitle, isAr && styles.rtlText]}>
          {isAr ? 'الموقع' : 'Location'}
        </Text>
        {accuracyText ? (
          <Text style={styles.accuracyBadge}>{accuracyText}</Text>
        ) : null}
        {showRefresh && (
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
            <Text style={styles.refreshIcon}>{isLoading ? '⏳' : '🔄'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.coordsText, isAr && styles.rtlText]}>
        {coordsText}
      </Text>

      {displayLocation.address ? (
        <Text style={[styles.addressText, isAr && styles.rtlText]} numberOfLines={2}>
          {displayLocation.address}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  compactTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  compactIcon: {
    fontSize: 12,
  },
  compactCoords: {
    fontSize: 11,
    color: '#1677ff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  fullTag: {
    backgroundColor: '#f0f5ff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d6e4ff',
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tagIcon: {
    fontSize: 14,
  },
  tagTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1677ff',
    flex: 1,
  },
  coordsText: {
    fontSize: 12,
    color: '#595959',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 12,
    color: '#8c8c8c',
    lineHeight: 16,
  },
  accuracyBadge: {
    fontSize: 10,
    color: '#52c41a',
    backgroundColor: '#f6ffed',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  refreshBtn: {
    padding: 4,
  },
  refreshIcon: {
    fontSize: 14,
  },
  loadingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f5ff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 12,
    color: '#1677ff',
  },
  permissionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff7e6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ffd591',
  },
  permissionIcon: {
    fontSize: 14,
  },
  permissionText: {
    fontSize: 12,
    color: '#d48806',
    fontWeight: '500',
  },
  errorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff2f0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ffccc7',
  },
  errorIcon: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#cf1322',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default LocationTag;
