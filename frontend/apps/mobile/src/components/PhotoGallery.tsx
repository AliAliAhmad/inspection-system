import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PhotoThumbnailGrid, Photo } from './PhotoThumbnailGrid';
import { FullScreenGallery, GalleryPhoto } from './FullScreenGallery';

export interface PhotoGalleryProps {
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  onPhotoUpload: (uri: string, filename: string) => Promise<{ id: string; url: string } | null>;
  onPhotoDelete?: (photoId: string) => Promise<void>;
  maxPhotos?: number;
  disabled?: boolean;
  showCount?: boolean;
  allowReorder?: boolean;
}

export function PhotoGallery({
  photos,
  onPhotosChange,
  onPhotoUpload,
  onPhotoDelete,
  maxPhotos = 10,
  disabled = false,
  showCount = true,
  allowReorder = true,
}: PhotoGalleryProps) {
  const { t } = useTranslation();
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Animation for the add button
  const addButtonScale = useSharedValue(1);

  const addButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addButtonScale.value }],
  }));

  // Convert photos for gallery view
  const galleryPhotos: GalleryPhoto[] = useMemo(() =>
    photos.map(p => ({ id: p.id, uri: p.uri, order: p.order })),
    [photos]
  );

  // Handle adding a photo
  const handleAddPhoto = useCallback(async () => {
    if (photos.length >= maxPhotos) {
      Alert.alert(
        t('common.warning', 'Warning'),
        t('inspection.maxPhotosReached', `Maximum ${maxPhotos} photos allowed`)
      );
      return;
    }

    // Animate button press
    addButtonScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withSpring(1)
    );

    Alert.alert(
      t('inspection.addPhoto', 'Add Photo'),
      t('inspection.choosePhotoSource', 'How would you like to add a photo?'),
      [
        {
          text: t('inspection.takePhoto', 'Take Photo'),
          onPress: () => captureFromCamera(),
        },
        {
          text: t('inspection.fromGallery', 'From Gallery'),
          onPress: () => pickFromGallery(),
        },
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
      ]
    );
  }, [photos.length, maxPhotos, t]);

  const captureFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('inspection.cameraPermissionRequired', 'Camera permission is required'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      await processPhoto(result.assets[0].uri, result.assets[0].fileName || 'photo.jpg');
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('inspection.galleryPermissionRequired', 'Gallery permission is required'));
      return;
    }

    // Allow multiple selection
    const remainingSlots = maxPhotos - photos.length;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
    });

    if (!result.canceled && result.assets) {
      // Process each selected photo
      for (const asset of result.assets) {
        await processPhoto(asset.uri, asset.fileName || 'photo.jpg');
      }
    }
  };

  const processPhoto = async (uri: string, filename: string) => {
    // Create temporary photo entry
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPhoto: Photo = {
      id: tempId,
      uri,
      isUploading: true,
      uploadFailed: false,
      order: photos.length,
    };

    // Add to list immediately with loading state
    onPhotosChange([...photos, newPhoto]);

    // Trigger haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setIsUploading(true);

    try {
      // Upload the photo
      const result = await onPhotoUpload(uri, filename);

      if (result) {
        // Update with server response
        onPhotosChange(
          [...photos, newPhoto].map((p: Photo) =>
            p.id === tempId
              ? {
                  ...p,
                  id: result.id,
                  uri: result.url || uri,
                  isUploading: false,
                  uploadFailed: false,
                }
              : p
          )
        );

        // Success haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      // Mark as failed but keep the photo
      onPhotosChange(
        [...photos, newPhoto].map((p: Photo) =>
          p.id === tempId
            ? { ...p, isUploading: false, uploadFailed: true }
            : p
        )
      );

      // Error haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle photo press (open gallery)
  const handlePhotoPress = useCallback((index: number) => {
    setSelectedIndex(index);
    setGalleryVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Handle delete photo
  const handleDeletePhoto = useCallback(async (photoId: string) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('inspection.deletePhotoConfirm', 'Delete this photo?'),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            // Remove from local state first
            const updatedPhotos = photos
              .filter(p => p.id !== photoId)
              .map((p, idx) => ({ ...p, order: idx }));
            onPhotosChange(updatedPhotos);

            // Call server delete if provided
            if (onPhotoDelete) {
              try {
                await onPhotoDelete(photoId);
              } catch (error) {
                console.error('Failed to delete photo from server:', error);
              }
            }

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  }, [photos, onPhotosChange, onPhotoDelete, t]);

  // Handle delete from gallery view
  const handleGalleryDelete = useCallback(async (photoId: string) => {
    const updatedPhotos = photos
      .filter(p => p.id !== photoId)
      .map((p, idx) => ({ ...p, order: idx }));
    onPhotosChange(updatedPhotos);

    if (onPhotoDelete) {
      try {
        await onPhotoDelete(photoId);
      } catch (error) {
        console.error('Failed to delete photo from server:', error);
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [photos, onPhotosChange, onPhotoDelete]);

  // Handle reorder
  const handleReorderPhotos = useCallback((reorderedPhotos: Photo[]) => {
    onPhotosChange(reorderedPhotos);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onPhotosChange]);

  // Render compact view when no photos
  if (photos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Animated.View style={addButtonAnimatedStyle}>
          <TouchableOpacity
            style={styles.emptyAddButton}
            onPress={handleAddPhoto}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <View style={styles.emptyAddButtonContent}>
              <Text style={styles.emptyAddIcon}>+</Text>
              <Text style={styles.emptyAddText}>
                {t('inspection.addPhotos', 'Add Photos')}
              </Text>
              <Text style={styles.emptyAddSubtext}>
                {t('inspection.upToPhotos', `Up to ${maxPhotos} photos`)}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Photo count badge */}
      {showCount && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{photos.length}</Text>
        </View>
      )}

      {/* Thumbnail grid */}
      <PhotoThumbnailGrid
        photos={photos}
        onPhotoPress={handlePhotoPress}
        onDeletePhoto={handleDeletePhoto}
        onReorderPhotos={allowReorder ? handleReorderPhotos : () => {}}
        onAddPhoto={handleAddPhoto}
        maxPhotos={maxPhotos}
        disabled={disabled}
      />

      {/* Full screen gallery */}
      <FullScreenGallery
        visible={galleryVisible}
        photos={galleryPhotos}
        initialIndex={selectedIndex}
        onClose={() => setGalleryVisible(false)}
        onDeletePhoto={handleGalleryDelete}
      />

      {/* Upload indicator overlay */}
      {isUploading && photos.some(p => p.isUploading) && (
        <View style={styles.uploadingIndicator}>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.uploadingText}>
            {t('common.uploading', 'Uploading...')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  emptyContainer: {
    padding: 12,
  },
  emptyAddButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#4CAF50',
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    padding: 24,
    alignItems: 'center',
  },
  emptyAddButtonContent: {
    alignItems: 'center',
  },
  emptyAddIcon: {
    fontSize: 40,
    color: '#4CAF50',
    fontWeight: '300',
    lineHeight: 44,
    marginBottom: 8,
  },
  emptyAddText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 4,
  },
  emptyAddSubtext: {
    fontSize: 12,
    color: '#81C784',
  },
  countBadge: {
    position: 'absolute',
    top: 4,
    right: 12,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    zIndex: 10,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  uploadingIndicator: {
    position: 'absolute',
    top: 4,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
});

export default PhotoGallery;
