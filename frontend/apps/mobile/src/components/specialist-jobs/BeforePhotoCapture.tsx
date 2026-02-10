import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { filesApi } from '@inspection/shared';

interface BeforePhotoCaptureProps {
  visible: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoPath: string) => void;
  jobId: number;
  jobTitle: string;
  loading?: boolean;
}

export function BeforePhotoCapture({
  visible,
  onClose,
  onPhotoCaptured,
  jobId,
  jobTitle,
  loading = false,
}: BeforePhotoCaptureProps) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.error'),
        t('jobs.camera_permission_required', 'Camera permission is required')
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      await handlePhoto(result.assets[0].uri);
    }
  }, []);

  const pickFromGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.error'),
        t('jobs.gallery_permission_required', 'Gallery permission is required')
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      await handlePhoto(result.assets[0].uri);
    }
  }, []);

  const handlePhoto = async (uri: string) => {
    setPhoto(uri);
    setUploading(true);

    try {
      // Create form data for upload
      const filename = uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      const formData = new FormData();
      formData.append('file', {
        uri,
        name: filename,
        type,
      } as any);
      formData.append('entity_type', 'specialist_job');
      formData.append('entity_id', String(jobId));
      formData.append('category', 'before_photo');

      const res = await filesApi.uploadFormData(formData);
      const fileData = res.data?.data;
      const filePath = fileData?.filename ? `/uploads/${fileData.filename}` : `/uploads/${filename}`;
      setPhotoPath(filePath);
    } catch (err) {
      Alert.alert(t('common.error'), t('common.upload_failed', 'Upload failed'));
      setPhoto(null);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    if (photoPath) {
      onPhotoCaptured(photoPath);
      handleReset();
    }
  };

  const handleReset = () => {
    setPhoto(null);
    setPhotoPath(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>📷 {t('jobs.before_photo', 'Before Photo')}</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {t(
                'jobs.before_photo_description',
                'Please take a photo of the equipment BEFORE starting work. This helps document the initial condition.'
              )}
            </Text>
          </View>

          <Text style={styles.jobTitle}>{jobTitle}</Text>

          {/* Photo Preview or Capture Options */}
          {photo ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: photo }} style={styles.previewImage} />
              {uploading && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.uploadingText}>
                    {t('common.uploading', 'Uploading...')}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={handleReset}
                disabled={uploading}
              >
                <Text style={styles.retakeButtonText}>🔄 {t('jobs.retake', 'Retake')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.captureContainer}>
              <View style={styles.cameraPlaceholder}>
                <Text style={styles.cameraIcon}>📷</Text>
                <Text style={styles.captureTitle}>
                  {t('jobs.capture_before_photo', 'Capture Before Photo')}
                </Text>
                <Text style={styles.captureSubtitle}>
                  {t('jobs.photo_equipment_condition', 'Take a clear photo showing the current equipment condition')}
                </Text>
              </View>

              <View style={styles.captureButtons}>
                <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
                  <Text style={styles.captureButtonIcon}>📷</Text>
                  <Text style={styles.captureButtonText}>
                    {t('inspection.take_photo', 'Take Photo')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.captureButton, styles.galleryButton]}
                  onPress={pickFromGallery}
                >
                  <Text style={styles.captureButtonIcon}>🖼️</Text>
                  <Text style={styles.captureButtonText}>
                    {t('inspection.from_gallery', 'Gallery')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            {photo && photoPath && (
              <TouchableOpacity
                style={[styles.confirmButton, loading && styles.buttonDisabled]}
                onPress={handleConfirm}
                disabled={loading || uploading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    ✓ {t('jobs.confirm_and_start', 'Confirm & Start')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    textAlign: 'center',
  },
  jobTitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20,
  },
  // Capture section
  captureContainer: {
    marginBottom: 20,
  },
  cameraPlaceholder: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e0e0e0',
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  cameraIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  captureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  captureSubtitle: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
  },
  captureButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  captureButton: {
    flex: 1,
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  galleryButton: {
    backgroundColor: '#7B1FA2',
  },
  captureButtonIcon: {
    fontSize: 18,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Preview section
  previewContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 12,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
  },
  retakeButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
  },
  retakeButtonText: {
    fontSize: 14,
    color: '#424242',
    fontWeight: '500',
  },
  // Actions
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bdbdbd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  confirmButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default BeforePhotoCapture;
