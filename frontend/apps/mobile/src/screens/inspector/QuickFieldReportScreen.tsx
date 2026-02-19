import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import VoiceNoteRecorder from '../../components/VoiceNoteRecorder';
import { useTheme } from '../../hooks/useTheme';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { equipmentApi, defectsApi, getApiClient } from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'QuickFieldReport'>;

type ReportType = 'equipment' | 'safety';
type Severity = 'minor' | 'major' | 'critical';
type HazardType = 'spill' | 'obstruction' | 'structural' | 'electrical' | 'fire_risk' | 'other';

interface EquipmentResult {
  id: number;
  name: string;
  serial_number?: string;
}

export default function QuickFieldReportScreen() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { colors, isDark } = useTheme();

  // Report type
  const [reportType, setReportType] = useState<ReportType>(
    route.params?.type || 'equipment'
  );

  // Equipment fields
  const [equipmentQuery, setEquipmentQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentResult | null>(null);
  const [equipmentResults, setEquipmentResults] = useState<EquipmentResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Safety fields
  const [locationDesc, setLocationDesc] = useState('');
  const [hazardType, setHazardType] = useState<HazardType | null>(null);

  // Shared fields
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [voiceNoteId, setVoiceNoteId] = useState<number | null>(null);
  const [voiceTranscription, setVoiceTranscription] = useState<{ en: string; ar: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEquipment = reportType === 'equipment';
  const accentColor = isEquipment ? '#1677ff' : '#f5222d';
  const accentBg = isEquipment
    ? (isDark ? '#111d2c' : '#e6f4ff')
    : (isDark ? '#2a1215' : '#fff1f0');

  // Equipment search
  const handleEquipmentSearch = useCallback(async (query: string) => {
    setEquipmentQuery(query);
    setSelectedEquipment(null);
    if (query.length < 2) {
      setEquipmentResults([]);
      setShowResults(false);
      return;
    }
    try {
      const res = await equipmentApi.list({ search: query, page: 1, per_page: 5 });
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      const items = (Array.isArray(data) ? data : []).map((item: any) => ({
        id: item.id,
        name: item.name || item.asset_name || `#${item.id}`,
        serial_number: item.serial_number,
      }));
      setEquipmentResults(items);
      setShowResults(items.length > 0);
    } catch {
      setEquipmentResults([]);
      setShowResults(false);
    }
  }, []);

  const selectEquipment = useCallback((item: EquipmentResult) => {
    setSelectedEquipment(item);
    setEquipmentQuery(item.name);
    setShowResults(false);
  }, []);

  // Camera
  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('checklist.camera_permission_required'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }, [t]);

  // Voice note callback
  const handleVoiceNote = useCallback(
    (noteId: number, transcription?: { en: string; ar: string }) => {
      setVoiceNoteId(noteId);
      if (transcription) setVoiceTranscription(transcription);
    },
    []
  );

  // Submit
  const canSubmit = useMemo(() => {
    if (!photoUri) return false;
    if (isEquipment) return equipmentQuery.trim().length > 0 && severity !== null;
    return locationDesc.trim().length > 0 && hazardType !== null;
  }, [photoUri, isEquipment, equipmentQuery, severity, locationDesc, hazardType]);

  const clearForm = useCallback(() => {
    setPhotoUri(null);
    setEquipmentQuery('');
    setSelectedEquipment(null);
    setEquipmentResults([]);
    setShowResults(false);
    setLocationDesc('');
    setHazardType(null);
    setSeverity(null);
    setVoiceNoteId(null);
    setVoiceTranscription(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!photoUri) {
      Alert.alert(t('quick_report.photo_required', 'Photo required'));
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Upload photo via base64 (reliable on React Native)
      let uploadedPhotoUrl: string | undefined;
      try {
        const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });
        const uploadRes = await getApiClient().post('/api/files/upload', {
          file_base64: base64,
          file_name: `quick_report_${Date.now()}.jpg`,
          file_type: 'image/jpeg',
          category: 'field_report',
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,
        });
        uploadedPhotoUrl = (uploadRes.data as any)?.data?.url;
      } catch (uploadErr: any) {
        console.error('Photo upload failed:', uploadErr?.message);
        // Continue without photo URL
      }

      // 2. Build voice transcription text
      const voiceText = voiceTranscription
        ? `${voiceTranscription.en}${voiceTranscription.ar ? ` | ${voiceTranscription.ar}` : ''}`
        : undefined;

      // 3. Create the quick report (becomes a real defect)
      await defectsApi.createQuickReport({
        type: reportType,
        severity: isEquipment ? (severity || 'major') : 'major',
        equipment_id: isEquipment ? selectedEquipment?.id : undefined,
        description: voiceText || (isEquipment
          ? `Equipment issue: ${equipmentQuery}`
          : `Safety hazard at ${locationDesc}`),
        photo_url: uploadedPhotoUrl,
        voice_note_url: voiceNoteId ? `/api/voice/${voiceNoteId}` : undefined,
        voice_transcription: voiceText,
        hazard_type: !isEquipment ? (hazardType || undefined) : undefined,
        location: !isEquipment ? locationDesc : undefined,
      });

      // Clear the form
      clearForm();

      Alert.alert(
        t('quick_report.report_submitted', 'Report Submitted'),
        t('quick_report.report_submitted_message', 'Your report has been submitted successfully.'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('Quick report submission failed:', err);
      const message = err?.response?.data?.message || err?.message || 'Failed to submit report';
      Alert.alert(t('quick_report.report_failed', 'Submission Failed'), message);
    } finally {
      setIsSubmitting(false);
    }
  }, [photoUri, t, navigation, reportType, isEquipment, severity, selectedEquipment, equipmentQuery, locationDesc, hazardType, voiceNoteId, voiceTranscription, clearForm]);

  // Severity chips
  const severities: Severity[] = ['minor', 'major', 'critical'];
  const severityColors: Record<Severity, string> = {
    minor: '#52c41a',
    major: '#faad14',
    critical: '#f5222d',
  };

  // Hazard type chips
  const hazardTypes: HazardType[] = [
    'spill', 'obstruction', 'structural', 'electrical', 'fire_risk', 'other',
  ];

  const styles = useMemo(() => createStyles(colors, isDark, accentColor, accentBg, isAr), [colors, isDark, accentColor, accentBg, isAr]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons
            name={isAr ? 'chevron-forward' : 'chevron-back'}
            size={28}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('quick_report.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              { borderColor: '#1677ff' },
              reportType === 'equipment' && { backgroundColor: '#1677ff' },
            ]}
            onPress={() => setReportType('equipment')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="construct"
              size={18}
              color={reportType === 'equipment' ? '#fff' : '#1677ff'}
            />
            <Text
              style={[
                styles.toggleText,
                { color: reportType === 'equipment' ? '#fff' : '#1677ff' },
              ]}
            >
              {t('quick_report.equipment_issue')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleBtn,
              { borderColor: '#f5222d' },
              reportType === 'safety' && { backgroundColor: '#f5222d' },
            ]}
            onPress={() => setReportType('safety')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="warning"
              size={18}
              color={reportType === 'safety' ? '#fff' : '#f5222d'}
            />
            <Text
              style={[
                styles.toggleText,
                { color: reportType === 'safety' ? '#fff' : '#f5222d' },
              ]}
            >
              {t('quick_report.safety_hazard')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Photo Button -- prominent center */}
        <TouchableOpacity
          style={[styles.photoBtn, { borderColor: accentColor, backgroundColor: accentBg }]}
          onPress={takePhoto}
          activeOpacity={0.7}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoBtnInner}>
              <Ionicons name="camera" size={48} color={accentColor} />
              <Text style={[styles.photoBtnText, { color: accentColor }]}>
                {t('quick_report.take_photo')}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        {photoUri && (
          <TouchableOpacity onPress={takePhoto} style={styles.retakeRow}>
            <Ionicons name="camera-reverse" size={18} color={accentColor} />
            <Text style={[styles.retakeText, { color: accentColor }]}>
              {t('quick_report.take_photo')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Equipment-specific fields */}
        {isEquipment && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('quick_report.equipment_number')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  textAlign: isAr ? 'right' : 'left',
                },
              ]}
              placeholder={t('quick_report.search_equipment')}
              placeholderTextColor={colors.textTertiary}
              value={equipmentQuery}
              onChangeText={handleEquipmentSearch}
            />
            {showResults && (
              <View style={[styles.resultsDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {equipmentResults.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.resultItem, { borderBottomColor: colors.divider }]}
                    onPress={() => selectEquipment(item)}
                  >
                    <Text style={[styles.resultName, { color: colors.text }]}>{item.name}</Text>
                    {item.serial_number && (
                      <Text style={[styles.resultSerial, { color: colors.textTertiary }]}>
                        {item.serial_number}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Severity */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
              {t('quick_report.select_severity')}
            </Text>
            <View style={styles.chipRow}>
              {severities.map((sev) => (
                <TouchableOpacity
                  key={sev}
                  style={[
                    styles.chip,
                    {
                      borderColor: severityColors[sev],
                      backgroundColor: severity === sev ? severityColors[sev] : 'transparent',
                    },
                  ]}
                  onPress={() => setSeverity(sev)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: severity === sev ? '#fff' : severityColors[sev] },
                    ]}
                  >
                    {t(`quick_report.${sev}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Safety-specific fields */}
        {!isEquipment && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('quick_report.location')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  textAlign: isAr ? 'right' : 'left',
                },
              ]}
              placeholder={isAr ? 'مثال: بالقرب من الرافعة #3' : 'e.g., Near crane #3'}
              placeholderTextColor={colors.textTertiary}
              value={locationDesc}
              onChangeText={setLocationDesc}
            />

            {/* Hazard type chips */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
              {t('quick_report.hazard_type')}
            </Text>
            <View style={styles.chipRow}>
              {hazardTypes.map((ht) => (
                <TouchableOpacity
                  key={ht}
                  style={[
                    styles.chip,
                    {
                      borderColor: accentColor,
                      backgroundColor: hazardType === ht ? accentColor : 'transparent',
                    },
                  ]}
                  onPress={() => setHazardType(ht)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: hazardType === ht ? '#fff' : accentColor },
                    ]}
                  >
                    {t(`quick_report.hazard_${ht}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Voice Note */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('quick_report.record_voice')}
          </Text>
          <VoiceNoteRecorder
            onVoiceNoteRecorded={handleVoiceNote}
            language={isAr ? 'ar' : 'en'}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: canSubmit ? accentColor : colors.disabled },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.7}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={20} color={canSubmit ? '#fff' : colors.disabledText} />
              <Text
                style={[
                  styles.submitText,
                  { color: canSubmit ? '#fff' : colors.disabledText },
                ]}
              >
                {isSubmitting ? t('quick_report.submitting') : t('quick_report.submit_report')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: any,
  isDark: boolean,
  accentColor: string,
  accentBg: string,
  isAr: boolean,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },

    // Toggle
    toggleRow: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      gap: 12,
      marginBottom: 20,
    },
    toggleBtn: {
      flex: 1,
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 2,
    },
    toggleText: {
      fontSize: 14,
      fontWeight: '700',
    },

    // Photo
    photoBtn: {
      width: '100%',
      height: 180,
      borderRadius: 16,
      borderWidth: 2,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 8,
    },
    photoBtnInner: {
      alignItems: 'center',
      gap: 8,
    },
    photoBtnText: {
      fontSize: 16,
      fontWeight: '600',
    },
    photoPreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    retakeRow: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 16,
    },
    retakeText: {
      fontSize: 14,
      fontWeight: '600',
    },

    // Form sections
    section: {
      marginTop: 16,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: isAr ? 'right' : 'left',
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
    },

    // Autocomplete results
    resultsDropdown: {
      borderWidth: 1,
      borderRadius: 10,
      marginTop: 4,
      overflow: 'hidden',
    },
    resultItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultName: {
      fontSize: 15,
      fontWeight: '500',
    },
    resultSerial: {
      fontSize: 12,
      marginTop: 2,
    },

    // Chips
    chipRow: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1.5,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '700',
    },

    // Submit
    submitBtn: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 56,
      borderRadius: 14,
      marginTop: 28,
    },
    submitText: {
      fontSize: 17,
      fontWeight: '700',
    },
  });
}
