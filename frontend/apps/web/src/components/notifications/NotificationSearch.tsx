import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Input,
  AutoComplete,
  Typography,
  Space,
  Tag,
  Spin,
  Empty,
  Divider,
  List,
} from 'antd';
import {
  SearchOutlined,
  AudioOutlined,
  HistoryOutlined,
  BulbOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { notificationsApi, Notification } from '@inspection/shared';

const { Text } = Typography;

export interface NotificationSearchProps {
  onSearch: (query: string) => void;
  onSelect?: (notification: Notification) => void;
  placeholder?: string;
  allowVoice?: boolean;
  showSuggestions?: boolean;
  maxRecentSearches?: number;
}

const SEARCH_SUGGESTIONS = [
  'show critical from last week',
  'unread leave requests',
  'equipment alerts today',
  'mentions from John',
  'pending approvals',
  'defects assigned to me',
];

const RECENT_SEARCHES_KEY = 'notification_recent_searches';

export function NotificationSearch({
  onSearch,
  onSelect,
  placeholder,
  allowVoice = true,
  showSuggestions = true,
  maxRecentSearches = 5,
}: NotificationSearchProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Natural language search mutation
  const searchMutation = useMutation({
    mutationFn: (query: string) => notificationsApi.naturalLanguageSearch({ query, limit: 10 }),
  });

  // Debounced search using useRef for debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        if (query.length >= 3) {
          searchMutation.mutate(query);
        }
      }, 300);
    },
    [searchMutation]
  );

  const handleSearch = (value: string) => {
    setSearchValue(value);
    debouncedSearch(value);
  };

  const handleSelect = (value: string) => {
    setSearchValue(value);
    onSearch(value);
    saveRecentSearch(value);
    setIsOpen(false);
  };

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      onSearch(searchValue.trim());
      saveRecentSearch(searchValue.trim());
      setIsOpen(false);
    }
  };

  const saveRecentSearch = (query: string) => {
    const updated = [query, ...recentSearches.filter((s) => s !== query)].slice(
      0,
      maxRecentSearches
    );
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  // Voice recognition
  const startVoiceRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchValue(transcript);
      handleSelect(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Build dropdown options
  const buildOptions = () => {
    const options: any[] = [];

    // Search results
    if (searchMutation.data?.data?.data && searchMutation.data.data.data.length > 0) {
      options.push({
        label: (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {t('notifications.searchResults', 'Search Results')}
          </Text>
        ),
        options: searchMutation.data.data.data.map((notification: Notification) => ({
          value: notification.title,
          label: (
            <Space>
              <Text ellipsis style={{ maxWidth: 200 }}>
                {notification.title}
              </Text>
              <Tag color="blue" style={{ fontSize: 10 }}>
                {notification.type}
              </Tag>
            </Space>
          ),
          notification,
        })),
      });
    }

    // Recent searches
    if (recentSearches.length > 0 && !searchValue) {
      options.push({
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <HistoryOutlined /> {t('notifications.recentSearches', 'Recent Searches')}
            </Text>
            <Text
              type="secondary"
              style={{ fontSize: 11, cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                clearRecentSearches();
              }}
            >
              {t('common.clear', 'Clear')}
            </Text>
          </div>
        ),
        options: recentSearches.map((search) => ({
          value: search,
          label: (
            <Space>
              <HistoryOutlined style={{ color: '#999' }} />
              <Text>{search}</Text>
            </Space>
          ),
        })),
      });
    }

    // Suggestions
    if (showSuggestions && !searchValue) {
      options.push({
        label: (
          <Text type="secondary" style={{ fontSize: 11 }}>
            <BulbOutlined /> {t('notifications.trySaying', 'Try saying...')}
          </Text>
        ),
        options: SEARCH_SUGGESTIONS.slice(0, 4).map((suggestion) => ({
          value: suggestion,
          label: (
            <Space>
              <BulbOutlined style={{ color: '#faad14' }} />
              <Text type="secondary">{suggestion}</Text>
            </Space>
          ),
        })),
      });
    }

    return options;
  };

  const handleOptionSelect = (value: string, option: any) => {
    if (option.notification && onSelect) {
      onSelect(option.notification);
    } else {
      handleSelect(value);
    }
  };

  return (
    <AutoComplete
      ref={inputRef}
      value={searchValue}
      options={buildOptions()}
      onSearch={handleSearch}
      onSelect={handleOptionSelect}
      onDropdownVisibleChange={setIsOpen}
      open={isOpen}
      style={{ width: '100%' }}
      dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
      notFoundContent={
        searchMutation.isPending ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin size="small" />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{t('notifications.searching', 'Searching...')}</Text>
            </div>
          </div>
        ) : searchValue.length >= 3 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('notifications.noResultsFound', 'No results found')}
          />
        ) : null
      }
    >
      <Input
        placeholder={placeholder || t('notifications.searchPlaceholder', 'Search notifications... (Try: "show critical from last week")')}
        prefix={<SearchOutlined style={{ color: '#999' }} />}
        suffix={
          <Space size={4}>
            {searchValue && (
              <CloseCircleOutlined
                style={{ color: '#999', cursor: 'pointer' }}
                onClick={() => {
                  setSearchValue('');
                  inputRef.current?.focus();
                }}
              />
            )}
            {allowVoice && (
              <AudioOutlined
                style={{
                  color: isListening ? '#1677ff' : '#999',
                  cursor: 'pointer',
                  animation: isListening ? 'pulse 1s infinite' : undefined,
                }}
                onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
              />
            )}
          </Space>
        }
        onPressEnter={handleSearchSubmit}
        size="large"
      />
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </AutoComplete>
  );
}

export default NotificationSearch;
