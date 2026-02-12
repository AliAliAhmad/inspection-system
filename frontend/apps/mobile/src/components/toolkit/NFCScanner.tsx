import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface NFCScannerProps {
  isVisible: boolean;
  onClose: () => void;
  onEquipmentFound: (equipment: any) => void;
  onManualEntry: () => void;
}

export default function NFCScanner({
  isVisible,
  onClose,
  onEquipmentFound,
  onManualEntry,
}: NFCScannerProps) {
  const { i18n } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAr = i18n.language === 'ar';

  const startScan = async () => {
    setIsScanning(true);
    setError(null);

    try {
      // Try NFC - dynamic import since it may not be installed
      let NfcManager: any = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        NfcManager = require('react-native-nfc-manager').default;
      } catch {
        NfcManager = null;
      }

      if (NfcManager) {
        await NfcManager.start();
        const tag = await NfcManager.requestTechnology([1]).catch(() => null);

        if (tag) {
          Vibration.vibrate(200);
          const tagData = tag?.id || '';
          onEquipmentFound({ tag_data: tagData });
          await NfcManager.cancelTechnologyRequest().catch(() => {});
        } else {
          setError(isAr ? 'لم يتم العثور على بطاقة NFC' : 'No NFC tag found');
        }
      } else {
        setError(isAr ? 'NFC غير متوفر - استخدم الإدخال اليدوي' : 'NFC not available - use manual entry');
      }
    } catch (err) {
      setError(isAr ? 'خطأ في المسح - حاول مرة أخرى' : 'Scan error - try again');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isAr ? '📡 مسح المعدات' : '📡 Scan Equipment'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {/* NFC Animation */}
            <View style={styles.scanArea}>
              {isScanning ? (
                <>
                  <ActivityIndicator size="large" color="#1677ff" />
                  <Text style={styles.scanText}>
                    {isAr ? 'جاري المسح...' : 'Scanning...'}
                  </Text>
                  <Text style={styles.scanHint}>
                    {isAr
                      ? 'ضع الهاتف بالقرب من بطاقة NFC'
                      : 'Hold phone near NFC tag'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.nfcIcon}>📡</Text>
                  <Text style={styles.scanText}>
                    {isAr ? 'جاهز للمسح' : 'Ready to Scan'}
                  </Text>
                </>
              )}
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            )}

            {/* Scan button */}
            <TouchableOpacity
              style={[styles.scanButton, isScanning && styles.scanButtonActive]}
              onPress={startScan}
              disabled={isScanning}
            >
              <Text style={styles.scanButtonText}>
                {isScanning
                  ? (isAr ? 'جاري المسح...' : 'Scanning...')
                  : (isAr ? '🔍 ابدأ المسح' : '🔍 Start Scan')}
              </Text>
            </TouchableOpacity>

            {/* Manual entry fallback */}
            <TouchableOpacity
              style={styles.manualButton}
              onPress={onManualEntry}
            >
              <Text style={styles.manualButtonText}>
                {isAr ? '⌨️ إدخال يدوي' : '⌨️ Manual Entry'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '85%',
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#262626',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#8c8c8c',
  },
  body: {
    padding: 24,
  },
  scanArea: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#fafafa',
    borderRadius: 16,
    marginBottom: 20,
  },
  nfcIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  scanText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#262626',
    marginTop: 12,
  },
  scanHint: {
    fontSize: 14,
    color: '#8c8c8c',
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#fff2f0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffa39e',
  },
  errorText: {
    color: '#ff4d4f',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  scanButton: {
    backgroundColor: '#1677ff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  scanButtonActive: {
    backgroundColor: '#91caff',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  manualButton: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  manualButtonText: {
    color: '#595959',
    fontSize: 16,
    fontWeight: '600',
  },
});
