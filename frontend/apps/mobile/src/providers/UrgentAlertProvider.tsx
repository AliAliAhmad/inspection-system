import React, { createContext, useState, useCallback, useMemo } from 'react';
import { UrgentAlertOverlay } from '../components/chat/UrgentAlertOverlay';

export interface UrgentAlertData {
  senderName: string;
  channelName: string;
  messagePreview: string;
}

export interface UrgentAlertContextValue {
  showUrgentAlert: (data: UrgentAlertData) => void;
}

export const UrgentAlertContext = createContext<UrgentAlertContextValue | null>(null);

interface Props {
  children: React.ReactNode;
}

export function UrgentAlertProvider({ children }: Props) {
  const [visible, setVisible] = useState(false);
  const [alertData, setAlertData] = useState<UrgentAlertData>({
    senderName: '',
    channelName: '',
    messagePreview: '',
  });

  const showUrgentAlert = useCallback((data: UrgentAlertData) => {
    setAlertData(data);
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const contextValue = useMemo<UrgentAlertContextValue>(
    () => ({ showUrgentAlert }),
    [showUrgentAlert],
  );

  return (
    <UrgentAlertContext.Provider value={contextValue}>
      {children}
      <UrgentAlertOverlay
        visible={visible}
        senderName={alertData.senderName}
        channelName={alertData.channelName}
        messagePreview={alertData.messagePreview}
        onDismiss={handleDismiss}
      />
    </UrgentAlertContext.Provider>
  );
}
