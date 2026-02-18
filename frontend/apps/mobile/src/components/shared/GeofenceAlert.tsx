/**
 * GeofenceAlert Component
 * Red zone alerts with geofencing notifications
 * Monitors user location against defined restricted/danger zones
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Modal,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

export type ZoneType = 'restricted' | 'danger' | 'high_risk' | 'authorized_only';

export interface GeoZoneDefinition {
  id: string;
  name: string;
  nameAr?: string;
  type: ZoneType;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  description?: string;
  descriptionAr?: string;
  /** Required clearance level to enter */
  clearanceRequired?: string;
  /** Contact person for zone */
  contactPerson?: string;
  contactPhone?: string;
}

export interface GeofenceViolation {
  zone: GeoZoneDefinition;
  distanceMeters: number;
  enteredAt: string;
  isInside: boolean;
}

export interface GeofenceAlertProps {
  /** User's current coordinates */
  userLatitude: number;
  userLongitude: number;
  /** Defined geo zones */
  zones: GeoZoneDefinition[];
  /** Warning distance in meters (alert before entering) */
  warningDistance?: number;
  /** Called when user enters a zone */
  onZoneEnter?: (zone: GeoZoneDefinition) => void;
  /** Called when user exits a zone */
  onZoneExit?: (zone: GeoZoneDefinition) => void;
  /** Called when user acknowledges alert */
  onAcknowledge?: (zoneId: string) => void;
  /** Whether alerts are enabled */
  enabled?: boolean;
}

const ZONE_CONFIG: Record<ZoneType, { color: string; bg: string; icon: string; label: string; labelAr: string }> = {
  restricted: { color: '#f5222d', bg: '#fff1f0', icon: '⛔', label: 'Restricted Zone', labelAr: 'منطقة محظورة' },
  danger: { color: '#ff4d4f', bg: '#fff1f0', icon: '☠️', label: 'Danger Zone', labelAr: 'منطقة خطرة' },
  high_risk: { color: '#fa8c16', bg: '#fff7e6', icon: '⚠️', label: 'High Risk Area', labelAr: 'منطقة عالية الخطورة' },
  authorized_only: { color: '#722ed1', bg: '#f9f0ff', icon: '🔒', label: 'Authorized Only', labelAr: 'للمصرح لهم فقط' },
};

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function GeofenceAlert({
  userLatitude,
  userLongitude,
  zones,
  warningDistance = 50,
  onZoneEnter,
  onZoneExit,
  onAcknowledge,
  enabled = true,
}: GeofenceAlertProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [violations, setViolations] = useState<GeofenceViolation[]>([]);
  const [acknowledgedZones, setAcknowledgedZones] = useState<Set<string>>(new Set());
  const [activeAlert, setActiveAlert] = useState<GeofenceViolation | null>(null);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Check zones against user position
  useEffect(() => {
    if (!enabled) return;

    const newViolations: GeofenceViolation[] = [];

    zones.forEach((zone) => {
      const distance = getDistanceMeters(
        userLatitude,
        userLongitude,
        zone.latitude,
        zone.longitude
      );

      const isInside = distance <= zone.radiusMeters;
      const isNearby = distance <= zone.radiusMeters + warningDistance;

      if (isInside || isNearby) {
        newViolations.push({
          zone,
          distanceMeters: Math.round(distance - zone.radiusMeters),
          enteredAt: new Date().toISOString(),
          isInside,
        });
      }
    });

    // Detect new zone entries
    newViolations.forEach((v) => {
      const wasInside = violations.find(
        (old) => old.zone.id === v.zone.id && old.isInside
      );
      if (v.isInside && !wasInside) {
        onZoneEnter?.(v.zone);
        // Strong haptic + vibration for zone entry
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Vibration.vibrate([0, 500, 200, 500]);
        setActiveAlert(v);
      }
    });

    // Detect zone exits
    violations.forEach((old) => {
      const stillInside = newViolations.find(
        (v) => v.zone.id === old.zone.id && v.isInside
      );
      if (old.isInside && !stillInside) {
        onZoneExit?.(old.zone);
      }
    });

    setViolations(newViolations);
  }, [userLatitude, userLongitude, zones, enabled, warningDistance]);

  // Pulse animation for active alerts
  useEffect(() => {
    if (violations.some((v) => v.isInside && !acknowledgedZones.has(v.zone.id))) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [violations, acknowledgedZones]);

  const handleAcknowledge = useCallback(
    (zoneId: string) => {
      setAcknowledgedZones((prev) => new Set([...prev, zoneId]));
      setActiveAlert(null);
      onAcknowledge?.(zoneId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [onAcknowledge]
  );

  const unacknowledgedViolations = useMemo(
    () => violations.filter((v) => !acknowledgedZones.has(v.zone.id)),
    [violations, acknowledgedZones]
  );

  if (!enabled || unacknowledgedViolations.length === 0) return null;

  return (
    <>
      {/* Inline alert banners */}
      {unacknowledgedViolations.map((violation) => {
        const config = ZONE_CONFIG[violation.zone.type];
        const zoneName = isAr && violation.zone.nameAr ? violation.zone.nameAr : violation.zone.name;

        return (
          <Animated.View
            key={violation.zone.id}
            style={[
              styles.alertBanner,
              { backgroundColor: config.bg, borderColor: config.color },
              violation.isInside && { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={[styles.alertRow, isAr && styles.rtlRow]}>
              <Text style={styles.alertIcon}>{config.icon}</Text>
              <View style={[styles.alertContent, isAr && { alignItems: 'flex-end' }]}>
                <Text style={[styles.alertTitle, { color: config.color }, isAr && styles.rtlText]}>
                  {violation.isInside
                    ? isAr
                      ? `⚠️ أنت داخل: ${zoneName}`
                      : `⚠️ Inside: ${zoneName}`
                    : isAr
                    ? `تقترب من: ${zoneName}`
                    : `Approaching: ${zoneName}`}
                </Text>
                <Text style={[styles.alertDistance, isAr && styles.rtlText]}>
                  {violation.isInside
                    ? isAr
                      ? config.labelAr
                      : config.label
                    : isAr
                    ? `${Math.abs(violation.distanceMeters)} متر`
                    : `${Math.abs(violation.distanceMeters)}m away`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.ackBtn, { borderColor: config.color }]}
                onPress={() => handleAcknowledge(violation.zone.id)}
              >
                <Text style={[styles.ackBtnText, { color: config.color }]}>
                  {isAr ? 'فهمت' : 'OK'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        );
      })}

      {/* Full-screen modal for critical zone entry */}
      {activeAlert && activeAlert.isInside && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => handleAcknowledge(activeAlert.zone.id)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalIcon}>
                {ZONE_CONFIG[activeAlert.zone.type].icon}
              </Text>
              <Text style={[styles.modalTitle, isAr && styles.rtlText]}>
                {isAr ? '⚠️ تحذير منطقة' : '⚠️ Zone Warning'}
              </Text>
              <Text style={[styles.modalZoneName, isAr && styles.rtlText]}>
                {isAr && activeAlert.zone.nameAr
                  ? activeAlert.zone.nameAr
                  : activeAlert.zone.name}
              </Text>
              <Text style={[styles.modalDescription, isAr && styles.rtlText]}>
                {isAr
                  ? ZONE_CONFIG[activeAlert.zone.type].labelAr
                  : ZONE_CONFIG[activeAlert.zone.type].label}
              </Text>
              {activeAlert.zone.description && (
                <Text style={[styles.modalDetail, isAr && styles.rtlText]}>
                  {isAr && activeAlert.zone.descriptionAr
                    ? activeAlert.zone.descriptionAr
                    : activeAlert.zone.description}
                </Text>
              )}
              {activeAlert.zone.contactPerson && (
                <Text style={styles.modalContact}>
                  📞 {activeAlert.zone.contactPerson}
                  {activeAlert.zone.contactPhone
                    ? ` — ${activeAlert.zone.contactPhone}`
                    : ''}
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor:
                      ZONE_CONFIG[activeAlert.zone.type].color,
                  },
                ]}
                onPress={() => handleAcknowledge(activeAlert.zone.id)}
              >
                <Text style={styles.modalButtonText}>
                  {isAr ? 'فهمت، متابعة' : 'Understood, Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  alertBanner: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 14,
    marginVertical: 4,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertIcon: {
    fontSize: 24,
  },
  alertContent: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  alertDistance: {
    fontSize: 13,
    fontWeight: '600',
    color: '#595959',
  },
  ackBtn: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ackBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 340,
  },
  modalIcon: {
    fontSize: 48,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#262626',
  },
  modalZoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f5222d',
  },
  modalDescription: {
    fontSize: 14,
    color: '#595959',
    textAlign: 'center',
  },
  modalDetail: {
    fontSize: 13,
    color: '#8c8c8c',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalContact: {
    fontSize: 13,
    color: '#1677ff',
    fontWeight: '500',
  },
  modalButton: {
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginTop: 8,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default GeofenceAlert;
