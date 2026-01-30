import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Descriptions, Typography, Switch, Space, Tag, Divider, Button } from 'antd';
import { UserOutlined, GlobalOutlined, LogoutOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
const roleColors = {
    admin: 'red',
    inspector: 'blue',
    specialist: 'green',
    engineer: 'orange',
    quality_engineer: 'purple',
};
export default function ProfilePage() {
    const { user, logout } = useAuth();
    const { language, setLanguage, isRTL } = useLanguage();
    const { t } = useTranslation();
    if (!user)
        return null;
    return (_jsx("div", { style: { maxWidth: 600, margin: '0 auto' }, children: _jsxs(Card, { children: [_jsxs("div", { style: { textAlign: 'center', marginBottom: 24 }, children: [_jsx("div", { style: {
                                width: 80,
                                height: 80,
                                borderRadius: '50%',
                                backgroundColor: '#1677ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 12px',
                            }, children: _jsx(UserOutlined, { style: { fontSize: 36, color: '#fff' } }) }), _jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: user.full_name }), _jsx(Tag, { color: roleColors[user.role] || 'default', style: { marginTop: 8 }, children: user.role.replace('_', ' ').toUpperCase() })] }), _jsxs(Descriptions, { column: 1, bordered: true, size: "small", children: [_jsx(Descriptions.Item, { label: t('auth.username'), children: user.username }), _jsx(Descriptions.Item, { label: t('common.email'), children: user.email }), _jsx(Descriptions.Item, { label: "Employee ID", children: user.employee_id }), _jsx(Descriptions.Item, { label: t('common.role'), children: user.role }), user.specialization && (_jsx(Descriptions.Item, { label: "Specialization", children: user.specialization })), user.shift && (_jsx(Descriptions.Item, { label: "Shift", children: user.shift })), _jsx(Descriptions.Item, { label: "Points", children: user.total_points })] }), _jsx(Divider, {}), _jsxs(Card, { size: "small", title: _jsxs(Space, { children: [_jsx(GlobalOutlined, {}), _jsx("span", { children: t('common.language') })] }), children: [_jsxs(Space, { children: [_jsx(Typography.Text, { children: "English" }), _jsx(Switch, { checked: language === 'ar', onChange: (checked) => setLanguage(checked ? 'ar' : 'en') }), _jsx(Typography.Text, { children: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" })] }), _jsx("br", {}), _jsx(Typography.Text, { type: "secondary", style: { fontSize: 12, marginTop: 8, display: 'block' }, children: isRTL ? 'الاتجاه: من اليمين إلى اليسار' : 'Direction: Left to Right' })] }), _jsx(Divider, {}), _jsx(Button, { danger: true, block: true, icon: _jsx(LogoutOutlined, {}), onClick: logout, children: t('auth.logout') })] }) }));
}
//# sourceMappingURL=ProfilePage.js.map