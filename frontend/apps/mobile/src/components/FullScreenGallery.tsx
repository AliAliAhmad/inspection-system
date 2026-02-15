import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
  Modal,
  FlatList,
  StatusBar,
  Platform,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 4;

export interface GalleryPhoto {
  id: string;
  uri: string;
  order: number;
}

export interface FullScreenGalleryProps {
  visible: boolean;
  photos: GalleryPhoto[];
  initialIndex: number;
  onClose: () => void;
  onDeletePhoto?: (id: string) => void;
}

interface ZoomableImageProps {
  uri: string;
  isActive: boolean;
  onSwipeDown: () => void;
}

function ZoomableImage({ uri, isActive, onSwipeDown }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart((event) => {
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const newScale = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      // Reset if scale is too small
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value > 1) {
        // When zoomed in, allow panning
        const maxTranslateX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
        const maxTranslateY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;

        translateX.value = Math.min(
          Math.max(savedTranslateX.value + event.translationX, -maxTranslateX),
          maxTranslateX
        );
        translateY.value = Math.min(
          Math.max(savedTranslateY.value + event.translationY, -maxTranslateY),
          maxTranslateY
        );
      } else {
        // When not zoomed, handle swipe down to close
        translateY.value = Math.max(0, event.translationY);
      }
    })
    .onEnd((event) => {
      if (scale.value <= 1 && event.translationY > 100 && event.velocityY > 0) {
        // Swipe down to close
        runOnJS(onSwipeDown)();
      } else {
        // Reset position
        translateY.value = withSpring(0);
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1) {
        // Reset to normal
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom in to 2x at tap position
        const newScale = 2;
        scale.value = withSpring(newScale);
        savedScale.value = newScale;

        // Center zoom on tap position
        const centerX = SCREEN_WIDTH / 2;
        const centerY = SCREEN_HEIGHT / 2;
        translateX.value = withSpring((centerX - event.x) * (newScale - 1));
        translateY.value = withSpring((centerY - event.y) * (newScale - 1));
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Simultaneous(panGesture, doubleTapGesture)
  );

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, 200],
      [1, 0.3],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: scale.value <= 1 ? opacity : 1,
    };
  });

  // Reset when becoming inactive
  React.useEffect(() => {
    if (!isActive) {
      scale.value = withTiming(1, { duration: 200 });
      savedScale.value = 1;
      translateX.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(0, { duration: 200 });
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [isActive]);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.imageContainer, animatedStyle]}>
        <Image
          source={{ uri }}
          style={styles.fullImage}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

export function FullScreenGallery({
  visible,
  photos,
  initialIndex,
  onClose,
  onDeletePhoto,
}: FullScreenGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);

  // Update current index when initial index changes
  React.useEffect(() => {
    setCurrentIndex(initialIndex);
    if (flatListRef.current && visible) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
      }, 100);
    }
  }, [initialIndex, visible]);

  const handleDelete = useCallback(() => {
    if (onDeletePhoto && photos[currentIndex]) {
      onDeletePhoto(photos[currentIndex].id);

      // If last photo, close gallery
      if (photos.length === 1) {
        onClose();
      }
    }
  }, [currentIndex, photos, onDeletePhoto, onClose]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const renderItem = useCallback(({ item, index }: { item: GalleryPhoto; index: number }) => (
    <View style={styles.slideContainer}>
      <ZoomableImage
        uri={item.uri}
        isActive={index === currentIndex}
        onSwipeDown={onClose}
      />
    </View>
  ), [currentIndex, onClose]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />

        {/* Background */}
        <View style={styles.background} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>

          <Text style={styles.counter}>
            {currentIndex + 1} / {photos.length}
          </Text>

          {onDeletePhoto && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Gallery */}
        <FlatList
          ref={flatListRef}
          data={photos}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={getItemLayout}
          initialScrollIndex={initialIndex}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          decelerationRate="fast"
          bounces={false}
          style={styles.flatList}
        />

        {/* Thumbnail strip at bottom */}
        {photos.length > 1 && (
          <View style={styles.thumbnailStrip}>
            {photos.map((photo, index) => (
              <TouchableOpacity
                key={photo.id}
                style={[
                  styles.stripThumbnail,
                  index === currentIndex && styles.stripThumbnailActive,
                ]}
                onPress={() => {
                  flatListRef.current?.scrollToIndex({
                    index,
                    animated: true,
                  });
                }}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.stripThumbnailImage}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsText}>
            Pinch to zoom  |  Double-tap to zoom  |  Swipe down to close
          </Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(244,67,54,0.8)',
    borderRadius: 20,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  flatList: {
    flex: 1,
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  thumbnailStrip: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  stripThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stripThumbnailActive: {
    borderColor: '#fff',
  },
  stripThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  instructions: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
});

export default FullScreenGallery;
