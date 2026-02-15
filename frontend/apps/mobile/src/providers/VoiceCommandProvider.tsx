import React, {
  createContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { toolkitApi } from '@inspection/shared';
import { useTranslation } from 'react-i18next';

// Voice command types
export type VoiceCommandAction =
  | 'pause'
  | 'complete'
  | 'next'
  | 'pass'
  | 'fail'
  | 'stop'
  | 'help'
  | 'yes'
  | 'no'
  | 'custom';

export interface VoiceCommand {
  action: VoiceCommandAction;
  confidence: number;
  originalText: string;
  language: 'en' | 'ar';
}

export type VoiceCommandHandler = (command: VoiceCommand) => void;

export interface VoiceCommandContextValue {
  isListening: boolean;
  isEnabled: boolean;
  isSupported: boolean;
  lastCommand: VoiceCommand | null;
  lastTranscript: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  toggleListening: () => Promise<void>;
  registerCommand: (handler: VoiceCommandHandler) => void;
  unregisterCommand: (handler: VoiceCommandHandler) => void;
}

export const VoiceCommandContext = createContext<VoiceCommandContextValue | null>(null);

// Command mappings
const ARABIC_COMMANDS: Record<string, VoiceCommandAction> = {
  'وقف': 'pause',
  'توقف': 'pause',
  'ايقاف': 'pause',
  'كامل': 'complete',
  'اكمال': 'complete',
  'تم': 'complete',
  'خلاص': 'complete',
  'انتهيت': 'complete',
  'التالي': 'next',
  'التالى': 'next',
  'بعدين': 'next',
  'نعم': 'pass',
  'ايوه': 'pass',
  'اه': 'pass',
  'نجح': 'pass',
  'لا': 'fail',
  'فشل': 'fail',
  'مساعدة': 'help',
  'ساعدني': 'help',
};

const ENGLISH_COMMANDS: Record<string, VoiceCommandAction> = {
  'pause': 'pause',
  'stop': 'stop',
  'complete': 'complete',
  'done': 'complete',
  'finished': 'complete',
  'finish': 'complete',
  'next': 'next',
  'pass': 'pass',
  'passed': 'pass',
  'yes': 'pass',
  'fail': 'fail',
  'failed': 'fail',
  'no': 'fail',
  'help': 'help',
};

function parseCommand(text: string): VoiceCommand | null {
  const normalizedText = text.toLowerCase().trim();
  const words = normalizedText.split(/\s+/);

  // Check English commands first (single word match)
  for (const word of words) {
    if (ENGLISH_COMMANDS[word]) {
      return {
        action: ENGLISH_COMMANDS[word],
        confidence: 1.0,
        originalText: text,
        language: 'en',
      };
    }
  }

  // Check Arabic commands
  for (const word of words) {
    // Remove common Arabic diacritics
    const cleanWord = word.replace(/[\u064B-\u0652]/g, '');
    if (ARABIC_COMMANDS[cleanWord]) {
      return {
        action: ARABIC_COMMANDS[cleanWord],
        confidence: 1.0,
        originalText: text,
        language: 'ar',
      };
    }
  }

  // Fuzzy match for Arabic (check if command is part of text)
  for (const [arabic, action] of Object.entries(ARABIC_COMMANDS)) {
    if (normalizedText.includes(arabic)) {
      return {
        action,
        confidence: 0.8,
        originalText: text,
        language: 'ar',
      };
    }
  }

  return null;
}

interface VoiceCommandProviderProps {
  children: React.ReactNode;
}

export function VoiceCommandProvider({ children }: VoiceCommandProviderProps) {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const handlersRef = useRef<Set<VoiceCommandHandler>>(new Set());
  const isAppActiveRef = useRef(true);

  // Fetch user preferences to check if voice commands are enabled
  const { data: prefs } = useQuery({
    queryKey: ['toolkit-preferences'],
    queryFn: () => toolkitApi.getPreferences().then((r) => r.data.data),
    staleTime: 60_000,
  });

  const isEnabled = prefs?.voice_commands_enabled ?? false;
  const voiceLanguage = prefs?.voice_language ?? (i18n.language === 'ar' ? 'ar' : 'en');

  // Monitor app state
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      isAppActiveRef.current = nextState === 'active';
      if (nextState !== 'active' && isListening) {
        stopListening();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [isListening]);

  // Request audio permissions on mount
  useEffect(() => {
    async function requestPermissions() {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          setIsSupported(false);
          setError('Microphone permission not granted');
        }
      } catch {
        setIsSupported(false);
        setError('Failed to request audio permissions');
      }
    }
    requestPermissions();
  }, []);

  // Process recorded audio
  const processAudio = useCallback(
    async (recording: Audio.Recording) => {
      try {
        const uri = recording.getURI();
        if (!uri) return;

        // In a real implementation, you would send the audio to a speech-to-text service
        // For now, we'll use the backend voice command API if available
        // This is a placeholder for demonstration
        // const response = await toolkitApi.voiceCommand({ text: transcribedText, language: voiceLanguage });

        // Note: expo-av provides recording but not transcription
        // You would need to integrate with a service like:
        // - Google Cloud Speech-to-Text
        // - Azure Speech Services
        // - OpenAI Whisper API
        // - Deepgram
        // For this implementation, we simulate with the backend API

        // Haptic feedback on completion
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('Error processing audio:', err);
        setError('Failed to process voice command');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [voiceLanguage]
  );

  // Start listening
  const startListening = useCallback(async () => {
    if (!isEnabled || !isSupported || isListening) return;

    try {
      setError(null);

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Create and start recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsListening(true);

      // Haptic feedback to indicate listening started
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('Error starting voice recognition:', err);
      setError('Failed to start voice recognition');
      setIsListening(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [isEnabled, isSupported, isListening]);

  // Stop listening
  const stopListening = useCallback(async () => {
    if (!recordingRef.current) {
      setIsListening(false);
      return;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await processAudio(recordingRef.current);
    } catch (err) {
      console.error('Error stopping voice recognition:', err);
    } finally {
      recordingRef.current = null;
      setIsListening(false);

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
      });
    }
  }, [processAudio]);

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Register command handler
  const registerCommand = useCallback((handler: VoiceCommandHandler) => {
    handlersRef.current.add(handler);
  }, []);

  // Unregister command handler
  const unregisterCommand = useCallback((handler: VoiceCommandHandler) => {
    handlersRef.current.delete(handler);
  }, []);

  // Handle incoming transcripts (called when speech is recognized)
  const handleTranscript = useCallback(
    async (transcript: string) => {
      setLastTranscript(transcript);
      const command = parseCommand(transcript);

      if (command) {
        setLastCommand(command);

        // Haptic feedback on successful command recognition
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Notify all registered handlers
        handlersRef.current.forEach((handler) => {
          try {
            handler(command);
          } catch (err) {
            console.error('Error in voice command handler:', err);
          }
        });
      } else {
        // Haptic feedback for unrecognized command
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    []
  );

  // Expose handleTranscript for external use (e.g., testing or manual input)
  // This can be called by the overlay or other components
  const contextValue = useMemo<VoiceCommandContextValue>(
    () => ({
      isListening,
      isEnabled,
      isSupported,
      lastCommand,
      lastTranscript,
      error,
      startListening,
      stopListening,
      toggleListening,
      registerCommand,
      unregisterCommand,
    }),
    [
      isListening,
      isEnabled,
      isSupported,
      lastCommand,
      lastTranscript,
      error,
      startListening,
      stopListening,
      toggleListening,
      registerCommand,
      unregisterCommand,
    ]
  );

  return (
    <VoiceCommandContext.Provider value={contextValue}>
      {children}
    </VoiceCommandContext.Provider>
  );
}
