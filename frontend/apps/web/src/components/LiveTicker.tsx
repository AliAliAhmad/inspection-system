import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../providers/LanguageProvider';
import { useTheme } from '../providers/ThemeProvider';

// ─── Types ───────────────────────────────────────────────────

type TickerSeverity = 'critical' | 'warning' | 'info' | 'success';

interface TickerItem {
  id: string;
  severity: TickerSeverity;
  message: string;
  messageAr?: string;
  source?: string;
  timestamp: Date;
  route?: string;
}

// ─── Severity Config ─────────────────────────────────────────

const SEVERITY_CONFIG: Record<TickerSeverity, { color: string; bg: string; darkBg: string; label: string; labelAr: string }> = {
  critical: { color: '#ff4d4f', bg: 'rgba(255, 77, 79, 0.08)', darkBg: 'rgba(255, 77, 79, 0.15)', label: 'CRITICAL', labelAr: '\u062D\u0631\u062C' },
  warning:  { color: '#faad14', bg: 'rgba(250, 173, 20, 0.08)', darkBg: 'rgba(250, 173, 20, 0.15)', label: 'WARNING',  labelAr: '\u062A\u062D\u0630\u064A\u0631' },
  info:     { color: '#1890ff', bg: 'rgba(24, 144, 255, 0.06)', darkBg: 'rgba(24, 144, 255, 0.12)', label: 'INFO',     labelAr: '\u0645\u0639\u0644\u0648\u0645\u0629' },
  success:  { color: '#52c41a', bg: 'rgba(82, 196, 26, 0.06)', darkBg: 'rgba(82, 196, 26, 0.12)', label: 'OK',       labelAr: '\u062A\u0645' },
};

// ─── Pages where ticker is hidden ────────────────────────────

const HIDDEN_PAGES = ['/admin/work-planning', '/admin/work-plan/'];

// ─── Mock data generator (replace with API hook later) ───────

function generateMockItems(): TickerItem[] {
  const now = new Date();
  return [
    {
      id: '1',
      severity: 'critical',
      message: 'Pump P-2204 vibration exceeds threshold — immediate inspection required',
      messageAr: '\u0627\u0647\u062A\u0632\u0627\u0632 \u0627\u0644\u0645\u0636\u062E\u0629 P-2204 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u2014 \u064A\u0644\u0632\u0645 \u0641\u062D\u0635 \u0641\u0648\u0631\u064A',
      source: 'Equipment',
      timestamp: new Date(now.getTime() - 2 * 60000),
      route: '/admin/equipment',
    },
    {
      id: '2',
      severity: 'warning',
      message: '3 inspections overdue for East Berth — reassignment recommended',
      messageAr: '3 \u0641\u062D\u0648\u0635\u0627\u062A \u0645\u062A\u0623\u062E\u0631\u0629 \u0641\u064A \u0627\u0644\u0631\u0635\u064A\u0641 \u0627\u0644\u0634\u0631\u0642\u064A \u2014 \u064A\u0646\u0635\u062D \u0628\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646',
      source: 'Inspections',
      timestamp: new Date(now.getTime() - 8 * 60000),
      route: '/admin/overdue',
    },
    {
      id: '3',
      severity: 'info',
      message: 'Ahmed K. completed 12 inspections today — highest on team',
      messageAr: '\u0623\u062D\u0645\u062F \u0643. \u0623\u0643\u0645\u0644 12 \u0641\u062D\u0635\u0627\u064B \u0627\u0644\u064A\u0648\u0645 \u2014 \u0627\u0644\u0623\u0639\u0644\u0649 \u0641\u064A \u0627\u0644\u0641\u0631\u064A\u0642',
      source: 'Performance',
      timestamp: new Date(now.getTime() - 15 * 60000),
    },
    {
      id: '4',
      severity: 'success',
      message: 'Weekly inspection target reached: 94% completion rate',
      messageAr: '\u062A\u0645 \u0628\u0644\u0648\u063A \u0647\u062F\u0641 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A: \u0646\u0633\u0628\u0629 \u0625\u0643\u0645\u0627\u0644 94%',
      source: 'KPI',
      timestamp: new Date(now.getTime() - 30 * 60000),
    },
    {
      id: '5',
      severity: 'warning',
      message: 'Generator G-101 running hours approaching service interval (4,850 / 5,000 hrs)',
      messageAr: '\u0633\u0627\u0639\u0627\u062A \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0648\u0644\u062F G-101 \u062A\u0642\u062A\u0631\u0628 \u0645\u0646 \u0641\u062A\u0631\u0629 \u0627\u0644\u0635\u064A\u0627\u0646\u0629 (4,850 / 5,000 \u0633\u0627\u0639\u0629)',
      source: 'Running Hours',
      timestamp: new Date(now.getTime() - 45 * 60000),
      route: '/admin/running-hours',
    },
    {
      id: '6',
      severity: 'critical',
      message: 'Safety valve SV-3302 failed pressure test — equipment shutdown initiated',
      messageAr: '\u0635\u0645\u0627\u0645 \u0627\u0644\u0623\u0645\u0627\u0646 SV-3302 \u0641\u0634\u0644 \u0641\u064A \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0636\u063A\u0637 \u2014 \u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0645\u0639\u062F\u0629',
      source: 'Safety',
      timestamp: new Date(now.getTime() - 5 * 60000),
      route: '/admin/defects',
    },
    {
      id: '7',
      severity: 'info',
      message: 'New work plan published for Week 8 — 47 jobs scheduled across 2 berths',
      messageAr: '\u062A\u0645 \u0646\u0634\u0631 \u062E\u0637\u0629 \u0639\u0645\u0644 \u062C\u062F\u064A\u062F\u0629 \u0644\u0644\u0623\u0633\u0628\u0648\u0639 8 \u2014 47 \u0645\u0647\u0645\u0629 \u0645\u062C\u062F\u0648\u0644\u0629 \u0639\u0628\u0631 \u0631\u0635\u064A\u0641\u064A\u0646',
      source: 'Work Plan',
      timestamp: new Date(now.getTime() - 60 * 60000),
    },
  ];
}

// ─── Time formatter ──────────────────────────────────────────

function timeAgo(date: Date, isAr: boolean): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return isAr ? '\u0627\u0644\u0622\u0646' : 'now';
  if (mins < 60) return isAr ? `\u0645\u0646\u0630 ${mins} \u062F` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return isAr ? `\u0645\u0646\u0630 ${hrs} \u0633` : `${hrs}h ago`;
}

// ─── Component ───────────────────────────────────────────────

export default function LiveTicker() {
  const location = useLocation();
  const { language } = useLanguage();
  const { isDark } = useTheme();
  const isAr = language === 'ar';

  const [items, setItems] = useState<TickerItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTick] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Load items
  useEffect(() => {
    setItems(generateMockItems());
    // Refresh every 60s (replace with real-time hook later)
    const interval = setInterval(() => setItems(generateMockItems()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Update relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Sort: critical first, then by timestamp
  const sortedItems = useMemo(() => {
    const priority: Record<TickerSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
    return [...items].sort((a, b) => {
      if (priority[a.severity] !== priority[b.severity]) return priority[a.severity] - priority[b.severity];
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }, [items]);

  const hasCritical = sortedItems.some(i => i.severity === 'critical');

  // Hidden on Work Planning
  const isHidden = HIDDEN_PAGES.some(p => location.pathname.startsWith(p));
  if (isHidden || sortedItems.length === 0) return null;

  // Animation duration scales with item count for consistent read speed
  const animDuration = sortedItems.length * 8;

  const handleItemClick = useCallback((item: TickerItem) => {
    if (item.route) {
      window.location.href = item.route;
    }
  }, []);

  return (
    <div
      className={`live-ticker ${hasCritical ? 'live-ticker-critical' : ''}`}
      style={{
        background: isDark ? '#1a1a1a' : '#fff',
        borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
        direction: isAr ? 'rtl' : 'ltr',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* LIVE label */}
      <div className="live-ticker-label" style={{ background: isDark ? '#262626' : '#fafafa' }}>
        <span className={`live-ticker-dot ${hasCritical ? 'live-ticker-dot-critical' : ''}`} />
        <span style={{ color: isDark ? 'rgba(255,255,255,0.85)' : '#262626' }}>
          {isAr ? '\u0645\u0628\u0627\u0634\u0631' : 'LIVE'}
        </span>
      </div>

      {/* Scrolling track */}
      <div className="live-ticker-track-container">
        <div
          ref={trackRef}
          className="live-ticker-track"
          style={{
            animationDuration: `${animDuration}s`,
            animationPlayState: isPaused ? 'paused' : 'running',
            direction: 'ltr', // animation always LTR, text handles RTL
          }}
        >
          {/* Duplicate items for seamless loop */}
          {[...sortedItems, ...sortedItems].map((item, idx) => {
            const cfg = SEVERITY_CONFIG[item.severity];
            return (
              <div
                key={`${item.id}-${idx}`}
                className={`live-ticker-item ${item.route ? 'live-ticker-item-clickable' : ''}`}
                onClick={() => handleItemClick(item)}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                {/* Severity dot */}
                <span
                  className="live-ticker-severity"
                  style={{ background: cfg.color }}
                />

                {/* Source tag */}
                {item.source && (
                  <span
                    className="live-ticker-source"
                    style={{
                      color: cfg.color,
                      background: isDark ? cfg.darkBg : cfg.bg,
                    }}
                  >
                    {item.source}
                  </span>
                )}

                {/* Message */}
                <span
                  className="live-ticker-message"
                  style={{ color: isDark ? 'rgba(255,255,255,0.8)' : '#434343' }}
                >
                  {isAr && item.messageAr ? item.messageAr : item.message}
                </span>

                {/* Time */}
                <span className="live-ticker-time" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#bfbfbf' }}>
                  {timeAgo(item.timestamp, isAr)}
                </span>

                {/* Divider */}
                <span className="live-ticker-divider" style={{ background: isDark ? '#303030' : '#e8e8e8' }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Count badge */}
      <div className="live-ticker-count" style={{ background: isDark ? '#262626' : '#fafafa' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: hasCritical ? '#ff4d4f' : isDark ? 'rgba(255,255,255,0.5)' : '#8c8c8c',
          }}
        >
          {sortedItems.length}
        </span>
      </div>
    </div>
  );
}
