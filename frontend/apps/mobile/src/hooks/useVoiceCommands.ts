import { useContext } from 'react';
import { VoiceCommandContext } from '../providers/VoiceCommandProvider';

/**
 * useVoiceCommands - Hook to access voice command functionality
 *
 * Provides:
 * - isListening: Whether voice recognition is active
 * - isEnabled: Whether voice commands are enabled in settings
 * - startListening: Function to start voice recognition
 * - stopListening: Function to stop voice recognition
 * - registerCommand: Register a custom command handler for current screen
 * - unregisterCommand: Remove a custom command handler
 * - lastCommand: The last recognized command
 * - lastTranscript: The raw transcript text
 */
export function useVoiceCommands() {
  const context = useContext(VoiceCommandContext);
  if (!context) {
    throw new Error('useVoiceCommands must be used within VoiceCommandProvider');
  }
  return context;
}

export type { VoiceCommandHandler, VoiceCommand, VoiceCommandContextValue } from '../providers/VoiceCommandProvider';
