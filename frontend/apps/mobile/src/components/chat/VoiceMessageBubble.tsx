import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Audio } from 'expo-av';

interface VoiceMessageBubbleProps {
  /** Cloudinary URL of the voice message */
  mediaUrl: string;
  /** Duration in seconds */
  duration: number;
  /** Whether this message is from the current user */
  isMe: boolean;
  /** Transcription text (if available) */
  transcription?: string | null;
  /** Show transcription toggle */
  showTranscription?: boolean;
  /** Is Arabic language */
  isAr?: boolean;
}

/**
 * Generate waveform image URL from Cloudinary audio URL
 */
function getWaveformUrl(url: string, isMe: boolean): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  // Use different colors for sender vs receiver
  const fgColor = isMe ? 'ffffff' : '1677ff';
  const bgColor = isMe ? '1677ff' : 'e6f4ff';
  return url
    .replace('/upload/', `/upload/fl_waveform,co_rgb:${fgColor},b_rgb:${bgColor},w_160,h_36/`)
    .replace(/\.[^.]+$/, '.png');
}

/**
 * Convert Cloudinary audio URL to MP3 format for better iOS compatibility
 */
function getAudioMp3Url(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_mp3/');
}

export function VoiceMessageBubble({
  mediaUrl,
  duration,
  isMe,
  transcription,
  showTranscription = false,
  isAr = false,
}: VoiceMessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showText, setShowText] = useState(showTranscription);
  const soundRef = useRef<Audio.Sound | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const waveformUrl = useMemo(() => getWaveformUrl(mediaUrl, isMe), [mediaUrl, isMe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handlePlayPause = useCallback(async () => {
    if (isLoading) return;

    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }

    try {
      setIsLoading(true);

      // If we have an existing sound, resume it
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          await soundRef.current.playAsync();
          setIsPlaying(true);
          setIsLoading(false);
          return;
        }
      }

      // Create new sound
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const playUrl = getAudioMp3Url(mediaUrl);
      const { sound } = await Audio.Sound.createAsync(
        { uri: playUrl },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;

          const positionMs = status.positionMillis || 0;
          const durationMs = status.durationMillis || (duration * 1000);
          const newProgress = durationMs > 0 ? positionMs / durationMs : 0;
          setProgress(newProgress);

          // Animate progress bar
          Animated.timing(progressAnim, {
            toValue: newProgress,
            duration: 100,
            useNativeDriver: false,
          }).start();

          if (status.didJustFinish) {
            setIsPlaying(false);
            setProgress(0);
            progressAnim.setValue(0);
          }
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to play voice message:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isLoading, mediaUrl, duration, progressAnim]);

  const toggleTranscription = useCallback(() => {
    setShowText(!showText);
  }, [showText]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={[styles.voiceRow, isMe && styles.voiceRowMe]}>
        {/* Play/Pause Button */}
        <TouchableOpacity
          style={[styles.playBtn, isMe && styles.playBtnMe]}
          onPress={handlePlayPause}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={isMe ? '#1677ff' : '#fff'} />
          ) : (
            <Text style={[styles.playIcon, isMe && styles.playIconMe]}>
              {isPlaying ? '⏸️' : '▶️'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Waveform with progress overlay */}
        <View style={styles.waveformContainer}>
          {waveformUrl ? (
            <>
              <Image
                source={{ uri: waveformUrl }}
                style={styles.waveform}
                resizeMode="cover"
              />
              <Animated.View
                style={[
                  styles.progressOverlay,
                  { width: progressWidth },
                  isMe && styles.progressOverlayMe,
                ]}
              />
            </>
          ) : (
            // Fallback animated bars
            <View style={styles.barsContainer}>
              {Array.from({ length: 20 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    { height: 8 + Math.sin(i * 0.5) * 12 + Math.random() * 8 },
                    isMe && styles.barMe,
                    progress > i / 20 && styles.barPlayed,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Duration */}
        <Text style={[styles.duration, isMe && styles.durationMe]}>
          {formatDuration(Math.round(progress * duration) || duration)}
        </Text>
      </View>

      {/* Transcription toggle */}
      {transcription && (
        <TouchableOpacity
          style={styles.transcriptionToggle}
          onPress={toggleTranscription}
        >
          <Text style={[styles.transcriptionToggleText, isMe && styles.transcriptionToggleTextMe]}>
            {showText ? (isAr ? 'اخفاء النص' : 'Hide text') : (isAr ? 'عرض النص' : 'Show text')}
            {showText ? ' ▲' : ' ▼'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Transcription text */}
      {showText && transcription && (
        <View style={[styles.transcriptionBox, isMe && styles.transcriptionBoxMe]}>
          <Text style={[styles.transcriptionText, isMe && styles.transcriptionTextMe]}>
            {transcription}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 200,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceRowMe: {
    // No changes needed, just for clarity
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1677ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtnMe: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  playIcon: {
    fontSize: 16,
  },
  playIconMe: {
    // Emoji icons don't need color change
  },
  waveformContainer: {
    flex: 1,
    height: 36,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  waveform: {
    width: '100%',
    height: '100%',
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(22, 119, 255, 0.15)',
  },
  progressOverlayMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    paddingHorizontal: 4,
  },
  bar: {
    width: 3,
    backgroundColor: '#91caff',
    borderRadius: 1.5,
  },
  barMe: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  barPlayed: {
    backgroundColor: '#1677ff',
  },
  duration: {
    fontSize: 12,
    color: '#595959',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
  durationMe: {
    color: 'rgba(255,255,255,0.8)',
  },
  transcriptionToggle: {
    marginTop: 6,
  },
  transcriptionToggleText: {
    fontSize: 11,
    color: '#1677ff',
    fontWeight: '500',
  },
  transcriptionToggleTextMe: {
    color: 'rgba(255,255,255,0.8)',
  },
  transcriptionBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(22, 119, 255, 0.08)',
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#1677ff',
  },
  transcriptionBoxMe: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderLeftColor: 'rgba(255,255,255,0.5)',
  },
  transcriptionText: {
    fontSize: 12,
    color: '#262626',
    lineHeight: 16,
  },
  transcriptionTextMe: {
    color: 'rgba(255,255,255,0.9)',
  },
});

export default VoiceMessageBubble;
