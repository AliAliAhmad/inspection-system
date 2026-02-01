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
  const recordingRef = useRef<Audio.Recording | null>(null);

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
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    setRecording(false);
    setTranscribing(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setTranscribing(false);
        return;
      }

      // Read the file and create a blob
      const response = await fetch(uri);
      const blob = await response.blob();

      const result = await voiceApi.transcribe(blob);
      setEnText(result.en);
      setArText(result.ar);

      // Set the input value
      const text = result.en || result.ar || '';
      if (inputProps.onChangeText) {
        inputProps.onChangeText(text);
      }

      onTranscribed?.(result.en, result.ar);
    } catch {
      Alert.alert('Error', 'Transcription failed');
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
        <Text style={styles.statusText}>Transcribing...</Text>
      )}

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
