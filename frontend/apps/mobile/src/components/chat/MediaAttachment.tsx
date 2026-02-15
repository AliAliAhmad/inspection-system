import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
// expo-blur is optional - fallback to View if not available
let BlurView: any;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  // expo-blur not installed, will use fallback
  BlurView = null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MediaAttachmentProps {
  /** Type of media: 'photo' or 'video' */
  type: 'photo' | 'video';
  /** Main media URL */
  mediaUrl: string;
  /** Thumbnail URL (optional) */
  thumbnailUrl?: string | null;
  /** Whether this message is from the current user */
  isMe: boolean;
  /** Caption text */
  caption?: string | null;
  /** Is Arabic language */
  isAr?: boolean;
}

/**
 * Get optimized Cloudinary image URL for thumbnail
 */
function getThumbnailUrl(url: string, width: number = 200): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/w_${width},h_${width},c_fill,q_auto,f_auto/`);
}

/**
 * Get full resolution Cloudinary image URL
 */
function getFullImageUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/q_auto,f_auto/');
}

export function MediaAttachment({
  type,
  mediaUrl,
  thumbnailUrl,
  isMe,
  caption,
  isAr = false,
}: MediaAttachmentProps) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const displayUrl = thumbnailUrl || getThumbnailUrl(mediaUrl);
  const fullUrl = getFullImageUrl(mediaUrl);

  const handlePress = useCallback(() => {
    setShowFullscreen(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowFullscreen(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  return (
    <>
      {/* Thumbnail preview */}
      <TouchableOpacity
        style={[styles.thumbnailContainer, isMe && styles.thumbnailContainerMe]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={isMe ? '#fff' : '#1677ff'} />
          </View>
        )}

        {hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>
              {type === 'photo' ? '🖼️' : '🎬'}
            </Text>
            <Text style={[styles.errorText, isMe && styles.errorTextMe]}>
              {isAr ? 'فشل التحميل' : 'Failed to load'}
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: displayUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}

        {/* Video play overlay */}
        {type === 'video' && !hasError && (
          <View style={styles.playOverlay}>
            <View style={styles.playButton}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          </View>
        )}

        {/* Caption overlay */}
        {caption && (
          <View style={styles.captionOverlay}>
            <Text
              style={[styles.captionText, isAr && styles.rtlText]}
              numberOfLines={2}
            >
              {caption}
            </Text>
          </View>
        )}

        {/* Expand indicator */}
        <View style={[styles.expandIndicator, isMe && styles.expandIndicatorMe]}>
          <Text style={styles.expandIcon}>⤢</Text>
        </View>
      </TouchableOpacity>

      {/* Fullscreen modal */}
      <Modal
        visible={showFullscreen}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={styles.modalContainer}>
          {Platform.OS === 'ios' && BlurView ? (
            <BlurView intensity={95} style={StyleSheet.absoluteFill} tint="dark" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.androidBlur]} />
          )}

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>

          {/* Full image */}
          <View style={styles.fullImageContainer}>
            <Image
              source={{ uri: fullUrl }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </View>

          {/* Caption at bottom */}
          {caption && (
            <View style={styles.fullCaption}>
              <Text
                style={[styles.fullCaptionText, isAr && styles.rtlText]}
              >
                {caption}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>↓</Text>
              <Text style={styles.actionText}>
                {isAr ? 'حفظ' : 'Save'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>↗</Text>
              <Text style={styles.actionText}>
                {isAr ? 'مشاركة' : 'Share'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnailContainer: {
    width: 200,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e6f4ff',
    position: 'relative',
  },
  thumbnailContainerMe: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#8c8c8c',
    textAlign: 'center',
  },
  errorTextMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 20,
    color: '#fff',
    marginLeft: 4,
  },
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  captionText: {
    fontSize: 12,
    color: '#fff',
    lineHeight: 16,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  expandIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandIndicatorMe: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  expandIcon: {
    fontSize: 12,
    color: '#fff',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  androidBlur: {
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeIcon: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
  },
  fullImageContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  fullCaption: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
  },
  fullCaptionText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    fontSize: 24,
    color: '#fff',
  },
  actionText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
});

export default MediaAttachment;
