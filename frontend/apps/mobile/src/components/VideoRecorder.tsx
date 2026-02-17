import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { getApiClient } from '@inspection/shared';

interface VideoRecorderProps {
  onVideoRecorded: (videoFileId: number, aiAnalysis?: { en: string; ar: string }) => void;
  onVideoDeleted?: () => void;
  existingVideoUrl?: string | null;
  disabled?: boolean;
}

export default function VideoRecorder({
  onVideoRecorded,
  onVideoDeleted,
  existingVideoUrl,
  disabled = false,
}: VideoRecorderProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [localVideoUri, setLocalVideoUri] = useState<string | null>(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(existingVideoUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoRef = useRef<Video | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when existingVideoUrl changes (new question)
  React.useEffect(() => {
    setCloudinaryUrl(existingVideoUrl || null);
    setLocalVideoUri(null);
    setIsPlaying(false);
    setIsRecording(false);
    setRecordingTime(0);
  }, [existingVideoUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAddVideo = useCallback(() => {
    Alert.alert(
      t('inspection.addVideo', 'Add Video'),
      t('inspection.chooseVideoSource', 'How would you like to add a video?'),
      [
        {
          text: t('inspection.recordVideo', 'Record Video'),
          onPress: async () => {
            try {
              const permission = await ImagePicker.requestCameraPermissionsAsync();
              if (!permission.granted) {
                Alert.alert(t('common.error'), t('inspection.cameraPermissionRequired', 'Camera access is needed for video recording.'));
                return;
              }

              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['videos'],
                quality: 0.7,
                videoMaxDuration: 60, // 1 minute max
              });

              if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                setLocalVideoUri(asset.uri);
                uploadVideo(asset.uri, asset.fileName || 'video.mp4');
              }
            } catch (err) {
              console.error('Failed to record video:', err);
              Alert.alert(t('common.error'), t('inspection.failedToRecordVideo', 'Failed to record video'));
            }
          },
        },
        {
          text: t('inspection.from_gallery', 'From Gallery'),
          onPress: async () => {
            try {
              const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!permission.granted) {
                Alert.alert(t('common.error'), t('inspection.galleryPermissionRequired', 'Gallery access is needed to select videos.'));
                return;
              }

              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                quality: 0.7,
              });

              if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                setLocalVideoUri(asset.uri);
                uploadVideo(asset.uri, asset.fileName || 'video.mp4');
              }
            } catch (err) {
              console.error('Failed to select video:', err);
              Alert.alert(t('common.error'), t('inspection.failedToSelectVideo', 'Failed to select video'));
            }
          },
        },
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
      ]
    );
  }, [t]);

  const uploadVideo = useCallback(async (uri: string, fileName: string) => {
    setIsUploading(true);

    try {
      // Read video file as base64
      console.log('Reading video as base64...', uri);
      let base64: string;
      try {
        base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        if (!base64) {
          throw new Error('File read returned empty result');
        }
        console.log('Base64 read successfully, length:', base64.length);
      } catch (readError: any) {
        console.error('Failed to read video file:', readError);
        Alert.alert('Error', `Failed to read video file: ${readError?.message || 'Unknown error'}`);
        throw readError;
      }

      console.log('Uploading video via base64...');

      // Always use generic file upload for videos (no AI analysis to save API credits)
      const endpoint = '/api/files/upload';
      const payload = {
        file_base64: base64,
        file_name: fileName,
        file_type: 'video/mp4',
        category: 'inspection_video',
      };

      console.log('Uploading video to:', endpoint);

      // Upload as JSON with base64
      const response = await getApiClient().post(
        endpoint,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 300000, // 5 minutes for video
        }
      );

      const responseData = (response.data as any);
      const result = responseData?.data;
      const aiAnalysis = responseData?.ai_analysis;

      console.log('Video upload response:', {
        hasFile: !!result?.id,
        hasVideoFile: !!result?.video_file,
        hasAiAnalysis: !!aiAnalysis,
        analysisFailed: responseData?.analysis_failed
      });

      // Extract file ID - may come from different places depending on endpoint
      const videoFile = result?.video_file || result;
      const fileId = videoFile?.id;
      const fileUrl = videoFile?.url || result?.url;

      if (fileId) {
        setCloudinaryUrl(fileUrl || null);
        onVideoRecorded(fileId, aiAnalysis);
      }
    } catch (err: any) {
      console.error('Failed to upload video:', err);
      let message = err?.response?.data?.message || err?.message || 'Failed to upload video';

      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        message = 'Upload timeout. The server may be starting up. Please try again in 30 seconds.';
      } else if (err?.message?.includes('Network Error') || !err?.response) {
        message = 'Network error. Please check your internet connection and try again.';
      }

      Alert.alert('Error', message);
    } finally {
      setIsUploading(false);
    }
  }, [onVideoRecorded]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t('inspection.deleteVideo', 'Delete Video'),
      t('inspection.deleteVideoConfirm', 'Are you sure you want to delete this video recording?'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setLocalVideoUri(null);
            setCloudinaryUrl(null);
            setIsPlaying(false);
            onVideoDeleted?.();
          },
        },
      ]
    );
  }, [onVideoDeleted]);

  const togglePlayback = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const hasVideo = !!(cloudinaryUrl || localVideoUri);
  const videoSource = cloudinaryUrl || localVideoUri;

  return (
    <View style={styles.container}>
      <View style={styles.recordingRow}>
        <TouchableOpacity
          style={[
            styles.videoButton,
            disabled && styles.buttonDisabled,
          ]}
          onPress={handleAddVideo}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.videoIcon}>🎥</Text>
          )}
        </TouchableOpacity>

        {isUploading ? (
          <Text style={styles.uploadingText}>{t('inspection.uploadingVideo', 'Uploading video...')}</Text>
        ) : hasVideo ? (
          <View style={styles.videoPlaybackContainer}>
            <View style={styles.videoPreviewWrapper}>
              <Video
                ref={videoRef}
                source={{ uri: videoSource! }}
                style={styles.videoThumbnail}
                resizeMode={ResizeMode.COVER}
                isLooping={false}
                onPlaybackStatusUpdate={(status) => {
                  if (status.isLoaded && status.didJustFinish) {
                    setIsPlaying(false);
                  }
                }}
              />
              <TouchableOpacity
                style={styles.playOverlay}
                onPress={togglePlayback}
              >
                <Text style={styles.playOverlayIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hintText}>{t('inspection.tapToRecordVideo', 'Tap to record video')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f2f5',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  videoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1677ff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  videoIcon: {
    fontSize: 22,
  },
  uploadingText: {
    fontSize: 13,
    color: '#1677ff',
  },
  hintText: {
    fontSize: 13,
    color: '#999',
  },
  videoPlaybackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  videoPreviewWrapper: {
    position: 'relative',
  },
  videoThumbnail: {
    width: 100,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
  },
  playOverlayIcon: {
    fontSize: 24,
    color: '#fff',
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff4d4f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    fontSize: 12,
  },
});
