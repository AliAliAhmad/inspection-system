import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Space, Select } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useTranslation } from 'react-i18next';
import { loginRateLimiter } from '../../utils/rate-limiter';
const { Title } = Typography;
export default function LoginPage() {
    const { login } = useAuth();
    const { language, setLanguage } = useLanguage();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const onFinish = async (values) => {
        setError(null);
        const rateCheck = loginRateLimiter.check();
        if (!rateCheck.allowed) {
            const seconds = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
            setError(t('auth.rate_limited', `Too many attempts. Try again in ${seconds}s.`));
            return;
        }
        setLoading(true);
        try {
            await login(values.email, values.password);
            loginRateLimiter.reset();
        }
        catch (err) {
            loginRateLimiter.recordFailure();
            setError(err?.response?.data?.error || t('auth.login_failed'));
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: '#f0f2f5',
        }, children: _jsxs(Card, { style: { width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }, children: [_jsxs("div", { style: { textAlign: 'center', marginBottom: 24 }, children: [_jsx(Title, { level: 3, children: t('common.app_title') }), _jsx(Typography.Text, { type: "secondary", children: t('auth.sign_in_prompt') })] }), error && (_jsx(Alert, { message: error, type: "error", showIcon: true, closable: true, style: { marginBottom: 16 } })), _jsxs(Form, { layout: "vertical", onFinish: onFinish, autoComplete: "off", children: [_jsx(Form.Item, { name: "email", rules: [
                                { required: true, message: t('auth.email_required', 'Email is required') },
                                { type: 'email', message: t('auth.email_invalid', 'Please enter a valid email') },
                            ], children: _jsx(Input, { prefix: _jsx(UserOutlined, {}), placeholder: t('auth.email', 'Email'), size: "large" }) }), _jsx(Form.Item, { name: "password", rules: [{ required: true, message: t('auth.password_required') }], children: _jsx(Input.Password, { prefix: _jsx(LockOutlined, {}), placeholder: t('auth.password'), size: "large" }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "primary", htmlType: "submit", loading: loading, block: true, size: "large", children: t('auth.login') }) })] }), _jsx("div", { style: { textAlign: 'center' }, children: _jsxs(Space, { children: [_jsx(GlobalOutlined, {}), _jsx(Select, { value: language, onChange: setLanguage, size: "small", style: { width: 120 }, options: [
                                    { value: 'en', label: 'English' },
                                    { value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' },
                                ] })] }) })] }) }));
}
//# sourceMappingURL=LoginPage.js.map