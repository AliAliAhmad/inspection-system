import { useState, useRef, useEffect } from 'react';
import { Button, Drawer, Input, Space, Typography, Spin, Avatar } from 'antd';
import { RobotOutlined, SendOutlined, CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { aiApi } from '@inspection/shared';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AiAssistantChat() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isArabic = i18n.language === 'ar';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: isArabic
          ? 'مرحباً! أنا مساعد الفحص الذكي. كيف يمكنني مساعدتك اليوم؟ يمكنني المساعدة في:\n• تشخيص مشاكل المعدات\n• فهم تقارير العيوب\n• اقتراح أولويات الإصلاح\n• الإجابة على أسئلة الصيانة'
          : "Hello! I'm your AI inspection assistant. How can I help you today? I can assist with:\n• Diagnosing equipment issues\n• Understanding defect reports\n• Suggesting repair priorities\n• Answering maintenance questions",
        timestamp: new Date(),
      }]);
    }
  }, [open, messages.length, isArabic]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await aiApi.chat(userMessage.content, threadId);
      const data = (response.data as any)?.data;

      if (data?.success) {
        setThreadId(data.thread_id);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        }]);
      } else {
        throw new Error(data?.error || 'Chat failed');
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: isArabic
          ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.'
          : 'Sorry, an error occurred. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<RobotOutlined style={{ fontSize: 24 }} />}
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          zIndex: 1000,
        }}
      />

      {/* Chat drawer */}
      <Drawer
        title={
          <Space>
            <Avatar style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <RobotOutlined />
            </Avatar>
            <span>{t('ai.assistant', 'AI Assistant')}</span>
          </Space>
        }
        placement={isArabic ? 'left' : 'right'}
        open={open}
        onClose={() => setOpen(false)}
        width={400}
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
        }}
        closeIcon={<CloseOutlined />}
      >
        {/* Messages area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          background: '#f5f5f5',
        }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? '#1677ff' : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#000',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <Typography.Text style={{ color: 'inherit' }}>{msg.content}</Typography.Text>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}>
                <Spin size="small" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: 12,
          borderTop: '1px solid #e8e8e8',
          background: '#fff',
        }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={sendMessage}
              placeholder={t('ai.typeMessage', 'Type a message...')}
              disabled={loading}
              style={{ borderRadius: '20px 0 0 20px' }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              loading={loading}
              style={{ borderRadius: '0 20px 20px 0' }}
            />
          </Space.Compact>
        </div>
      </Drawer>
    </>
  );
}
