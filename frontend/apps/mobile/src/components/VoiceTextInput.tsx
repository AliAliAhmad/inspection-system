import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { TextInputProps } from 'react-native';
import { Audio } from 'expo-av';
import { voiceApi } from '@inspection/shared';

interface VoiceTextInputProps extends TextInputProps {
  onTranscribed?: (en: string, ar: string) => void;
}

export default function VoiceTextInput({ onTranscribed, style, ...inputProps }: VoiceTextInputProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [enText, setEnText] = useState<string | null>(null);
  const [arText, setArText] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [transcriptionFailed, setTranscriptionFailed] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Microphone access is needed for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = rec;
      setRecording(true);
    } catch {
      Alert.alert('Error', 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    setRecording(false);
    setTranscribing(true);
    setTranscriptionFailed(false);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setTranscribing(false);
        return;
      }

      // Save URI for local playback
      setAudioUri(uri);

      // Read the file and create a blob
      const response = await fetch(uri);
      const blob = await response.blob();

      const result = await voiceApi.transcribe(blob);

      if (result.transcription_failed) {
        setTranscriptionFailed(true);
        setEnText(null);
        setArText(null);
        Alert.alert('Voice Saved', 'Recording saved but transcription failed. You can type manually.');
      } else {
        setEnText(result.en);
        setArText(result.ar);

        // Put both languages into the input
        const parts: string[] = [];
        if (result.en) parts.push(`EN: ${result.en}`);
        if (result.ar) parts.push(`AR: ${result.ar}`);
        const combined = parts.join('\n');
        if (inputProps.onChangeText) {
          inputProps.onChangeText(combined);
        }

        onTranscribed?.(result.en, result.ar);
      }
    } catch {
      setTranscriptionFailed(true);
      Alert.alert('Voice Saved', 'Recording saved but transcription failed.');
    } finally {
      setTranscribing(false);
    }
  }, [inputProps.onChangeText, onTranscribed]);

  const handleMicPress = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  const playAudio = useCallback(async () => {
    if (!audioUri) return;

    try {
      // Stop any existing playback
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      soundRef.current = sound;
      setPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaying(false);
        }
      });

      await sound.playAsync();
    } catch {
      setPlaying(false);
    }
  }, [audioUri]);

  const stopAudio = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setPlaying(false);
    }
  }, []);

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          {...inputProps}
          style={[styles.textInput, style, { flex: 1 }]}
        />
        <TouchableOpacity
          style={[styles.micButton, recording && styles.micButtonRecording]}
          onPress={handleMicPress}
          disabled={transcribing}
        >
          {transcribing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.micIcon}>{recording ? '⏹' : '🎤'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {transcribing && (
        <Text style={styles.statusText}>Saving &amp; transcribing...</Text>
      )}

      {/* Audio playback button */}
      {audioUri && !recording && !transcribing && (
        <TouchableOpacity
          style={styles.audioPlayerRow}
          onPress={playing ? stopAudio : playAudio}
        >
          <Text style={styles.playIcon}>{playing ? '⏹' : '▶️'}</Text>
          <Text style={styles.audioLabel}>
            {playing ? 'Stop playback' : 'Play voice recording'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Transcription failure notice */}
      {transcriptionFailed && !transcribing && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Transcription failed — voice recording saved. Type your note manually.
          </Text>
        </View>
      )}

      {/* Transcription results */}
      {(enText || arText) && !transcribing && (
        <View style={styles.translationBox}>
          {enText ? <Text style={styles.translationLine}>EN: {enText}</Text> : null}
          {arText ? <Text style={[styles.translationLine, { textAlign: 'right' }]}>AR: {arText}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    backgroundColor: '#fff',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  micButton: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1677ff',
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  micButtonRecording: {
    backgroundColor: '#f5222d',
  },
  micIcon: {
    fontSize: 20,
    color: '#fff',
  },
  statusText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  audioPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    padding: 8,
    backgroundColor: '#f0f5ff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d6e4ff',
  },
  playIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  audioLabel: {
    fontSize: 12,
    color: '#1677ff',
  },
  warningBox: {
    marginTop: 4,
    padding: 6,
    backgroundColor: '#fffbe6',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffe58f',
  },
  warningText: {
    fontSize: 11,
    color: '#ad6800',
  },
  translationBox: {
    marginTop: 6,
    padding: 6,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  translationLine: {
    fontSize: 12,
    color: '#333',
    marginBottom: 2,
  },
});
