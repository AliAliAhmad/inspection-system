import { getApiClient } from './client';
import type { ApiResponse } from '../types/api-response.types';
import type { ToolkitPreference, QuickAction, VoiceCommandResult, NFCLookupResult } from '../types/toolkit.types';

export const toolkitApi = {
  getPreferences() {
    return getApiClient().get<ApiResponse<ToolkitPreference>>('/api/toolkit/preferences');
  },

  updatePreferences(data: Partial<ToolkitPreference>) {
    return getApiClient().put<ApiResponse<ToolkitPreference>>('/api/toolkit/preferences', data);
  },

  getQuickActions() {
    return getApiClient().get<ApiResponse<QuickAction[]>>('/api/toolkit/quick-actions');
  },

  nfcLookup(data: { tag_data?: string; serial_number?: string }) {
    return getApiClient().post<ApiResponse<NFCLookupResult>>('/api/toolkit/nfc/lookup', data);
  },

  voiceCommand(data: { text: string; language?: string }) {
    return getApiClient().post<ApiResponse<VoiceCommandResult>>('/api/toolkit/voice/command', data);
  },
};
