"""
Work Plan PDF Service — Professional Card-Based Layout.
Landscape A4. Hybrid density: full cards for defects/urgent/overdue,
compact cards for routine PM. Arabic RTL support via Noto fonts.
"""

from fpdf import FPDF
from datetime import datetime
import os
import tempfile
from flask import current_app


# ── Color Palette ──────────────────────────────────────────────
NAVY     = (20, 40, 80)
BLUE     = (41, 128, 185)
TEAL     = (22, 160, 133)
GREEN    = (39, 174, 96)
PURPLE   = (126, 60, 160)
RED      = (192, 57, 43)
ORANGE   = (230, 126, 34)
GREY     = (127, 140, 141)
WHITE    = (255, 255, 255)
LIGHT    = (245, 248, 252)
ALT_ROW  = (235, 242, 250)
BORDER   = (200, 210, 225)
TEXT     = (35, 50, 70)
MUTED    = (120, 135, 150)
DANGER   = (220, 53, 69)
SUCCESS  = (40, 167, 69)
WARN_BG  = (255, 243, 224)
ERR_BG   = (255, 230, 230)

# Page dimensions (landscape A4)
PW = 297  # page width mm
PH = 210  # page height mm
LM = 10   # left margin
RM = 10   # right margin
CW = PW - LM - RM  # content width = 277mm

# Card dimensions
CARD_W = 135.5   # card width mm (2 columns with 6mm gap)
CARD_GAP = 6     # gap between columns
CARD_PAD = 3     # internal padding
FULL_CARD_MIN_H = 52   # minimum height for full detail card
COMPACT_CARD_H = 28    # target height for compact card
CHECKBOX_SIZE = 6       # 6mm checkbox — usable with gloves

# Labels for bilingual support
LABELS = {
    'en': {
        'weekly_work_plan': 'WEEKLY WORK PLAN',
        'work_plan': 'Work Plan',
        'total_jobs': 'Total Jobs',
        'pm_jobs': 'PM Jobs',
        'defect_repairs': 'Defect Repairs',
        'inspections': 'Inspections',
        'total_hours': 'Total Hours',
        'daily_breakdown': 'Daily Breakdown',
        'team_roster': 'Team Roster',
        'east_berth': 'EAST BERTH',
        'west_berth': 'WEST BERTH',
        'team': 'Team',
        'materials': 'Materials',
        'notes': 'Notes',
        'done': 'DONE',
        'time': 'Time',
        'sign_off': 'SIGN-OFF',
        'supervisor': 'Supervisor',
        'engineer': 'Engineer',
        'day_notes': 'Day Notes',
        'no_jobs': 'No jobs scheduled',
        'est': 'Est',
        'overdue': 'OVERDUE',
        'no_sap': 'NO SAP#',
        'day': 'Day',
        'pm': 'PM',
        'defect': 'Defect',
        'inspect': 'Inspect',
        'total': 'Total',
        'hours': 'Hours',
        'jobs': 'jobs',
        'page': 'Page',
        'generated': 'Generated',
        'date': 'Date',
    },
    'ar': {
        'weekly_work_plan': 'خطة العمل الأسبوعية',
        'work_plan': 'خطة العمل',
        'total_jobs': 'إجمالي المهام',
        'pm_jobs': 'صيانة وقائية',
        'defect_repairs': 'إصلاح عيوب',
        'inspections': 'فحوصات',
        'total_hours': 'إجمالي الساعات',
        'daily_breakdown': 'التفصيل اليومي',
        'team_roster': 'قائمة الفريق',
        'east_berth': 'الرصيف الشرقي',
        'west_berth': 'الرصيف الغربي',
        'team': 'الفريق',
        'materials': 'المواد',
        'notes': 'ملاحظات',
        'done': 'تم',
        'time': 'الوقت',
        'sign_off': 'التوقيع',
        'supervisor': 'المشرف',
        'engineer': 'المهندس',
        'day_notes': 'ملاحظات اليوم',
        'no_jobs': 'لا توجد مهام مجدولة',
        'est': 'تقدير',
        'overdue': 'متأخر',
        'no_sap': 'بدون SAP#',
        'day': 'اليوم',
        'pm': 'ص.و',
        'defect': 'عيب',
        'inspect': 'فحص',
        'total': 'المجموع',
        'hours': 'ساعات',
        'jobs': 'مهام',
        'page': 'صفحة',
        'generated': 'تم الإنشاء',
        'date': 'التاريخ',
    },
}


class WorkPlanPDF(FPDF):
    """Professional landscape PDF with hybrid card layout."""

    def __init__(self, plan, language='en'):
        super().__init__(orientation='L', format='A4')
        self.plan = plan
        self.language = language if language in LABELS else 'en'
        self.set_auto_page_break(auto=True, margin=14)
        self.current_day_label = ''
        self.current_day_stats = ''
        self._rnr_cache = {}
        self._load_fonts()

    def _load_fonts(self):
        """Load Noto Sans + Noto Sans Arabic TTF fonts."""
        font_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts')
        font_dir = os.path.abspath(font_dir)

        try:
            # English fonts
            noto_r = os.path.join(font_dir, 'NotoSans-Regular.ttf')
            noto_b = os.path.join(font_dir, 'NotoSans-Bold.ttf')
            if os.path.exists(noto_r):
                self.add_font('Noto', '', noto_r)
            if os.path.exists(noto_b):
                self.add_font('Noto', 'B', noto_b)

            # Arabic fonts
            noto_ar = os.path.join(font_dir, 'NotoSansArabic-Regular.ttf')
            noto_ar_b = os.path.join(font_dir, 'NotoSansArabic-Bold.ttf')
            if os.path.exists(noto_ar):
                self.add_font('NotoAr', '', noto_ar)
            if os.path.exists(noto_ar_b):
                self.add_font('NotoAr', 'B', noto_ar_b)

            self._has_noto = os.path.exists(noto_r)
            self._has_arabic = os.path.exists(noto_ar)
        except Exception as e:
            current_app.logger.warning('Font loading failed: %s — falling back to Helvetica' % e)
            self._has_noto = False
            self._has_arabic = False

    def _t(self, key):
        """Get translated label."""
        return LABELS.get(self.language, LABELS['en']).get(key, key)

    def _font(self, style='', size=10):
        """Set the appropriate font for current language."""
        if self.language == 'ar' and self._has_arabic:
            self.set_font('NotoAr', style, size)
        elif self._has_noto:
            self.set_font('Noto', style, size)
        else:
            self.set_font('Helvetica', style, size)

    def _safe(self, text, max_len=0):
        """Unicode-safe text with optional truncation. No Latin-1 encoding."""
        if text is None:
            return ''
        s = str(text).strip()
        if max_len and len(s) > max_len:
            return s[:max_len - 1] + '\u2026'  # Unicode ellipsis
        return s

    # Keep backward compat alias
    def _s(self, text, max_len=0):
        return self._safe(text, max_len)

    def _pill(self, label, color, w=16, h=5):
        """Colored pill badge with text label (B&W safe)."""
        self.set_fill_color(*color)
        self.set_text_color(*WHITE)
        self._font('B', 7)
        # Rounded corners via small rect
        x, y = self.get_x(), self.get_y()
        self.rect(x, y, w, h, 'F')
        self.set_xy(x, y)
        self.cell(w, h, label, align='C')
        self.set_text_color(*TEXT)

    def _draw_checkbox(self, x, y, size=CHECKBOX_SIZE):
        """Draw a checkbox at given position."""
        self.set_draw_color(*NAVY)
        self.set_line_width(0.4)
        self.rect(x, y, size, size, 'D')
        self.set_line_width(0.2)

    def _draw_ruled_lines(self, count=2, line_w=None):
        """Draw dotted ruled lines for write-in space."""
        if line_w is None:
            line_w = CARD_W - CARD_PAD * 2
        self.set_draw_color(*BORDER)
        self.set_line_width(0.15)
        for _ in range(count):
            y = self.get_y() + 3.5
            x = self.get_x()
            # Dotted line effect: draw thin grey line
            self.line(x, y, x + line_w, y)
            self.set_y(y + 1.5)
        self.set_line_width(0.2)

    def _priority_indicator(self, priority):
        """Priority shape + text (B&W safe). Returns (label, color)."""
        priority = (priority or 'normal').lower()
        indicators = {
            'normal':   ('\u25CF Normal',  MUTED),    # ● filled circle
            'low':      ('\u25CB Low',     MUTED),    # ○ open circle
            'high':     ('\u25B2 High',    ORANGE),   # ▲ triangle
            'urgent':   ('\u25C6 Urgent',  RED),      # ◆ diamond
            'critical': ('\u2716 Critical', DANGER),  # ✖ X mark
        }
        return indicators.get(priority, indicators['normal'])

    def _should_use_full_card(self, job):
        """Determine if a job needs a full detail card or compact."""
        if job.job_type == 'defect':
            return True
        priority = (job.priority or 'normal').lower()
        if priority in ('high', 'urgent'):
            return True
        if job.overdue_value and job.overdue_value > 0:
            return True
        if job.notes and str(job.notes).strip():
            return True
        if getattr(job, 'is_split', False):
            return True
        if job.materials and len(list(job.materials)) > 3:
            return True
        return False

    def _get_equipment_name(self, job):
        """Get equipment display name from job."""
        if job.equipment:
            name = job.equipment.name or job.equipment.serial_number or ''
            sn = job.equipment.serial_number or ''
            if sn and sn not in name:
                return '%s (%s)' % (name, sn)
            return name
        if job.inspection_assignment and job.inspection_assignment.equipment:
            eq = job.inspection_assignment.equipment
            return eq.name or eq.serial_number or ''
        return job.description or ''

    def _get_description(self, job):
        """Get job description, stripping equipment name prefix."""
        desc = job.description or ''
        if not desc and job.defect:
            desc = job.defect.description or ''
        eq_name = self._get_equipment_name(job)
        if eq_name and desc.startswith(eq_name):
            desc = desc[len(eq_name):].lstrip(' -_.')
        return desc

    def _get_team_str(self, job):
        """Get team string with lead marked by *."""
        parts = []
        for a in (job.assignments or []):
            name = a.user.full_name if a.user and a.user.full_name else '?'
            if a.is_lead:
                name = name + '*'
            parts.append(name)
        return ', '.join(parts) if parts else '-'

    def _get_materials_str(self, job):
        """Get materials string."""
        parts = []
        for wpm in (job.materials or []):
            if wpm.material:
                code = wpm.material.code or wpm.material.name or ''
                parts.append('%s \u00d7%g' % (self._safe(code, 18), wpm.quantity or 0))
        return ', '.join(parts)

    def _get_reading(self, job):
        """Get cached RNR/TWL reading for equipment."""
        if not job.equipment_id:
            return None
        if job.equipment_id not in self._rnr_cache:
            try:
                from app.models.equipment_reading import EquipmentReading
                latest = EquipmentReading.get_latest_reading(job.equipment_id, 'rnr')
                if latest and not latest.is_faulty:
                    self._rnr_cache[job.equipment_id] = ('RNR', latest.reading_value)
                else:
                    latest_twl = EquipmentReading.get_latest_reading(job.equipment_id, 'twl')
                    if latest_twl and not latest_twl.is_faulty:
                        self._rnr_cache[job.equipment_id] = ('TWL', latest_twl.reading_value)
                    else:
                        self._rnr_cache[job.equipment_id] = None
            except Exception:
                self._rnr_cache[job.equipment_id] = None
        return self._rnr_cache.get(job.equipment_id)

    # ── Header / Footer ──────────────────────────────────────────
    def header(self):
        # Top bar
        self.set_fill_color(*NAVY)
        self.rect(0, 0, PW, 3.5, 'F')

        self.set_y(5)
        # Left: title
        self._font('B', 10)
        self.set_text_color(*NAVY)
        self.cell(70, 5, self._t('weekly_work_plan'))

        # Center: week range
        self._font('', 8)
        self.set_text_color(*MUTED)
        week_str = '%s  \u2013  %s' % (
            self.plan.week_start.strftime('%d %b %Y'),
            self.plan.week_end.strftime('%d %b %Y'),
        )
        self.cell(CW - 140, 5, week_str, align='C')

        # Right: status
        status = getattr(self.plan, 'status', 'draft')
        sc = SUCCESS if status == 'published' else ORANGE
        self.set_fill_color(*sc)
        self.set_text_color(*WHITE)
        self._font('B', 7)
        self.cell(70, 5, status.upper(), fill=True, align='R', new_x='LMARGIN', new_y='NEXT')

        # Day header
        if self.current_day_label:
            self.ln(1)
            self.set_fill_color(*NAVY)
            self.set_text_color(*WHITE)
            self._font('B', 12)
            self.cell(CW * 0.6, 7, '   %s' % self.current_day_label, fill=True)
            if self.current_day_stats:
                self._font('', 9)
                self.cell(CW * 0.4, 7, '%s   ' % self.current_day_stats, fill=True, align='R',
                          new_x='LMARGIN', new_y='NEXT')
            else:
                self.cell(CW * 0.4, 7, '', fill=True, new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*TEXT)

        self.ln(3)

    def footer(self):
        self.set_y(-9)
        self.set_draw_color(*BORDER)
        self.line(LM, PH - 10, PW - RM, PH - 10)
        self._font('', 6)
        self.set_text_color(*MUTED)
        ts = datetime.utcnow().strftime('%d %b %Y %H:%M UTC')
        self.cell(CW / 2, 4, '%s %s  |  Inspection System' % (self._t('generated'), ts))
        self.cell(CW / 2, 4, '%s %d' % (self._t('page'), self.page_no()), align='R')

    # ── Cover Page ────────────────────────────────────────────────
    def add_cover_page(self, filtered_jobs_by_day=None, filter_note=''):
        """Summary cover page with stats and weekly overview.

        Args:
            filtered_jobs_by_day: Optional dict {day.id: [filtered jobs]}.
                                  When present, stats reflect the filtered view.
            filter_note: Optional short summary string shown under the title
                         when filters are active (e.g. 'Filters: Monday · East').
        """
        self.current_day_label = ''
        self.current_day_stats = ''
        self.add_page()

        # Big title
        self.ln(15)
        self._font('B', 28)
        self.set_text_color(*NAVY)
        self.cell(CW, 14, self._t('work_plan'), align='C', new_x='LMARGIN', new_y='NEXT')
        self._font('', 14)
        self.set_text_color(*MUTED)
        self.cell(CW, 8, '%s  \u2013  %s' % (
            self.plan.week_start.strftime('%d %B %Y'),
            self.plan.week_end.strftime('%d %B %Y'),
        ), align='C', new_x='LMARGIN', new_y='NEXT')

        # Filter note (only when filters are active)
        if filter_note:
            self._font('B', 10)
            self.set_text_color(*BLUE)
            self.cell(CW, 6, filter_note, align='C', new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*TEXT)

        self.ln(10)

        # Helper — use filtered jobs if provided, else raw day.jobs
        def _jobs_for(day):
            if filtered_jobs_by_day is not None:
                return filtered_jobs_by_day.get(day.id, [])
            return list(day.jobs) if day.jobs else []

        # Summary stats boxes (5 boxes)
        total_jobs = sum(len(_jobs_for(d)) for d in self.plan.days)
        total_hours = sum(sum(j.estimated_hours or 0 for j in _jobs_for(d)) for d in self.plan.days)
        pm_count = sum(1 for d in self.plan.days for j in _jobs_for(d) if j.job_type == 'pm')
        defect_count = sum(1 for d in self.plan.days for j in _jobs_for(d) if j.job_type == 'defect')
        insp_count = sum(1 for d in self.plan.days for j in _jobs_for(d) if j.job_type == 'inspection')

        boxes = [
            (str(total_jobs), self._t('total_jobs'), NAVY),
            (str(pm_count), self._t('pm_jobs'), TEAL),
            (str(defect_count), self._t('defect_repairs'), RED),
            (str(insp_count), self._t('inspections'), GREY),
            ('%.0fh' % total_hours, self._t('total_hours'), BLUE),
        ]
        bw = 48
        gap = 6
        sx = (PW - (bw * len(boxes) + gap * (len(boxes) - 1))) / 2
        y0 = self.get_y()
        for i, (val, lab, col) in enumerate(boxes):
            x = sx + i * (bw + gap)
            self.set_fill_color(*col)
            self.rect(x, y0, bw, 22, 'F')
            self.set_text_color(*WHITE)
            self.set_xy(x, y0 + 2)
            self._font('B', 16)
            self.cell(bw, 10, val, align='C')
            self.set_xy(x, y0 + 13)
            self._font('', 7)
            self.cell(bw, 5, lab, align='C')
        self.set_y(y0 + 30)
        self.set_text_color(*TEXT)

        # Daily breakdown table
        self._font('B', 10)
        self.cell(CW, 7, self._t('daily_breakdown'), new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

        hcols = [
            (55, self._t('day')), (25, self._t('pm')), (25, self._t('defect')),
            (25, self._t('inspect')), (25, self._t('total')), (25, self._t('hours')),
            (91, self._t('team')),
        ]
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self._font('B', 8)
        for w, lab in hcols:
            self.cell(w, 6, '  ' + lab, fill=True)
        self.ln()
        self.set_text_color(*TEXT)

        for idx, day in enumerate(sorted(self.plan.days, key=lambda d: d.date)):
            all_j = _jobs_for(day)
            dpm = sum(1 for j in all_j if j.job_type == 'pm')
            ddef = sum(1 for j in all_j if j.job_type == 'defect')
            dins = sum(1 for j in all_j if j.job_type == 'inspection')
            dhrs = sum(j.estimated_hours or 0 for j in all_j)
            team = set()
            for j in all_j:
                for a in (j.assignments or []):
                    if a.user and a.user.full_name:
                        team.add(a.user.full_name)

            bg = LIGHT if idx % 2 == 0 else WHITE
            self.set_fill_color(*bg)
            self._font('', 8)
            self.cell(55, 5.5, '  %s' % day.date.strftime('%A, %d %b'), fill=True)
            self.cell(25, 5.5, str(dpm), fill=True, align='C')
            self.cell(25, 5.5, str(ddef), fill=True, align='C')
            self.cell(25, 5.5, str(dins), fill=True, align='C')
            self._font('B', 8)
            self.cell(25, 5.5, str(len(all_j)), fill=True, align='C')
            self._font('', 8)
            self.cell(25, 5.5, '%.0fh' % dhrs, fill=True, align='C')
            self._font('', 7)
            self.cell(91, 5.5, self._safe(', '.join(sorted(team)), 55), fill=True,
                      new_x='LMARGIN', new_y='NEXT')

        self.ln(6)

        # Team roster
        users_by_role = {}
        for day in self.plan.days:
            for job in _jobs_for(day):
                for a in (job.assignments or []):
                    if a.user and a.user.full_name:
                        role = (a.user.role or 'other').replace('_', ' ').title()
                        users_by_role.setdefault(role, set()).add(a.user.full_name)

        if users_by_role:
            self._font('B', 10)
            self.cell(CW, 7, self._t('team_roster'), new_x='LMARGIN', new_y='NEXT')
            self.ln(1)
            for role, names in sorted(users_by_role.items()):
                self._font('B', 8)
                self.set_text_color(*BLUE)
                self.cell(35, 5, '  %s:' % role)
                self._font('', 8)
                self.set_text_color(*TEXT)
                self.cell(CW - 35, 5, ', '.join(sorted(names)), new_x='LMARGIN', new_y='NEXT')

    # ── Card Renderers ────────────────────────────────────────────

    def _render_full_card(self, job, x, y):
        """
        Render a full detail card for defects/urgent/overdue jobs.
        Returns the actual card height used.
        """
        card_x = x
        card_y = y
        inner_w = CARD_W - CARD_PAD * 2

        # Determine card content to calculate height
        eq_name = self._get_equipment_name(job)
        desc = self._get_description(job)
        team_str = self._get_team_str(job)
        mat_str = self._get_materials_str(job)
        reading = self._get_reading(job)
        sap = job.sap_order_number or ''
        hours = job.estimated_hours or 0
        is_overdue = job.overdue_value and job.overdue_value > 0
        no_sap = not sap and job.job_type == 'pm'
        priority = (job.priority or 'normal').lower()

        # Calculate description height (multi-line)
        self._font('', 10)
        desc_text = self._safe(desc, 200)
        desc_lines = max(1, len(desc_text) * self.get_string_width('a') * 10 / (inner_w * 10) + 1)
        desc_lines = min(desc_lines, 3)  # max 3 lines
        desc_h = max(5, desc_lines * 4.5)

        # Build up card height
        card_h = 0
        card_h += 7    # Row 1: type + priority + flags
        card_h += 9    # Row 2: equipment name
        card_h += 0.5  # divider
        card_h += desc_h + 2  # Row 3: description
        card_h += 0.5  # divider
        card_h += 10   # Row 4: team + materials
        card_h += 0.5  # divider
        card_h += 6    # Row 5: SAP + hours + reading
        card_h += 0.5  # divider
        card_h += 10   # Row 6: notes write-in
        card_h += 8    # Row 7: checkbox + done
        card_h = max(card_h, FULL_CARD_MIN_H)

        # Check page break
        if card_y + card_h > PH - 16:
            return -1  # Signal: needs page break

        # ── Draw card border ──
        stripe_color = TEAL if job.job_type == 'pm' else RED if job.job_type == 'defect' else GREY
        # Left stripe
        self.set_fill_color(*stripe_color)
        self.rect(card_x, card_y, 3, card_h, 'F')
        # Card background
        if is_overdue:
            self.set_fill_color(*WARN_BG)
        elif no_sap:
            self.set_fill_color(*ERR_BG)
        else:
            self.set_fill_color(*WHITE)
        self.rect(card_x + 3, card_y, CARD_W - 3, card_h, 'F')
        # Border
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        self.rect(card_x, card_y, CARD_W, card_h, 'D')
        self.set_line_width(0.2)

        cy = card_y + 2  # current y inside card
        cx = card_x + CARD_PAD + 3  # after stripe

        # Row 1: Type badge + Priority + Flags
        self.set_xy(cx, cy)
        type_label = 'PM' if job.job_type == 'pm' else 'DEF' if job.job_type == 'defect' else 'INSP'
        self._pill(type_label, stripe_color, w=16, h=5)

        self.set_x(cx + 18)
        pri_text, pri_color = self._priority_indicator(priority)
        self._font('B', 7)
        self.set_text_color(*pri_color)
        self.cell(30, 5, pri_text)

        # Overdue flag
        if is_overdue:
            ov = job.overdue_value or 0
            unit = getattr(job, 'overdue_unit', 'days') or 'days'
            unit_short = 'd' if 'day' in str(unit) else 'h'
            self._font('B', 7)
            self.set_text_color(*DANGER)
            self.cell(0, 5, '%s %g%s' % (self._t('overdue'), ov, unit_short), align='R')

        # No SAP flag
        if no_sap:
            right_x = card_x + CARD_W - CARD_PAD - 35
            self.set_xy(right_x, cy)
            self._font('B', 6)
            self.set_text_color(*RED)
            self.cell(32, 5, self._t('no_sap'), align='R')

        self.set_text_color(*TEXT)
        cy += 7

        # Row 2: Equipment name (BIGGEST text)
        self.set_xy(cx, cy)
        self._font('B', 13)
        self.set_text_color(*NAVY)
        # Truncate if too long for card width
        eq_display = self._safe(eq_name, 60)
        self.cell(inner_w, 6, eq_display)
        self.set_text_color(*TEXT)
        cy += 9

        # Thin divider
        self.set_draw_color(*BORDER)
        self.line(cx, cy, card_x + CARD_W - CARD_PAD, cy)
        cy += 0.5

        # Row 3: Description (multi-line, no truncation up to 3 lines)
        self.set_xy(cx, cy + 1)
        self._font('', 10)
        self.set_text_color(*TEXT)
        self.multi_cell(inner_w, 4.5, desc_text, max_line_height=4.5)
        cy += desc_h + 2

        # Thin divider
        self.set_draw_color(*BORDER)
        self.line(cx, cy, card_x + CARD_W - CARD_PAD, cy)
        cy += 0.5

        # Row 4: Team | Materials (side by side)
        half_w = inner_w / 2 - 1
        self.set_xy(cx, cy)
        self._font('B', 8)
        self.set_text_color(*MUTED)
        self.cell(half_w, 4, '%s:' % self._t('team'))
        self.set_x(cx + half_w + 2)
        self.cell(half_w, 4, '%s:' % self._t('materials'))

        self.set_xy(cx, cy + 4)
        self._font('', 9)
        self.set_text_color(*TEXT)
        self.cell(half_w, 4, self._safe(team_str, 35))

        # Vertical divider
        mid_x = cx + half_w + 0.5
        self.set_draw_color(*BORDER)
        self.line(mid_x, cy, mid_x, cy + 9)

        self.set_xy(cx + half_w + 2, cy + 4)
        self._font('', 9)
        self.cell(half_w, 4, self._safe(mat_str, 35))
        cy += 10

        # Thin divider
        self.set_draw_color(*BORDER)
        self.line(cx, cy, card_x + CARD_W - CARD_PAD, cy)
        cy += 0.5

        # Row 5: SAP | Hours | Reading
        self.set_xy(cx, cy)
        self._font('', 9)
        parts = []
        if sap:
            self.set_text_color(*BLUE)
            parts.append('SAP: %s' % sap)
        else:
            parts.append('SAP: ____________')
        self.cell(45, 5, parts[0])

        self.set_text_color(*TEXT)
        self.cell(25, 5, '%s: %.0fh' % (self._t('est'), hours))

        if reading:
            rtype, rval = reading
            self.set_text_color(*BLUE)
            self.cell(0, 5, '%s: %.0f' % (rtype, rval))
        self.set_text_color(*TEXT)
        cy += 6

        # Thin divider
        self.set_draw_color(*BORDER)
        self.line(cx, cy, card_x + CARD_W - CARD_PAD, cy)
        cy += 0.5

        # Row 6: Notes write-in
        self.set_xy(cx, cy)
        self._font('B', 8)
        self.set_text_color(*MUTED)
        self.cell(20, 4, '%s:' % self._t('notes'))
        self.set_text_color(*TEXT)
        self.set_xy(cx, cy + 3)
        self._draw_ruled_lines(2, inner_w)
        cy += 10

        # Row 7: Checkbox + DONE + Time
        self._draw_checkbox(cx, cy)
        self.set_xy(cx + CHECKBOX_SIZE + 2, cy)
        self._font('B', 9)
        self.set_text_color(*NAVY)
        self.cell(20, CHECKBOX_SIZE, self._t('done'))
        self.set_text_color(*MUTED)
        self._font('', 8)
        self.cell(0, CHECKBOX_SIZE, '%s: ___:___' % self._t('time'))
        self.set_text_color(*TEXT)

        return card_h

    def _render_compact_card(self, job, x, y):
        """
        Render a compact card for routine PM / normal priority jobs.
        Returns the actual card height used.
        """
        card_x = x
        card_y = y
        inner_w = CARD_W - CARD_PAD * 2
        card_h = COMPACT_CARD_H

        # Check page break
        if card_y + card_h > PH - 16:
            return -1

        eq_name = self._get_equipment_name(job)
        desc = self._get_description(job)
        team_str = self._get_team_str(job)
        mat_str = self._get_materials_str(job)
        reading = self._get_reading(job)
        sap = job.sap_order_number or ''
        hours = job.estimated_hours or 0
        priority = (job.priority or 'normal').lower()

        # Card stripe + background
        stripe_color = TEAL if job.job_type == 'pm' else RED if job.job_type == 'defect' else GREY
        self.set_fill_color(*stripe_color)
        self.rect(card_x, card_y, 3, card_h, 'F')
        self.set_fill_color(*WHITE)
        self.rect(card_x + 3, card_y, CARD_W - 3, card_h, 'F')
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        self.rect(card_x, card_y, CARD_W, card_h, 'D')
        self.set_line_width(0.2)

        cy = card_y + 2
        cx = card_x + CARD_PAD + 3

        # Line 1: [PM] Equipment Name          ● Normal
        self.set_xy(cx, cy)
        type_label = 'PM' if job.job_type == 'pm' else 'DEF' if job.job_type == 'defect' else 'INSP'
        self._pill(type_label, stripe_color, w=14, h=4.5)

        self.set_x(cx + 16)
        self._font('B', 11)
        self.set_text_color(*NAVY)
        self.cell(inner_w - 55, 5, self._safe(eq_name, 40))

        pri_text, pri_color = self._priority_indicator(priority)
        self._font('', 7)
        self.set_text_color(*pri_color)
        self.cell(35, 5, pri_text, align='R')
        self.set_text_color(*TEXT)
        cy += 7

        # Line 2: Description (1 line, truncated)
        self.set_xy(cx, cy)
        self._font('', 9)
        self.set_text_color(*TEXT)
        self.cell(inner_w, 4, self._safe(desc, 80))
        cy += 5

        # Thin divider
        self.set_draw_color(*BORDER)
        self.line(cx, cy, card_x + CARD_W - CARD_PAD, cy)
        cy += 0.5

        # Line 3: Team | Mat | SAP | Hours | Reading (all on one line)
        self.set_xy(cx, cy)
        self._font('', 8)
        self.set_text_color(*TEXT)

        # Build info string
        info_parts = []
        info_parts.append(self._safe(team_str, 30))
        if mat_str:
            info_parts.append(self._safe(mat_str, 25))
        if sap:
            info_parts.append('SAP:%s' % sap)
        info_parts.append('%.0fh' % hours)
        if reading:
            rtype, rval = reading
            info_parts.append('%s:%.0f' % (rtype, rval))

        info_line = '  \u2502  '.join(info_parts)  # │ vertical bar separator
        self.cell(inner_w, 4, self._safe(info_line, 90))
        cy += 5.5

        # Line 4: Checkbox + DONE + Time + Notes line
        self._draw_checkbox(cx, cy)
        self.set_xy(cx + CHECKBOX_SIZE + 2, cy)
        self._font('B', 8)
        self.set_text_color(*NAVY)
        self.cell(16, CHECKBOX_SIZE, self._t('done'))
        self._font('', 7)
        self.set_text_color(*MUTED)
        self.cell(25, CHECKBOX_SIZE, '%s: ___:___' % self._t('time'))
        self.cell(15, CHECKBOX_SIZE, '%s:' % self._t('notes'))
        # Notes line
        note_x = self.get_x()
        self.set_draw_color(*BORDER)
        self.line(note_x, cy + CHECKBOX_SIZE - 1, card_x + CARD_W - CARD_PAD, cy + CHECKBOX_SIZE - 1)
        self.set_text_color(*TEXT)

        return card_h

    def _render_inspection_card(self, job, x, y):
        """Render a compact inspection card. Returns card height."""
        card_x = x
        card_y = y
        inner_w = CARD_W - CARD_PAD * 2
        card_h = 24

        if card_y + card_h > PH - 16:
            return -1

        eq_name = self._get_equipment_name(job)

        # Card background
        self.set_fill_color(*GREY)
        self.rect(card_x, card_y, 3, card_h, 'F')
        self.set_fill_color(250, 250, 252)
        self.rect(card_x + 3, card_y, CARD_W - 3, card_h, 'F')
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        self.rect(card_x, card_y, CARD_W, card_h, 'D')
        self.set_line_width(0.2)

        cy = card_y + 2
        cx = card_x + CARD_PAD + 3

        # Line 1: [INSP] Equipment Name
        self.set_xy(cx, cy)
        self._pill('INSP', GREY, w=16, h=4.5)
        self.set_x(cx + 18)
        self._font('B', 11)
        self.set_text_color(*NAVY)
        self.cell(inner_w - 20, 5, self._safe(eq_name, 45))
        self.set_text_color(*TEXT)
        cy += 7

        # Line 2: Checklist info + inspectors
        self.set_xy(cx, cy)
        self._font('', 8)
        self.set_text_color(*TEXT)
        # Get inspector info from assignment
        insp_info = ''
        if job.inspection_assignment:
            ia = job.inspection_assignment
            parts = []
            if ia.inspector and ia.inspector.full_name:
                parts.append('Mech: %s' % ia.inspector.full_name)
            if hasattr(ia, 'electrical_inspector') and ia.electrical_inspector:
                parts.append('Elec: %s' % ia.electrical_inspector.full_name)
            insp_info = '  |  '.join(parts)
        if not insp_info:
            insp_info = self._get_team_str(job)
        self.cell(inner_w, 4, self._safe(insp_info, 80))
        cy += 5.5

        # Line 3: Checkbox + DONE + Time + Notes
        self._draw_checkbox(cx, cy)
        self.set_xy(cx + CHECKBOX_SIZE + 2, cy)
        self._font('B', 8)
        self.set_text_color(*NAVY)
        self.cell(16, CHECKBOX_SIZE, self._t('done'))
        self._font('', 7)
        self.set_text_color(*MUTED)
        self.cell(25, CHECKBOX_SIZE, '%s: ___:___' % self._t('time'))
        self.cell(15, CHECKBOX_SIZE, '%s:' % self._t('notes'))
        note_x = self.get_x()
        self.set_draw_color(*BORDER)
        self.line(note_x, cy + CHECKBOX_SIZE - 1, card_x + CARD_W - CARD_PAD, cy + CHECKBOX_SIZE - 1)
        self.set_text_color(*TEXT)

        return card_h

    def _render_card_grid(self, jobs):
        """Render jobs in a 2-column card grid with auto page breaks."""
        if not jobs:
            return

        # Separate by card type
        cards = []
        for job in jobs:
            if job.job_type == 'inspection':
                cards.append(('inspection', job))
            elif self._should_use_full_card(job):
                cards.append(('full', job))
            else:
                cards.append(('compact', job))

        col = 0  # 0 = left column, 1 = right column
        col_y = [self.get_y(), self.get_y()]  # track Y position per column

        for card_type, job in cards:
            # Calculate x position based on column
            if col == 0:
                cx = LM
            else:
                cx = LM + CARD_W + CARD_GAP

            cy = col_y[col]

            # Render card
            if card_type == 'full':
                h = self._render_full_card(job, cx, cy)
            elif card_type == 'compact':
                h = self._render_compact_card(job, cx, cy)
            else:
                h = self._render_inspection_card(job, cx, cy)

            # Handle page break
            if h == -1:
                self.add_page()
                col = 0
                col_y = [self.get_y(), self.get_y()]
                cx = LM
                cy = col_y[0]
                if card_type == 'full':
                    h = self._render_full_card(job, cx, cy)
                elif card_type == 'compact':
                    h = self._render_compact_card(job, cx, cy)
                else:
                    h = self._render_inspection_card(job, cx, cy)

            if h > 0:
                col_y[col] = cy + h + 3  # 3mm gap between cards

            # Advance column
            col = 1 - col  # toggle 0 <-> 1

            # If right column is too far ahead, reset to left
            if col == 0:
                # Both columns have been used, set starting Y to max of both
                pass
            elif col_y[1] > col_y[0] + 20:
                # Right column much taller, start new row
                col = 0
                max_y = max(col_y)
                col_y = [max_y, max_y]

        # After grid, set Y to max of both columns
        self.set_y(max(col_y) + 2)

    def _render_sign_off(self):
        """Render sign-off section at bottom of day page."""
        needed_h = 30
        if self.get_y() + needed_h > PH - 14:
            return  # Not enough space, skip

        y = self.get_y() + 3
        self.set_y(y)

        # Double line
        self.set_draw_color(*NAVY)
        self.set_line_width(0.5)
        self.line(LM, y, PW - RM, y)
        self.line(LM, y + 1, PW - RM, y + 1)
        self.set_line_width(0.2)

        y += 3
        self.set_xy(LM, y)
        self._font('B', 10)
        self.set_text_color(*NAVY)
        self.cell(CW, 5, self._t('sign_off'), align='C', new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*TEXT)
        y += 7

        # Supervisor + Engineer side by side
        half = CW / 2 - 5
        self.set_xy(LM, y)
        self._font('B', 8)
        self.set_text_color(*MUTED)
        self.cell(25, 5, '%s:' % self._t('supervisor'))
        self.set_draw_color(*BORDER)
        self.line(LM + 25, y + 4.5, LM + half - 10, y + 4.5)
        self._font('', 7)
        self.cell(half - 35, 5, '')
        self.cell(20, 5, '%s:' % self._t('date'))
        self.line(self.get_x(), y + 4.5, self.get_x() + 25, y + 4.5)

        self.set_xy(LM + half + 10, y)
        self._font('B', 8)
        self.cell(25, 5, '%s:' % self._t('engineer'))
        self.line(LM + half + 35, y + 4.5, PW - RM - 35, y + 4.5)
        self._font('', 7)
        self.cell(half - 55, 5, '')
        self.cell(20, 5, '%s:' % self._t('date'))
        self.line(self.get_x(), y + 4.5, PW - RM, y + 4.5)

        self.set_text_color(*TEXT)
        y += 8

        # Day notes
        self.set_xy(LM, y)
        self._font('B', 8)
        self.set_text_color(*MUTED)
        self.cell(25, 4, '%s:' % self._t('day_notes'))
        self.set_text_color(*TEXT)
        self.set_xy(LM, y + 4)
        self._draw_ruled_lines(2, CW)

    # ── Day Page ──────────────────────────────────────────────────
    def add_day_page(self, day, filtered_jobs=None):
        """One or more pages per day: berth sections with card grids.

        Args:
            day: WorkPlanDay instance.
            filtered_jobs: Optional pre-filtered job list. When provided, used
                           instead of day.jobs so berth sections only contain
                           jobs matching the active PDF filter.
        """
        if filtered_jobs is not None:
            all_jobs = list(filtered_jobs)
        else:
            all_jobs = list(day.jobs) if day.jobs else []
        total = len(all_jobs)

        self.current_day_label = day.date.strftime('%A, %d %B %Y')
        self.current_day_stats = '%d %s' % (total, self._t('jobs'))
        self.add_page()

        east = sorted(
            [j for j in all_jobs if getattr(j, 'berth', None) in ('east', 'both', None)],
            key=lambda j: (0 if j.job_type == 'defect' else 1 if j.job_type == 'pm' else 2, j.position or 0)
        )
        west = sorted(
            [j for j in all_jobs if getattr(j, 'berth', None) == 'west'],
            key=lambda j: (0 if j.job_type == 'defect' else 1 if j.job_type == 'pm' else 2, j.position or 0)
        )

        # East berth
        self._berth_section(self._t('east_berth'), GREEN, east)
        self.ln(3)

        # West berth
        self._berth_section(self._t('west_berth'), PURPLE, west)

        # Sign-off section
        self._render_sign_off()

    def _berth_section(self, label, color, jobs):
        """
        Render a berth section using the team-grouped row layout.
        Sections: Mech PM, Elec PM, AC PM, Defect Mech, Defect Elec.
        Each section is a header bar + dense rows.
        """
        # Check page break for header
        if self.get_y() > PH - 25:
            self.add_page()

        # Berth header bar
        self.set_fill_color(*color)
        self.set_text_color(*WHITE)
        self._font('B', 9)
        self.cell(CW * 0.65, 6, '   %s' % label, fill=True)
        self._font('', 8)
        self.cell(CW * 0.35, 6, '%d %s   ' % (len(jobs), self._t('jobs')), fill=True, align='R',
                  new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*TEXT)
        self.ln(1)

        if not jobs:
            self._font('', 9)
            self.set_text_color(*MUTED)
            self.cell(CW, 5, '   %s' % self._t('no_jobs'), new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*TEXT)
            return

        # Group jobs into team sections
        mech_pm = []
        elec_pm = []
        ac_pm = []
        defect_mech = []
        defect_elec = []

        for j in jobs:
            wc = (getattr(j, 'work_center', '') or '').upper()
            if j.job_type == 'pm':
                desc_upper = (j.description or '').upper()
                is_ac = (
                    ' AC ' in f' {desc_upper} '
                    or 'AC SYSTEM' in desc_upper
                    or desc_upper.startswith('AC ')
                    or desc_upper.endswith(' AC')
                )
                if is_ac or wc == 'AC':
                    ac_pm.append(j)
                elif wc == 'ELEC':
                    elec_pm.append(j)
                elif wc == 'MECH':
                    mech_pm.append(j)
                else:
                    # ELME or default → both teams
                    mech_pm.append(j)
                    elec_pm.append(j)
            elif j.job_type == 'defect':
                cat = ''
                if j.defect:
                    cat = (getattr(j.defect, 'category', '') or '').lower()
                if cat == 'electrical' or wc == 'ELEC':
                    defect_elec.append(j)
                else:
                    defect_mech.append(j)

        # Render each section that has jobs
        sections = [
            ('MECH PM TEAM', BLUE, mech_pm),
            ('ELEC PM TEAM', ORANGE, elec_pm),
            ('AC SERVICE TEAM', TEAL, ac_pm),
            ('DEFECT MECH TEAM', RED, defect_mech),
            ('DEFECT ELEC TEAM', PURPLE, defect_elec),
        ]

        for section_label, section_color, section_jobs in sections:
            if section_jobs:
                # Group by equipment for PM sections so the PM row appears with
                # its related defect rows under the same equipment header.
                # Defect/AC sections stay flat.
                group_by_equipment = section_label in ('MECH PM TEAM', 'ELEC PM TEAM')
                # For PM sections, attach mech/elec defects onto the same equipment bundle
                if group_by_equipment:
                    is_elec_section = section_label == 'ELEC PM TEAM'
                    enriched_jobs = list(section_jobs)
                    eq_ids_in_section = {j.equipment_id for j in section_jobs if j.equipment_id}
                    # Pull defects on these equipment from the berth's job list
                    for candidate in jobs:
                        if candidate.job_type != 'defect':
                            continue
                        if candidate.equipment_id not in eq_ids_in_section:
                            continue
                        cat = ''
                        if candidate.defect:
                            cat = (getattr(candidate.defect, 'category', '') or '').lower()
                        if is_elec_section and cat != 'electrical':
                            continue
                        if (not is_elec_section) and cat == 'electrical':
                            continue
                        if candidate not in enriched_jobs:
                            enriched_jobs.append(candidate)
                    self._render_team_section(
                        section_label, section_color, enriched_jobs,
                        group_by_equipment=True,
                    )
                else:
                    self._render_team_section(section_label, section_color, section_jobs)
                self.ln(1)

    def _render_team_section(self, label, color, jobs, group_by_equipment: bool = False):
        """Render a single team section: colored header + dense rows."""
        # Check page break — need at least 25mm for header + first row
        if self.get_y() > PH - 30:
            self.add_page()

        # Find the team lead (first lead worker assigned to any job in this section)
        lead_name = None
        for j in jobs:
            for a in (j.assignments or []):
                if a.is_lead and a.user and a.user.full_name:
                    lead_name = a.user.full_name
                    break
            if lead_name:
                break

        # Total hours
        total_hours = sum(j.estimated_hours or 0 for j in jobs)

        # Section header bar
        self.set_fill_color(*color)
        self.set_text_color(*WHITE)
        self._font('B', 8)
        header_left = '  %s' % label
        if lead_name:
            header_left += '  -  Lead: %s *' % self._safe(lead_name, 25)
        self.cell(CW * 0.7, 5.5, header_left, fill=True)
        self._font('', 7.5)
        header_right = '%d jobs  ·  %.1fh  ' % (len(jobs), total_hours)
        self.cell(CW * 0.3, 5.5, header_right, fill=True, align='R', new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*TEXT)

        # Table column widths (sum = CW = 277mm)
        col_widths = [
            8,    # # row number
            55,   # Equipment
            60,   # Description
            50,   # Team / Workers
            60,   # Materials
            14,   # Hours
            12,   # OD (overdue)
            8,    # Done checkbox
            10,   # extra
        ]

        # Sub-header row for the table (smaller, light gray)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(*MUTED)
        self._font('B', 6)
        headers = ['#', 'Equipment', 'Description', 'Team', 'Materials', 'Hrs', 'OD', 'Done', 'Note']
        for w, h in zip(col_widths, headers):
            self.cell(w, 4, h, fill=True, align='L' if h not in ('Hrs', 'OD', 'Done') else 'C', border=0)
        self.ln()
        self.set_text_color(*TEXT)

        if group_by_equipment:
            # Group jobs by equipment_id, PMs first then defects per group
            from collections import OrderedDict
            groups: 'OrderedDict[Any, List]' = OrderedDict()
            orphans = []
            for j in jobs:
                if j.equipment_id:
                    groups.setdefault(j.equipment_id, []).append(j)
                else:
                    orphans.append(j)

            # Render each equipment group
            row_num = 0
            for eq_id, eq_jobs in groups.items():
                # Sort inside group: PM first, then defects
                eq_jobs_sorted = sorted(eq_jobs, key=lambda j: 0 if j.job_type == 'pm' else 1)

                # Equipment sub-header (thin bar with equipment name)
                first_job = eq_jobs_sorted[0]
                eq_name = self._get_equipment_name(first_job)
                self.set_fill_color(240, 245, 250)
                self.set_text_color(*NAVY)
                self._font('B', 7)
                self.cell(CW, 4, '  ' + self._safe(eq_name, 80), fill=True, border=0, new_x='LMARGIN', new_y='NEXT')
                self.set_text_color(*TEXT)

                for job in eq_jobs_sorted:
                    row_num += 1
                    try:
                        self._render_job_row(row_num, job, col_widths)
                    except Exception as e:
                        from flask import current_app
                        current_app.logger.error(f'PDF row render failed for job {job.id}: {e}')
                        self.ln()

            # Orphan jobs (no equipment) at the end
            for job in orphans:
                row_num += 1
                try:
                    self._render_job_row(row_num, job, col_widths)
                except Exception as e:
                    from flask import current_app
                    current_app.logger.error(f'PDF row render failed for job {job.id}: {e}')
                    self.ln()
        else:
            # Flat rendering — one row per job
            for idx, job in enumerate(jobs):
                try:
                    self._render_job_row(idx + 1, job, col_widths)
                except Exception as e:
                    from flask import current_app
                    current_app.logger.error(f'PDF row render failed for job {job.id}: {e}')
                    self.ln()

    def _render_job_row(self, num, job, col_widths):
        """Render a single dense job row."""
        # Page break check
        if self.get_y() > PH - 18:
            self.add_page()

        # Equipment name
        eq_name = self._get_equipment_name(job)
        # Description (strip equipment prefix)
        desc = self._get_description(job)
        # Team string (assignments)
        team_parts = []
        for a in (job.assignments or []):
            if a.user and a.user.full_name:
                name = a.user.full_name
                if a.is_lead:
                    name = name + '*'
                team_parts.append(name)
        team_str = ', '.join(team_parts) if team_parts else '(unassigned)'
        # Materials string
        mat_parts = []
        for wpm in (job.materials or []):
            if wpm.material:
                code = wpm.material.code or wpm.material.name or ''
                mat_parts.append('%s x%g' % (self._safe(code, 12), wpm.quantity or 0))
        mat_str = ', '.join(mat_parts) if mat_parts else '-'
        # Hours
        hours = job.estimated_hours or 0
        # Overdue
        od_str = ''
        if job.overdue_value and job.overdue_value > 0:
            unit = 'd' if (job.overdue_unit and 'day' in job.overdue_unit) else 'h'
            od_str = '%g%s' % (job.overdue_value, unit)

        # Background — alternate + overdue tint
        if job.overdue_value and job.overdue_value > 0:
            bg = WARN_BG
        elif num % 2 == 0:
            bg = LIGHT
        else:
            bg = WHITE
        self.set_fill_color(*bg)

        # Calculate row height based on text length
        row_x = LM
        row_y = self.get_y()

        self._font('', 7)
        self.set_text_color(*TEXT)

        # Render each cell
        # # column
        self.cell(col_widths[0], 5.5, str(num), fill=True, align='C', border=0)
        # Equipment
        self._font('B', 7)
        self.cell(col_widths[1], 5.5, self._safe(eq_name, 30), fill=True, border=0)
        # Description
        self._font('', 6.5)
        self.cell(col_widths[2], 5.5, self._safe(desc, 35), fill=True, border=0)
        # Team
        self.cell(col_widths[3], 5.5, self._safe(team_str, 35), fill=True, border=0)
        # Materials
        self._font('', 6)
        self.cell(col_widths[4], 5.5, self._safe(mat_str, 40), fill=True, border=0)
        # Hours
        self._font('', 7)
        self.cell(col_widths[5], 5.5, '%g' % hours, fill=True, align='C', border=0)
        # Overdue
        if od_str:
            self.set_text_color(*DANGER)
            self._font('B', 6.5)
        else:
            self._font('', 6.5)
        self.cell(col_widths[6], 5.5, od_str or '-', fill=True, align='C', border=0)
        self.set_text_color(*TEXT)
        # Done checkbox
        chk_x = self.get_x() + 1
        chk_y = self.get_y() + 1
        self.cell(col_widths[7], 5.5, '', fill=True, border=0)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        self.rect(chk_x, chk_y, 3.5, 3.5, 'D')
        self.set_line_width(0.2)
        # Note placeholder
        self.cell(col_widths[8], 5.5, '_____', fill=True, align='L', border=0)
        self.ln()


# ---------------------------------------------------------------------------
# Filter helpers (used by generate_plan_pdf when filters are active)
# ---------------------------------------------------------------------------

def _apply_filters_to_jobs(jobs, filters):
    """Filter a list of WorkPlanJob objects by berth, trade (work_center),
    and job_type. Returns a new list preserving order.

    filters keys (all optional):
        berths:       list of 'east' | 'west'   ('both' jobs always kept)
        work_centers: list of 'MECH' | 'ELEC'   (ELME jobs always kept)
        job_types:    list of 'pm' | 'defect' | 'inspection'
    """
    if not filters:
        return list(jobs)

    berth_set = set(filters.get('berths') or [])
    trade_set = set((w or '').upper() for w in (filters.get('work_centers') or []))
    type_set = set((t or '').lower() for t in (filters.get('job_types') or []))

    out = []
    for j in jobs:
        # Berth filter — 'both' is always kept because those jobs apply to both berths
        if berth_set:
            jb = (getattr(j, 'berth', None) or '').lower()
            if jb not in berth_set and jb != 'both':
                continue

        # Trade filter — ELME (dual-trade) is always kept because it needs both teams
        if trade_set:
            wc = (getattr(j, 'work_center', None) or 'ELME').upper()
            if wc != 'ELME' and wc not in trade_set:
                continue

        # Job type filter
        if type_set:
            jt = (getattr(j, 'job_type', None) or '').lower()
            if jt not in type_set:
                continue

        out.append(j)

    return out


def _build_filter_note(filters, language='en'):
    """Build a short human-readable filter summary like
    'Filters: Monday only · East berth · Mechanical'. Returns empty string
    if no filters are active."""
    if not filters:
        return ''

    parts = []
    is_ar = language == 'ar'

    # Day name & month name maps for Arabic localization (strftime is always en_US)
    AR_DAYS = {
        'Monday': 'الإثنين', 'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء',
        'Thursday': 'الخميس', 'Friday': 'الجمعة', 'Saturday': 'السبت',
        'Sunday': 'الأحد',
    }
    AR_MONTHS = {
        'Jan': 'يناير', 'Feb': 'فبراير', 'Mar': 'مارس', 'Apr': 'أبريل',
        'May': 'مايو', 'Jun': 'يونيو', 'Jul': 'يوليو', 'Aug': 'أغسطس',
        'Sep': 'سبتمبر', 'Oct': 'أكتوبر', 'Nov': 'نوفمبر', 'Dec': 'ديسمبر',
    }

    # Days
    days = filters.get('days') or []
    if days:
        if len(days) == 1:
            try:
                dt = datetime.strptime(days[0], '%Y-%m-%d')
                if is_ar:
                    day_name = AR_DAYS.get(dt.strftime('%A'), dt.strftime('%A'))
                    month_name = AR_MONTHS.get(dt.strftime('%b'), dt.strftime('%b'))
                    parts.append('%s, %d %s' % (day_name, dt.day, month_name))
                else:
                    parts.append(dt.strftime('%A, %d %b'))
            except Exception:
                parts.append(days[0])
        elif len(days) < 7:
            parts.append(('%d أيام' if is_ar else '%d days') % len(days))

    # Berths
    berths = filters.get('berths') or []
    if berths and len(berths) == 1:
        b = berths[0].lower()
        if b == 'east':
            parts.append('الرصيف الشرقي' if is_ar else 'East berth')
        elif b == 'west':
            parts.append('الرصيف الغربي' if is_ar else 'West berth')

    # Trades
    trades = filters.get('work_centers') or []
    if trades and len(trades) == 1:
        t = trades[0].upper()
        if t == 'MECH':
            parts.append('ميكانيكي' if is_ar else 'Mechanical')
        elif t == 'ELEC':
            parts.append('كهربائي' if is_ar else 'Electrical')

    # Job types
    types = filters.get('job_types') or []
    if types and len(types) < 3:
        label_map_en = {'pm': 'PM', 'defect': 'Defects', 'inspection': 'Inspections'}
        label_map_ar = {'pm': 'وقائية', 'defect': 'أعطال', 'inspection': 'فحوصات'}
        mp = label_map_ar if is_ar else label_map_en
        parts.append(' + '.join(mp.get(t, t) for t in types))

    if not parts:
        return ''

    prefix = 'مرشحات: ' if is_ar else 'Filters: '
    return prefix + ' \u00b7 '.join(parts)


class WorkPlanPDFService:
    """Service for generating work plan PDFs."""

    @staticmethod
    def generate_plan_pdf(plan, language='en', by_berth=True, filters=None):
        """Generate a PDF for a work plan. Cover + card-based day pages.

        Args:
            plan: WorkPlan instance.
            language: 'en' or 'ar'.
            by_berth: Legacy flag (unused, kept for backward compatibility).
            filters: Optional dict with keys days, berths, work_centers, job_types.
                     See _apply_filters_to_jobs for details. When present, the
                     PDF only includes days and jobs matching the filter, and
                     the cover page shows a filter summary note.
        """
        try:
            # Pre-compute filtered jobs per day so we can:
            #   1. Show accurate stats on the cover page
            #   2. Skip days with zero matching jobs entirely
            allowed_day_dates = None
            if filters and filters.get('days'):
                allowed_day_dates = set(filters['days'])

            filtered_jobs_by_day = {}
            for day in plan.days:
                # Day-level filter
                if allowed_day_dates is not None:
                    if day.date.strftime('%Y-%m-%d') not in allowed_day_dates:
                        filtered_jobs_by_day[day.id] = []
                        continue
                # Job-level filter
                filtered_jobs_by_day[day.id] = _apply_filters_to_jobs(
                    list(day.jobs) if day.jobs else [], filters,
                )

            filter_note = _build_filter_note(filters, language) if filters else ''
            total_filtered = sum(len(v) for v in filtered_jobs_by_day.values())

            pdf = WorkPlanPDF(plan, language)
            pdf.add_cover_page(
                filtered_jobs_by_day=filtered_jobs_by_day if filters else None,
                filter_note=filter_note,
            )

            # Walk days in order, skipping ones with zero filtered jobs
            rendered_days = 0
            for day in sorted(plan.days, key=lambda d: d.date):
                day_jobs = filtered_jobs_by_day.get(day.id)
                # When filters are active, skip empty days entirely
                if filters and not day_jobs:
                    continue
                try:
                    pdf.add_day_page(day, filtered_jobs=day_jobs)
                    rendered_days += 1
                except Exception as day_err:
                    current_app.logger.error('PDF day render failed for %s: %s' % (day.date, day_err))
                    pdf.current_day_label = day.date.strftime('%A, %d %B %Y') + ' (ERROR)'
                    pdf.current_day_stats = ''
                    pdf.add_page()
                    pdf._font('', 9)
                    pdf.set_text_color(*RED)
                    pdf.cell(CW, 8, 'Error rendering this day: %s' % str(day_err)[:100],
                             new_x='LMARGIN', new_y='NEXT')

            temp_dir = tempfile.gettempdir()
            filename = 'work_plan_%d_%s.pdf' % (plan.id, plan.week_start.strftime('%Y%m%d'))
            temp_path = os.path.join(temp_dir, filename)
            pdf.output(temp_path)

            from app.services.file_service import FileService
            with open(temp_path, 'rb') as f:
                file_record = FileService.upload_from_bytes(
                    file_bytes=f.read(),
                    filename=filename,
                    mime_type='application/pdf',
                    uploaded_by=plan.created_by_id,
                    related_type='work_plan',
                    related_id=plan.id,
                    category='work_plan'
                )

            os.remove(temp_path)
            return file_record

        except Exception as e:
            current_app.logger.error('Failed to generate work plan PDF: %s' % str(e))
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def generate_day_pdf(plan, day_date, language='en'):
        """Generate a PDF for a single day."""
        try:
            target_day = None
            for day in plan.days:
                if day.date.strftime('%Y-%m-%d') == day_date:
                    target_day = day
                    break

            if not target_day:
                return None

            pdf = WorkPlanPDF(plan, language)
            pdf.add_day_page(target_day)

            temp_dir = tempfile.gettempdir()
            filename = 'work_plan_%d_day_%s.pdf' % (plan.id, day_date)
            temp_path = os.path.join(temp_dir, filename)
            pdf.output(temp_path)

            from app.services.file_service import FileService
            with open(temp_path, 'rb') as f:
                file_record = FileService.upload_from_bytes(
                    file_bytes=f.read(),
                    filename=filename,
                    mime_type='application/pdf',
                    uploaded_by=plan.created_by_id,
                    related_type='work_plan_day',
                    related_id=target_day.id,
                    category='work_plan'
                )

            os.remove(temp_path)
            return file_record

        except Exception as e:
            current_app.logger.error('Failed to generate day PDF: %s' % str(e))
            import traceback
            traceback.print_exc()
            return None
