import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Keyboard,
} from 'react-native';

interface User {
  id: number;
  name: string;
  role?: string;
}

interface MentionInputProps {
  /** Current input value */
  value: string;
  /** Change handler */
  onChangeText: (text: string) => void;
  /** Submit handler */
  onSubmit: () => void;
  /** List of users for autocomplete */
  users: User[];
  /** Placeholder text */
  placeholder?: string;
  /** Is Arabic language */
  isAr?: boolean;
  /** Max length */
  maxLength?: number;
  /** Input ref */
  inputRef?: React.RefObject<TextInput>;
  /** Disable input */
  disabled?: boolean;
  /** Multi-line */
  multiline?: boolean;
}

/**
 * Text input with @mention autocomplete
 */
export function MentionInput({
  value,
  onChangeText,
  onSubmit,
  users,
  placeholder,
  isAr = false,
  maxLength = 2000,
  inputRef,
  disabled = false,
  multiline = true,
}: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const localInputRef = useRef<TextInput>(null);
  const ref = inputRef || localInputRef;

  // Extract mention query from current cursor position
  useEffect(() => {
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's a space after @ (mention completed or cancelled)
      if (!textAfterAt.includes(' ') && textAfterAt.length <= 20) {
        setMentionQuery(textAfterAt.toLowerCase());
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
        setMentionQuery('');
      }
    } else {
      setShowSuggestions(false);
      setMentionQuery('');
    }
  }, [value, cursorPosition]);

  // Filter users based on mention query
  const filteredUsers = useMemo(() => {
    if (!mentionQuery) return users.slice(0, 5);
    return users
      .filter((u) => u.name.toLowerCase().includes(mentionQuery))
      .slice(0, 5);
  }, [users, mentionQuery]);

  const handleSelectionChange = useCallback(
    (event: { nativeEvent: { selection: { start: number; end: number } } }) => {
      setCursorPosition(event.nativeEvent.selection.start);
    },
    []
  );

  const handleSelectUser = useCallback(
    (user: User) => {
      const textBeforeCursor = value.substring(0, cursorPosition);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      const textAfterCursor = value.substring(cursorPosition);

      // Replace the @query with @username
      const newText =
        value.substring(0, lastAtIndex) + `@${user.name} ` + textAfterCursor;

      onChangeText(newText);
      setShowSuggestions(false);

      // Focus back on input
      setTimeout(() => {
        ref.current?.focus();
      }, 100);
    },
    [value, cursorPosition, onChangeText, ref]
  );

  const handleKeyPress = useCallback(
    ({ nativeEvent }: { nativeEvent: { key: string } }) => {
      if (nativeEvent.key === 'Enter' && !multiline) {
        onSubmit();
      }
    },
    [onSubmit, multiline]
  );

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'admin':
        return '🛡️';
      case 'inspector':
        return '🔍';
      case 'specialist':
        return '🔧';
      case 'engineer':
        return '👷';
      case 'quality_engineer':
        return '✅';
      default:
        return '👤';
    }
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleSelectUser(item)}
      activeOpacity={0.7}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {item.name[0]?.toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        {item.role && (
          <Text style={styles.userRole}>
            {getRoleIcon(item.role)} {item.role}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Suggestions dropdown */}
      {showSuggestions && filteredUsers.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <View style={styles.suggestionsHeader}>
            <Text style={styles.suggestionsTitle}>
              {isAr ? 'اذكر شخص' : 'Mention someone'}
            </Text>
          </View>
          <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="always"
            style={styles.suggestionsList}
          />
        </View>
      )}

      {/* Text Input */}
      <TextInput
        ref={ref}
        style={[styles.input, isAr && styles.inputRtl]}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={handleSelectionChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        placeholderTextColor="#bfbfbf"
        multiline={multiline}
        maxLength={maxLength}
        editable={!disabled}
        textAlignVertical="center"
      />
    </View>
  );
}

/**
 * Parse text and highlight @mentions
 */
export function parseMentions(text: string): { text: string; isMention: boolean }[] {
  const parts: { text: string; isMention: boolean }[] = [];
  const regex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, match.index),
        isMention: false,
      });
    }
    // Add mention
    parts.push({
      text: match[0],
      isMention: true,
    });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      isMention: false,
    });
  }

  return parts;
}

/**
 * Render text with highlighted mentions
 */
export function MentionText({
  text,
  style,
  mentionStyle,
}: {
  text: string;
  style?: any;
  mentionStyle?: any;
}) {
  const parts = parseMentions(text);

  return (
    <Text style={style}>
      {parts.map((part, index) => (
        <Text
          key={index}
          style={[
            part.isMention && [styles.mentionHighlight, mentionStyle],
          ]}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#262626',
  },
  inputRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  // Suggestions
  suggestionsContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    boxShadow: '0px -2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 5,
    maxHeight: 200,
    overflow: 'hidden',
  },
  suggestionsHeader: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8c8c8c',
    textTransform: 'uppercase',
  },
  suggestionsList: {
    maxHeight: 160,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f5f5f5',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e6f4ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1677ff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  userRole: {
    fontSize: 11,
    color: '#8c8c8c',
    marginTop: 2,
  },
  // Mention highlight in text
  mentionHighlight: {
    color: '#1677ff',
    fontWeight: '600',
    backgroundColor: 'rgba(22, 119, 255, 0.1)',
    borderRadius: 2,
  },
});

export default MentionInput;
