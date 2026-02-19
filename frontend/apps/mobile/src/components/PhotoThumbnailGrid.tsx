import React, { useCallback } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 12;
const GRID_GAP = 8;
const NUM_COLUMNS = 3;
const THUMBNAIL_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export interface Photo {
  id: string;
  uri: string;
  isUploading?: boolean;
  uploadFailed?: boolean;
  order: number;
}

export interface PhotoThumbnailGridProps {
  photos: Photo[];
  onPhotoPress: (index: number) => void;
  onDeletePhoto: (id: string) => void;
  onReorderPhotos: (photos: Photo[]) => void;
  onAddPhoto: () => void;
  maxPhotos?: number;
  disabled?: boolean;
}

interface DraggableThumbnailProps {
  photo: Photo;
  index: number;
  onPress: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: (fromIndex: number, toIndex: number) => void;
  totalPhotos: number;
  disabled?: boolean;
}

function DraggableThumbnail({
  photo,
  index,
  onPress,
  onDelete,
  onDragStart,
  onDragEnd,
  totalPhotos,
  disabled,
}: DraggableThumbnailProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const calculateTargetIndex = useCallback((x: number, y: number) => {
    const col = Math.round(x / (THUMBNAIL_SIZE + GRID_GAP));
    const row = Math.round(y / (THUMBNAIL_SIZE + GRID_GAP));
    const targetIndex = row * NUM_COLUMNS + col + index;
    return Math.max(0, Math.min(targetIndex, totalPhotos - 1));
  }, [index, totalPhotos]);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.1);
      zIndex.value = 100;
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const targetIndex = calculateTargetIndex(event.translationX, event.translationY);

      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      isDragging.value = false;
      zIndex.value = 0;

      if (targetIndex !== index) {
        runOnJS(onDragEnd)(index, targetIndex);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    elevation: isDragging.value ? 10 : 2,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.thumbnailContainer, animatedStyle]}>
        <TouchableOpacity
          style={styles.thumbnailTouchable}
          onPress={onPress}
          activeOpacity={0.8}
          disabled={disabled}
        >
          <Image
            source={{ uri: photo.uri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />

          {/* Order badge */}
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>{index + 1}</Text>
          </View>

          {/* Uploading overlay */}
          {photo.isUploading && (
            <View style={styles.uploadingOverlay}>
              <Text style={styles.uploadingText}>...</Text>
            </View>
          )}

          {/* Upload failed indicator */}
          {photo.uploadFailed && (
            <View style={styles.failedBadge}>
              <Text style={styles.failedBadgeText}>!</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Delete button */}
        {!disabled && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={onDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.deleteButtonText}>x</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoThumbnailGrid({
  photos,
  onPhotoPress,
  onDeletePhoto,
  onReorderPhotos,
  onAddPhoto,
  maxPhotos = 10,
  disabled = false,
}: PhotoThumbnailGridProps) {
  const handleDragStart = useCallback(() => {
    // Can add haptic feedback here if needed
  }, []);

  const handleDragEnd = useCallback((fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);

    // Update order values
    const reorderedPhotos = newPhotos.map((photo, idx) => ({
      ...photo,
      order: idx,
    }));

    onReorderPhotos(reorderedPhotos);
  }, [photos, onReorderPhotos]);

  const canAddMore = photos.length < maxPhotos;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <DraggableThumbnail
            key={photo.id}
            photo={photo}
            index={index}
            onPress={() => onPhotoPress(index)}
            onDelete={() => onDeletePhoto(photo.id)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            totalPhotos={photos.length}
            disabled={disabled}
          />
        ))}

        {/* Add more button */}
        {canAddMore && !disabled && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={onAddPhoto}
            activeOpacity={0.7}
          >
            <View style={styles.addButtonInner}>
              <Text style={styles.addButtonIcon}>+</Text>
              <Text style={styles.addButtonText}>Add</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Photo count indicator */}
      {photos.length > 0 && (
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {photos.length}/{maxPhotos} photos
          </Text>
          {photos.length > 1 && (
            <Text style={styles.reorderHint}>Hold & drag to reorder</Text>
          )}
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: GRID_PADDING,
    gap: GRID_GAP,
  },
  thumbnailContainer: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
  },
  thumbnailTouchable: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  orderBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  failedBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.2)',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  addButton: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonInner: {
    alignItems: 'center',
  },
  addButtonIcon: {
    fontSize: 28,
    color: '#4CAF50',
    fontWeight: '300',
    lineHeight: 32,
  },
  addButtonText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 2,
  },
  countContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '500',
  },
  reorderHint: {
    fontSize: 11,
    color: '#9e9e9e',
    fontStyle: 'italic',
  },
});

export default PhotoThumbnailGrid;
