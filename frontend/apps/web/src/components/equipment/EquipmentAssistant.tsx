import { useState, useRef, useEffect } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Typography,
  Spin,
  Avatar,
  Tag,
  Empty,
  message,
} from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  UserOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { equipmentApi } from '@inspection/shared';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
  confidence?: number;
}

interface EquipmentAssistantProps {
  equipmentId: number;
  equipmentName: string;
  compact?: boolean;
}

const suggestedQuestions = [
  'Why did this equipment stop?',
  'What is the current status?',
  'What are the recommendations?',
  'When was the last inspection?',
  'What issues have been detected?',
  'What is the risk assessment?',
];

export default function EquipmentAssistant({
  equipmentId,
  equipmentName,
  compact = false,
}: EquipmentAssistantProps) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isArabic = i18n.language === 'ar';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: isArabic
            ? `مرحبا! انا مساعد AI للمعدات. اسالني اي شيء عن ${equipmentName}.\n\nمثال:\n- لماذا توقفت؟\n- ما هي الحالة الحالية؟\n- ما هي التوصيات؟`
            : `Hello! I'm your AI equipment assistant. Ask me anything about ${equipmentName}.\n\nFor example:\n- Why did it stop?\n- What's the current status?\n- What are the recommendations?`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [equipmentName, isArabic]);

  const sendMessage = async (questionText?: string) => {
    const question = questionText || input.trim();
    if (!question || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await equipmentApi.askAIAssistant(equipmentId, question);
      const data = response.data?.data;

      if (data) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            timestamp: new Date(),
            sources: data.sources,
            confidence: data.confidence,
          },
        ]);
      } else {
        throw new Error('No response data');
      }
    } catch (err: any) {
      message.error('Failed to get response');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: isArabic
            ? 'عذرا، حدث خطا. يرجى المحاولة مرة اخرى.'
            : 'Sorry, an error occurred. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: isArabic
          ? `مرحبا! انا مساعد AI للمعدات. اسالني اي شيء عن ${equipmentName}.`
          : `Hello! I'm your AI equipment assistant. Ask me anything about ${equipmentName}.`,
        timestamp: new Date(),
      },
    ]);
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'default';
    if (confidence >= 90) return 'success';
    if (confidence >= 70) return 'processing';
    if (confidence >= 50) return 'warning';
    return 'error';
  };

  if (compact) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined />
            <span>AI Assistant</span>
          </Space>
        }
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={resetChat} />
        }
      >
        {/* Messages */}
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            marginBottom: 8,
          }}
        >
          {messages.slice(-3).map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: 8,
                textAlign: msg.role === 'user' ? 'right' : 'left',
              }}
            >
              <Tag color={msg.role === 'user' ? 'blue' : 'green'}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </Tag>
              <Text style={{ fontSize: 12 }}>{msg.content.slice(0, 100)}...</Text>
            </div>
          ))}
          {loading && <Spin size="small" />}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick questions */}
        <Space wrap size={4}>
          {suggestedQuestions.slice(0, 3).map((q, i) => (
            <Button
              key={i}
              size="small"
              type="dashed"
              onClick={() => sendMessage(q)}
              disabled={loading}
            >
              {q.slice(0, 20)}...
            </Button>
          ))}
        </Space>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <Avatar
            icon={<RobotOutlined />}
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          />
          <div>
            <Text strong>AI Equipment Assistant</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ask anything about {equipmentName}
            </Text>
          </div>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={resetChat}>
          New Chat
        </Button>
      }
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: 400 },
      }}
    >
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          background: '#f5f5f5',
        }}
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}
          >
            {msg.role === 'assistant' && (
              <Avatar
                size="small"
                icon={<RobotOutlined />}
                style={{
                  marginRight: 8,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              />
            )}
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? '#1677ff' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#000',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              <Paragraph
                style={{
                  margin: 0,
                  color: 'inherit',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </Paragraph>

              {/* Sources and confidence */}
              {msg.role === 'assistant' && (msg.sources || msg.confidence) && (
                <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                  {msg.confidence && (
                    <Tag color={getConfidenceColor(msg.confidence)} style={{ fontSize: 11 }}>
                      Confidence: {msg.confidence}%
                    </Tag>
                  )}
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Sources: {msg.sources.join(', ')}
                      </Text>
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                  marginTop: 4,
                  textAlign: 'right',
                }}
              >
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            {msg.role === 'user' && (
              <Avatar size="small" icon={<UserOutlined />} style={{ marginLeft: 8 }} />
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <Avatar
              size="small"
              icon={<RobotOutlined />}
              style={{
                marginRight: 8,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            />
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              <Spin size="small" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div style={{ padding: '8px 16px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
            <QuestionCircleOutlined /> Suggested questions:
          </Text>
          <Space wrap size={4}>
            {suggestedQuestions.map((q, i) => (
              <Button
                key={i}
                size="small"
                type="dashed"
                onClick={() => sendMessage(q)}
                disabled={loading}
              >
                {q}
              </Button>
            ))}
          </Space>
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          padding: 12,
          borderTop: '1px solid #e8e8e8',
          background: '#fff',
        }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={t('ai.typeMessage', 'Ask a question about this equipment...')}
            disabled={loading}
            autoSize={{ minRows: 1, maxRows: 3 }}
            style={{ borderRadius: '8px 0 0 8px' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => sendMessage()}
            loading={loading}
            style={{ borderRadius: '0 8px 8px 0', height: 'auto' }}
          />
        </Space.Compact>
      </div>
    </Card>
  );
}
