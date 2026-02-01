import type { TextAreaProps } from 'antd/es/input';
interface VoiceTextAreaProps extends TextAreaProps {
    /** Called after transcription with both language versions */
    onTranscribed?: (en: string, ar: string) => void;
}
export default function VoiceTextArea({ onTranscribed, ...textAreaProps }: VoiceTextAreaProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=VoiceTextArea.d.ts.map