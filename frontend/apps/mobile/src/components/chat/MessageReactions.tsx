import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
} from 'react-native';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '✅', '👀'];

interface Reaction {
  emoji: string;
  count: number;
  users: { id: number; name: string }[];
  hasReacted: boolean;
}

interface MessageReactionsProps {
  /** Message ID */
  messageId: number;
  /** Existing reactions */
  reactions?: Reaction[];
  /** Whether this message is from the current user */
  isMe: boolean;
  /** Is Arabic language */
  isAr?: boolean;
  /** Callback when reaction is added/removed */
  onReact?: (messageId: number, emoji: string) => void;
}

export function MessageReactions({
  messageId,
  reactions = [],
  isMe,
  isAr = false,
  onReact,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  const handleLongPress = useCallback((event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setPickerPosition({ x: pageX, y: pageY });
    setShowPicker(true);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handleSelectReaction = useCallback((emoji: string) => {
    setShowPicker(false);
    scaleAnim.setValue(0);
    onReact?.(messageId, emoji);
  }, [messageId, onReact, scaleAnim]);

  const handleClosePickerPicker = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowPicker(false);
    });
  }, [scaleAnim]);

  const handleReactionPress = useCallback((emoji: string) => {
    onReact?.(messageId, emoji);
  }, [messageId, onReact]);

  // Group reactions by emoji
  const groupedReactions = reactions.reduce<Record<string, Reaction>>((acc, r) => {
    acc[r.emoji] = r;
    return acc;
  }, {});

  const hasReactions = reactions.length > 0;

  return (
    <>
      {/* Existing reactions display */}
      {hasReactions && (
        <View style={[styles.reactionsRow, isMe && styles.reactionsRowMe]}>
          {Object.values(groupedReactions).map((reaction) => (
            <TouchableOpacity
              key={reaction.emoji}
              style={[
                styles.reactionBadge,
                reaction.hasReacted && styles.reactionBadgeActive,
              ]}
              onPress={() => handleReactionPress(reaction.emoji)}
              activeOpacity={0.7}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              {reaction.count > 1 && (
                <Text style={styles.reactionCount}>{reaction.count}</Text>
              )}
            </TouchableOpacity>
          ))}
          {/* Add reaction button */}
          <TouchableOpacity
            style={styles.addReactionBtn}
            onPress={() => setShowPicker(true)}
          >
            <Text style={styles.addReactionIcon}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reaction Picker Modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="none"
        onRequestClose={handleClosePickerPicker}
      >
        <Pressable style={styles.pickerOverlay} onPress={handleClosePickerPicker}>
          <Animated.View
            style={[
              styles.pickerContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: scaleAnim,
              },
            ]}
          >
            <View style={styles.pickerRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.pickerEmoji}
                  onPress={() => handleSelectReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

// Component for showing the "Add Reaction" button inline with message
export function AddReactionButton({
  messageId,
  isMe,
  onReact,
}: {
  messageId: number;
  isMe: boolean;
  onReact?: (messageId: number, emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
    setShowPicker(true);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handleSelectReaction = useCallback((emoji: string) => {
    setShowPicker(false);
    scaleAnim.setValue(0);
    onReact?.(messageId, emoji);
  }, [messageId, onReact, scaleAnim]);

  const handleClose = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowPicker(false);
    });
  }, [scaleAnim]);

  return (
    <>
      <TouchableOpacity
        style={[styles.inlineReactBtn, isMe && styles.inlineReactBtnMe]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Text style={[styles.inlineReactIcon, isMe && styles.inlineReactIconMe]}>
          😊
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.pickerOverlay} onPress={handleClose}>
          <Animated.View
            style={[
              styles.pickerContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: scaleAnim,
              },
            ]}
          >
            <View style={styles.pickerRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.pickerEmoji}
                  onPress={() => handleSelectReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  reactionsRowMe: {
    alignSelf: 'flex-end',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  reactionBadgeActive: {
    backgroundColor: '#e6f4ff',
    borderWidth: 1,
    borderColor: '#1677ff',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    color: '#595959',
    fontWeight: '600',
  },
  addReactionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addReactionIcon: {
    fontSize: 14,
    color: '#8c8c8c',
    fontWeight: '600',
  },
  // Inline react button
  inlineReactBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.15)',
    elevation: 2,
    opacity: 0,
  },
  inlineReactBtnMe: {
    left: -8,
    right: 'auto',
  },
  inlineReactIcon: {
    fontSize: 14,
  },
  inlineReactIconMe: {
    // Same icon
  },
  // Picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 12,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.25)',
    elevation: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerEmojiText: {
    fontSize: 28,
  },
});

export default MessageReactions;
