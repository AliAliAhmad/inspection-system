import { getApiClient } from './client';
import type { ApiResponse } from '../types/api-response.types';
import type {
  TeamChannel,
  TeamMessage,
  ChannelMember,
  SendMessagePayload,
  CreateChannelPayload,
  BroadcastPayload,
} from '../types/team-communication.types';

export const teamCommunicationApi = {
  // Channels
  getChannels() {
    return getApiClient().get<ApiResponse<TeamChannel[]>>('/api/communication/channels');
  },

  createChannel(data: CreateChannelPayload) {
    return getApiClient().post<ApiResponse<TeamChannel>>('/api/communication/channels', data);
  },

  getChannelDetail(channelId: number) {
    return getApiClient().get<ApiResponse<TeamChannel>>(`/api/communication/channels/${channelId}`);
  },

  joinChannel(channelId: number) {
    return getApiClient().post<ApiResponse<ChannelMember>>(`/api/communication/channels/${channelId}/join`);
  },

  leaveChannel(channelId: number) {
    return getApiClient().post<ApiResponse>(`/api/communication/channels/${channelId}/leave`);
  },

  addMembers(channelId: number, memberIds: number[]) {
    return getApiClient().post<ApiResponse>(`/api/communication/channels/${channelId}/members`, { member_ids: memberIds });
  },

  // Messages
  getMessages(channelId: number, params?: { before_id?: number; per_page?: number }) {
    return getApiClient().get<ApiResponse<TeamMessage[]>>(`/api/communication/channels/${channelId}/messages`, { params });
  },

  sendMessage(channelId: number, data: SendMessagePayload) {
    return getApiClient().post<ApiResponse<TeamMessage>>(`/api/communication/channels/${channelId}/messages`, data);
  },

  deleteMessage(messageId: number) {
    return getApiClient().delete<ApiResponse>(`/api/communication/messages/${messageId}`);
  },

  markRead(channelId: number) {
    return getApiClient().post<ApiResponse>(`/api/communication/channels/${channelId}/read`);
  },

  toggleMute(channelId: number) {
    return getApiClient().post<ApiResponse<{ muted: boolean }>>(`/api/communication/channels/${channelId}/mute`);
  },

  // Broadcast
  broadcast(data: BroadcastPayload) {
    return getApiClient().post<ApiResponse>('/api/communication/broadcast', data);
  },

  // Search
  searchMessages(query: string) {
    return getApiClient().get<ApiResponse<TeamMessage[]>>('/api/communication/search', { params: { q: query } });
  },
};
