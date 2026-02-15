import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  ActivityIndicator,
  Alert,
  Vibration,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';

// expo-location is optional - geolocation will be skipped if not available
let Location: any;
try {
  Location = require('expo-location');
} catch {
  // expo-location not installed
  Location = null;
}

// Status colors
const COLORS = {
  approved: '#52c41a',
  rejected: '#f5222d',
  pending: '#faad14',
  info: '#1677ff',
};

export type StampType = 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW' | 'INSPECTED' | 'VERIFIED';

export interface StampData {
  type: StampType;
  timestamp: string;
  signature: string; // SVG path or base64 image
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  userId: number;
  userName: string;
  userRole: string;
  notes?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  timestamp: string;
  user: string;
  details?: string;
}

export interface DigitalStampProps {
  /** User ID of the stamper */
  userId: number;
  /** User name */
  userName: string;
  /** User role for custom stamps */
  userRole: 'quality_engineer' | 'inspector' | 'supervisor' | 'admin';
  /** Called when stamp is applied */
  onStampApplied: (stampData: StampData) => void;
  /** Existing stamps (audit trail) */
  auditTrail?: AuditEntry[];
  /** Allow selecting stamp type */
  allowTypeSelection?: boolean;
  /** Default stamp type based on role */
  defaultStampType?: StampType;
  /** Require signature */
  requireSignature?: boolean;
  /** Require geolocation */
  requireGeolocation?: boolean;
  /** Compact mode */
  compact?: boolean;
}

const STAMP_CONFIG: Record<StampType, { en: string; ar: string; color: string; icon: string }> = {
  APPROVED: {
    en: 'APPROVED',
    ar: 'موافق عليه',
    color: COLORS.approved,
    icon: '...',
  },
  REJECTED: {
    en: 'REJECTED',
    ar: 'مرفوض',
    color: COLORS.rejected,
    icon: '...',
  },
  NEEDS_REVIEW: {
    en: 'NEEDS REVIEW',
    ar: 'يحتاج مراجعة',
    color: COLORS.pending,
    icon: '...',
  },
  INSPECTED: {
    en: 'INSPECTED',
    ar: 'تم الفحص',
    color: COLORS.info,
    icon: '...',
  },
  VERIFIED: {
    en: 'VERIFIED',
    ar: 'تم التحقق',
    color: '#722ed1',
    icon: '...',
  },
};

const ROLE_STAMPS: Record<string, StampType[]> = {
  quality_engineer: ['APPROVED', 'REJECTED', 'NEEDS_REVIEW'],
  inspector: ['INSPECTED', 'NEEDS_REVIEW'],
  supervisor: ['APPROVED', 'REJECTED', 'VERIFIED', 'NEEDS_REVIEW'],
  admin: ['APPROVED', 'REJECTED', 'VERIFIED', 'INSPECTED', 'NEEDS_REVIEW'],
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function DigitalStamp({
  userId,
  userName,
  userRole,
  onStampApplied,
  auditTrail = [],
  allowTypeSelection = true,
  defaultStampType = 'APPROVED',
  requireSignature = true,
  requireGeolocation = true,
  compact = false,
}: DigitalStampProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [stampType, setStampType] = useState<StampType>(defaultStampType);
  const [showStampModal, setShowStampModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signature, setSignature] = useState<string>('');
  const [paths, setPaths] = useState<Array<{ x: number; y: number }[]>>([]);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const [geolocation, setGeolocation] = useState<StampData['geolocation'] | null>(null);

  const stampAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  const availableStamps = ROLE_STAMPS[userRole] || ROLE_STAMPS.inspector;

  // Get geolocation when modal opens
  useEffect(() => {
    if ((showStampModal || showSignatureModal) && requireGeolocation && !geolocation) {
      getGeolocation();
    }
  }, [showStampModal, showSignatureModal, requireGeolocation, geolocation]);

  const getGeolocation = async () => {
    // Skip if expo-location is not available
    if (!Location) {
      console.warn('expo-location not available, skipping geolocation');
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('common.permission_required', 'Permission Required'),
          t('quality.location_permission', 'Location access is needed for digital stamping.')
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setGeolocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
      });
    } catch (err) {
      console.error('Failed to get location:', err);
    }
  };

  // Signature pad pan responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => [...prev, { x: locationX, y: locationY }]);
      },
      onPanResponderRelease: () => {
        if (currentPath.length > 0) {
          setPaths((prev) => [...prev, currentPath]);
          setCurrentPath([]);
        }
      },
    })
  ).current;

  const clearSignature = useCallback(() => {
    setPaths([]);
    setCurrentPath([]);
    setSignature('');
  }, []);

  const saveSignature = useCallback(() => {
    if (paths.length === 0) {
      Alert.alert(
        t('common.error', 'Error'),
        t('quality.signature_required', 'Please draw your signature.')
      );
      return;
    }

    // Convert paths to SVG path data
    const svgPath = paths
      .map((path) => {
        if (path.length === 0) return '';
        const start = `M ${path[0].x} ${path[0].y}`;
        const lines = path.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
        return `${start} ${lines}`;
      })
      .join(' ');

    setSignature(svgPath);
    setShowSignatureModal(false);
  }, [paths, t]);

  const handleStampPress = useCallback(() => {
    Animated.sequence([
      Animated.timing(pressAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pressAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (requireSignature && !signature) {
      setShowSignatureModal(true);
    } else {
      applyStamp();
    }
  }, [requireSignature, signature, pressAnim]);

  const applyStamp = useCallback(async () => {
    setIsLoading(true);
    Vibration.vibrate([0, 50, 50, 100]);

    // Animate stamp
    Animated.sequence([
      Animated.timing(stampAnim, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(stampAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      const stampData: StampData = {
        type: stampType,
        timestamp: new Date().toISOString(),
        signature: signature || 'N/A',
        geolocation: geolocation || undefined,
        userId,
        userName,
        userRole,
      };

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      onStampApplied(stampData);
      setShowStampModal(false);

      Alert.alert(
        t('common.success', 'Success'),
        t('quality.stamp_applied', 'Digital stamp applied successfully!')
      );
    } catch (err) {
      console.error('Failed to apply stamp:', err);
      Alert.alert(
        t('common.error', 'Error'),
        t('quality.stamp_failed', 'Failed to apply stamp. Please try again.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [stampType, signature, geolocation, userId, userName, userRole, onStampApplied, stampAnim, t]);

  const renderStampPreview = (type: StampType, size: 'small' | 'large' = 'large') => {
    const config = STAMP_CONFIG[type];
    const isSmall = size === 'small';

    return (
      <View
        style={[
          styles.stampPreview,
          isSmall && styles.stampPreviewSmall,
          { borderColor: config.color },
        ]}
      >
        <Text style={[styles.stampIcon, isSmall && styles.stampIconSmall]}>
          {config.icon}
        </Text>
        <Text
          style={[
            styles.stampText,
            isSmall && styles.stampTextSmall,
            { color: config.color },
          ]}
        >
          {isAr ? config.ar : config.en}
        </Text>
        {!isSmall && (
          <Text style={[styles.stampDate, { color: config.color }]}>
            {new Date().toLocaleDateString()}
          </Text>
        )}
      </View>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Quick Stamp Button */}
      <TouchableOpacity
        onPress={() => setShowStampModal(true)}
        activeOpacity={0.8}
      >
        <Animated.View
          style={[
            styles.mainButton,
            { backgroundColor: STAMP_CONFIG[stampType].color },
            { transform: [{ scale: pressAnim }] },
          ]}
        >
          <Text style={styles.mainButtonIcon}>{STAMP_CONFIG[stampType].icon}</Text>
          <Text style={styles.mainButtonText}>
            {isAr ? 'تطبيق الختم' : 'Apply Stamp'}
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Audit Trail Button */}
      {auditTrail.length > 0 && (
        <TouchableOpacity
          style={styles.auditButton}
          onPress={() => setShowAuditModal(true)}
        >
          <Text style={styles.auditIcon}>...</Text>
          <Text style={styles.auditText}>
            {isAr ? 'سجل التدقيق' : 'Audit Trail'} ({auditTrail.length})
          </Text>
        </TouchableOpacity>
      )}

      {/* Stamp Selection Modal */}
      <Modal visible={showStampModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isAr ? 'اختر الختم' : 'Select Stamp'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowStampModal(false)}
              >
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            {/* Stamp Type Selection */}
            {allowTypeSelection && (
              <View style={styles.stampGrid}>
                {availableStamps.map((type) => {
                  const config = STAMP_CONFIG[type];
                  const isSelected = stampType === type;

                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.stampOption,
                        isSelected && styles.stampOptionSelected,
                        isSelected && { borderColor: config.color },
                      ]}
                      onPress={() => setStampType(type)}
                    >
                      <Text style={[styles.stampOptionIcon, { backgroundColor: config.color + '20' }]}>
                        {config.icon}
                      </Text>
                      <Text
                        style={[
                          styles.stampOptionText,
                          isSelected && { color: config.color, fontWeight: '700' },
                        ]}
                      >
                        {isAr ? config.ar : config.en}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Preview */}
            <View style={styles.previewSection}>
              <Text style={styles.previewLabel}>
                {isAr ? 'معاينة' : 'Preview'}
              </Text>
              <Animated.View style={{ transform: [{ scale: stampAnim }] }}>
                {renderStampPreview(stampType)}
              </Animated.View>
            </View>

            {/* Signature Status */}
            {requireSignature && (
              <TouchableOpacity
                style={[styles.signatureRow, signature ? styles.signatureRowComplete : {}]}
                onPress={() => setShowSignatureModal(true)}
              >
                <Text style={styles.signatureIcon}>{signature ? '...' : '...'}</Text>
                <Text style={styles.signatureText}>
                  {signature
                    ? (isAr ? 'تم التوقيع' : 'Signed')
                    : (isAr ? 'التوقيع مطلوب' : 'Signature Required')}
                </Text>
                {!signature && <Text style={styles.tapText}>{isAr ? 'اضغط' : 'Tap'}</Text>}
              </TouchableOpacity>
            )}

            {/* Geolocation Status */}
            {requireGeolocation && (
              <View style={[styles.geoRow, geolocation ? styles.geoRowComplete : {}]}>
                <Text style={styles.geoIcon}>{geolocation ? '...' : '...'}</Text>
                <Text style={styles.geoText}>
                  {geolocation
                    ? `${geolocation.latitude.toFixed(4)}, ${geolocation.longitude.toFixed(4)}`
                    : (isAr ? 'جاري تحديد الموقع...' : 'Getting location...')}
                </Text>
              </View>
            )}

            {/* Apply Button */}
            <TouchableOpacity
              style={[
                styles.applyButton,
                { backgroundColor: STAMP_CONFIG[stampType].color },
                (requireSignature && !signature) && styles.applyButtonDisabled,
              ]}
              onPress={handleStampPress}
              disabled={isLoading || (requireSignature && !signature)}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.applyIcon}>{STAMP_CONFIG[stampType].icon}</Text>
                  <Text style={styles.applyText}>
                    {isAr ? 'تطبيق الختم' : 'Apply Stamp'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Signature Modal */}
      <Modal visible={showSignatureModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.signatureModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isAr ? 'التوقيع' : 'Signature'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowSignatureModal(false)}
              >
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.signatureHint}>
              {isAr ? 'ارسم توقيعك بإصبعك' : 'Draw your signature with your finger'}
            </Text>

            {/* Signature Canvas */}
            <View
              style={styles.signatureCanvas}
              {...panResponder.panHandlers}
            >
              {/* Render existing paths */}
              {paths.map((path, pIdx) => (
                <View key={pIdx} style={StyleSheet.absoluteFill} pointerEvents="none">
                  {path.map((point, idx) => {
                    if (idx === 0) return null;
                    const prev = path[idx - 1];
                    const angle = Math.atan2(point.y - prev.y, point.x - prev.x);
                    const length = Math.sqrt(
                      Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2)
                    );
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.signatureLine,
                          {
                            left: prev.x,
                            top: prev.y,
                            width: length,
                            transform: [{ rotate: `${angle}rad` }],
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
              {/* Render current path */}
              {currentPath.map((point, idx) => {
                if (idx === 0) return null;
                const prev = currentPath[idx - 1];
                const angle = Math.atan2(point.y - prev.y, point.x - prev.x);
                const length = Math.sqrt(
                  Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2)
                );
                return (
                  <View
                    key={`current-${idx}`}
                    style={[
                      styles.signatureLine,
                      {
                        left: prev.x,
                        top: prev.y,
                        width: length,
                        transform: [{ rotate: `${angle}rad` }],
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.signatureActions}>
              <TouchableOpacity style={styles.clearButton} onPress={clearSignature}>
                <Text style={styles.clearButtonText}>{isAr ? 'مسح' : 'Clear'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveSignatureButton, { backgroundColor: COLORS.approved }]}
                onPress={saveSignature}
              >
                <Text style={styles.saveSignatureText}>{isAr ? 'حفظ' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Audit Trail Modal */}
      <Modal visible={showAuditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.auditModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isAr ? 'سجل التدقيق' : 'Audit Trail'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowAuditModal(false)}
              >
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.auditList}>
              {auditTrail.map((entry, idx) => (
                <View
                  key={entry.id}
                  style={[styles.auditEntry, idx === 0 && styles.auditEntryFirst]}
                >
                  <View style={styles.auditDot} />
                  <View style={styles.auditInfo}>
                    <Text style={styles.auditAction}>{entry.action}</Text>
                    <Text style={styles.auditUser}>{entry.user}</Text>
                    <Text style={styles.auditTime}>{formatTimestamp(entry.timestamp)}</Text>
                    {entry.details && (
                      <Text style={styles.auditDetails}>{entry.details}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  containerCompact: {
    padding: 8,
  },
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mainButtonIcon: {
    fontSize: 24,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  auditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    gap: 8,
  },
  auditIcon: {
    fontSize: 16,
  },
  auditText: {
    fontSize: 14,
    color: '#595959',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#262626',
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#8c8c8c',
  },
  stampGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  stampOption: {
    width: (SCREEN_WIDTH - 56) / 2,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e8e8e8',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    gap: 8,
  },
  stampOptionSelected: {
    backgroundColor: '#fff',
  },
  stampOptionIcon: {
    fontSize: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 56,
  },
  stampOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#595959',
    textAlign: 'center',
  },
  previewSection: {
    padding: 20,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 14,
    color: '#8c8c8c',
    marginBottom: 12,
  },
  stampPreview: {
    width: 160,
    height: 120,
    borderWidth: 3,
    borderRadius: 8,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    transform: [{ rotate: '-5deg' }],
  },
  stampPreviewSmall: {
    width: 80,
    height: 60,
    borderWidth: 2,
  },
  stampIcon: {
    fontSize: 32,
  },
  stampIconSmall: {
    fontSize: 20,
  },
  stampText: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  stampTextSmall: {
    fontSize: 10,
  },
  stampDate: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    backgroundColor: '#fffbe6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffe58f',
    gap: 10,
  },
  signatureRowComplete: {
    backgroundColor: '#f6ffed',
    borderColor: '#b7eb8f',
  },
  signatureIcon: {
    fontSize: 20,
  },
  signatureText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#595959',
  },
  tapText: {
    fontSize: 13,
    color: COLORS.info,
    fontWeight: '600',
  },
  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    gap: 8,
  },
  geoRowComplete: {
    backgroundColor: '#f6ffed',
  },
  geoIcon: {
    fontSize: 16,
  },
  geoText: {
    fontSize: 13,
    color: '#595959',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyIcon: {
    fontSize: 24,
  },
  applyText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  signatureModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  signatureHint: {
    textAlign: 'center',
    fontSize: 14,
    color: '#8c8c8c',
    padding: 16,
  },
  signatureCanvas: {
    height: 200,
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  signatureLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#262626',
    transformOrigin: 'left center',
  },
  signatureActions: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  clearButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#595959',
  },
  saveSignatureButton: {
    flex: 2,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveSignatureText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  auditModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  auditList: {
    padding: 20,
  },
  auditEntry: {
    flexDirection: 'row',
    paddingLeft: 20,
    paddingBottom: 20,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.info,
    marginLeft: 10,
  },
  auditEntryFirst: {
    paddingTop: 0,
  },
  auditDot: {
    position: 'absolute',
    left: -6,
    top: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.info,
  },
  auditInfo: {
    flex: 1,
  },
  auditAction: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 4,
  },
  auditUser: {
    fontSize: 14,
    color: '#595959',
    marginBottom: 2,
  },
  auditTime: {
    fontSize: 12,
    color: '#8c8c8c',
  },
  auditDetails: {
    fontSize: 13,
    color: '#8c8c8c',
    marginTop: 4,
    fontStyle: 'italic',
  },
});

export default DigitalStamp;
