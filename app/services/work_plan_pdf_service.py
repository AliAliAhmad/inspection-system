"""
Work Plan PDF Service — Professional Weekly Plan Report.
Landscape A4, one page per day, clean table layout.
PM/Defect: full details table. Inspections: compact grid.
"""

from fpdf import FPDF
from datetime import datetime
import os
import tempfile
import requests
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
CW = PW - LM - RM  # content width


class WorkPlanPDF(FPDF):
    """Professional landscape PDF for weekly work plans."""

    def __init__(self, plan, language='en'):
        super().__init__(orientation='L', format='A4')
        self.plan = plan
        self.language = language
        self.set_auto_page_break(auto=True, margin=14)
        self.current_day_label = ''
        self.current_day_stats = ''
        self._rnr_cache = {}  # Cache RNR readings per equipment_id

    # ── Header / Footer ──────────────────────────────────────────
    def header(self):
        # Top bar
        self.set_fill_color(*NAVY)
        self.rect(0, 0, PW, 3.5, 'F')

        self.set_y(5)
        # Left: title
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(*NAVY)
        self.cell(70, 5, 'WEEKLY WORK PLAN')

        # Center: week range
        self.set_font('Helvetica', '', 8)
        self.set_text_color(*MUTED)
        week_str = '%s  -  %s' % (
            self.plan.week_start.strftime('%d %b %Y'),
            self.plan.week_end.strftime('%d %b %Y'),
        )
        self.cell(CW - 140, 5, week_str, align='C')

        # Right: status
        status = getattr(self.plan, 'status', 'draft')
        sc = SUCCESS if status == 'published' else ORANGE
        self.set_fill_color(*sc)
        self.set_text_color(*WHITE)
        self.set_font('Helvetica', 'B', 7)
        self.cell(70, 5, status.upper(), fill=True, align='R', new_x='LMARGIN', new_y='NEXT')

        # Day header
        if self.current_day_label:
            self.ln(1)
            self.set_fill_color(*NAVY)
            self.set_text_color(*WHITE)
            self.set_font('Helvetica', 'B', 11)
            self.cell(CW * 0.6, 7, '   %s' % self.current_day_label, fill=True)
            if self.current_day_stats:
                self.set_font('Helvetica', '', 8)
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
        self.set_font('Helvetica', 'I', 6)
        self.set_text_color(*MUTED)
        ts = datetime.utcnow().strftime('%d %b %Y %H:%M UTC')
        self.cell(CW / 2, 4, 'Generated %s  |  Inspection System' % ts)
        self.cell(CW / 2, 4, 'Page %d' % self.page_no(), align='R')

    # ── Helpers ───────────────────────────────────────────────────
    def _s(self, text, max_len=0):
        """Latin-1 safe text with optional truncation."""
        if text is None:
            return ''
        s = str(text).encode('latin-1', errors='replace').decode('latin-1')
        if max_len and len(s) > max_len:
            return s[:max_len - 1] + '.'
        return s

    def _pill(self, label, color, w=16):
        """Small colored pill/badge."""
        self.set_fill_color(*color)
        self.set_text_color(*WHITE)
        self.set_font('Helvetica', 'B', 6)
        self.cell(w, 4.5, label, fill=True, align='C')
        self.set_text_color(*TEXT)

    # ── Cover Page ────────────────────────────────────────────────
    def add_cover_page(self):
        """Summary cover page."""
        self.current_day_label = ''
        self.current_day_stats = ''
        self.add_page()

        # Big title
        self.ln(15)
        self.set_font('Helvetica', 'B', 28)
        self.set_text_color(*NAVY)
        self.cell(CW, 14, 'Work Plan', align='C', new_x='LMARGIN', new_y='NEXT')
        self.set_font('Helvetica', '', 14)
        self.set_text_color(*MUTED)
        self.cell(CW, 8, '%s  -  %s' % (
            self.plan.week_start.strftime('%d %B %Y'),
            self.plan.week_end.strftime('%d %B %Y'),
        ), align='C', new_x='LMARGIN', new_y='NEXT')
        self.ln(10)

        # Summary stats boxes
        total_jobs = sum(len(list(d.jobs)) for d in self.plan.days)
        total_hours = sum(sum(j.estimated_hours or 0 for j in d.jobs) for d in self.plan.days)
        pm_count = sum(1 for d in self.plan.days for j in d.jobs if j.job_type == 'pm')
        defect_count = sum(1 for d in self.plan.days for j in d.jobs if j.job_type == 'defect')
        insp_count = sum(1 for d in self.plan.days for j in d.jobs if j.job_type == 'inspection')

        boxes = [
            (str(total_jobs), 'Total Jobs', NAVY),
            (str(pm_count), 'PM Jobs', TEAL),
            (str(defect_count), 'Defect Repairs', RED),
            (str(insp_count), 'Inspections', GREY),
        ]
        bw = 48
        gap = 6
        sx = (PW - (bw * len(boxes) + gap * (len(boxes) - 1))) / 2
        y0 = self.get_y()
        for i, (val, lab, col) in enumerate(boxes):
            x = sx + i * (bw + gap)
            self.set_fill_color(*col)
            self.rect(x, y0, bw, 20, 'F')
            # rounded look — overlay white rounded corners
            self.set_text_color(*WHITE)
            self.set_xy(x, y0 + 2)
            self.set_font('Helvetica', 'B', 16)
            self.cell(bw, 9, val, align='C')
            self.set_xy(x, y0 + 12)
            self.set_font('Helvetica', '', 7)
            self.cell(bw, 5, lab, align='C')
        self.set_y(y0 + 28)
        self.set_text_color(*TEXT)

        # Daily breakdown table
        self.set_font('Helvetica', 'B', 10)
        self.cell(CW, 7, 'Daily Breakdown', new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

        # Header
        hcols = [(55, 'Day'), (25, 'PM'), (25, 'Defect'), (25, 'Inspect'), (25, 'Total'), (116, 'Team')]
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font('Helvetica', 'B', 7)
        for w, lab in hcols:
            self.cell(w, 5.5, '  ' + lab, fill=True)
        self.ln()
        self.set_text_color(*TEXT)

        for idx, day in enumerate(sorted(self.plan.days, key=lambda d: d.date)):
            all_j = list(day.jobs)
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
            self.set_font('Helvetica', '', 7.5)
            self.cell(55, 5, '  %s' % day.date.strftime('%A, %d %b'), fill=True)
            self.cell(25, 5, str(dpm), fill=True, align='C')
            self.cell(25, 5, str(ddef), fill=True, align='C')
            self.cell(25, 5, str(dins), fill=True, align='C')
            self.set_font('Helvetica', 'B', 7.5)
            self.cell(25, 5, str(len(all_j)), fill=True, align='C')
            self.set_font('Helvetica', '', 6.5)
            self.cell(116, 5, self._s(', '.join(sorted(team)), 70), fill=True, new_x='LMARGIN', new_y='NEXT')

        self.ln(6)

        # Team roster
        users_by_role = {}
        for day in self.plan.days:
            for job in day.jobs:
                for a in (job.assignments or []):
                    if a.user and a.user.full_name:
                        role = (a.user.role or 'other').replace('_', ' ').title()
                        users_by_role.setdefault(role, set()).add(a.user.full_name)

        if users_by_role:
            self.set_font('Helvetica', 'B', 10)
            self.cell(CW, 7, 'Team Roster', new_x='LMARGIN', new_y='NEXT')
            self.ln(1)
            for role, names in sorted(users_by_role.items()):
                self.set_font('Helvetica', 'B', 7.5)
                self.set_text_color(*BLUE)
                self.cell(32, 4.5, '  %s:' % role)
                self.set_font('Helvetica', '', 7.5)
                self.set_text_color(*TEXT)
                self.cell(CW - 32, 4.5, ', '.join(sorted(names)), new_x='LMARGIN', new_y='NEXT')

    # ── Day Page ──────────────────────────────────────────────────
    def add_day_page(self, day):
        """One page per day: berth sections with job tables."""
        all_jobs = list(day.jobs) if day.jobs else []
        total = len(all_jobs)
        hours = sum(j.estimated_hours or 0 for j in all_jobs)

        self.current_day_label = day.date.strftime('%A, %d %B %Y')
        self.current_day_stats = '%d jobs' % total
        self.add_page()

        east = sorted(
            [j for j in all_jobs if getattr(j, 'berth', None) in ('east', 'both', None)],
            key=lambda j: (0 if j.job_type == 'pm' else 1 if j.job_type == 'defect' else 2, j.position or 0)
        )
        west = sorted(
            [j for j in all_jobs if getattr(j, 'berth', None) == 'west'],
            key=lambda j: (0 if j.job_type == 'pm' else 1 if j.job_type == 'defect' else 2, j.position or 0)
        )

        east_hrs = sum(j.estimated_hours or 0 for j in east)
        west_hrs = sum(j.estimated_hours or 0 for j in west)

        self._berth_section('EAST BERTH', GREEN, east, east_hrs)
        self.ln(3)
        self._berth_section('WEST BERTH', PURPLE, west, west_hrs)

        # Notes area at bottom
        y = self.get_y() + 4
        if y < PH - 30:
            self.set_y(y)
            self.set_font('Helvetica', 'B', 7)
            self.set_text_color(*MUTED)
            self.cell(CW, 4, 'Notes:', new_x='LMARGIN', new_y='NEXT')
            self.set_draw_color(*BORDER)
            for _ in range(3):
                ly = self.get_y()
                self.line(LM, ly + 4, PW - RM, ly + 4)
                self.ln(5.5)

    def _berth_section(self, label, color, jobs, hours):
        """Render a berth section with header + job table + inspections."""
        # Berth header bar
        self.set_fill_color(*color)
        self.set_text_color(*WHITE)
        self.set_font('Helvetica', 'B', 8.5)
        self.cell(CW * 0.65, 6, '   %s' % label, fill=True)
        self.set_font('Helvetica', '', 7.5)
        self.cell(CW * 0.35, 6, '%d jobs   ' % len(jobs), fill=True, align='R',
                  new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*TEXT)
        self.ln(1)

        if not jobs:
            self.set_font('Helvetica', 'I', 7.5)
            self.set_text_color(*MUTED)
            self.cell(CW, 5, '   No jobs scheduled', new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*TEXT)
            return

        pm_def = [j for j in jobs if j.job_type != 'inspection']
        inspections = [j for j in jobs if j.job_type == 'inspection']

        # ── PM / Defect Table ──
        if pm_def:
            self._job_table(pm_def)

        # ── Inspections (single compact line) ──
        if inspections:
            self.ln(1)
            eq_names = []
            for j in inspections:
                eq = ''
                if j.equipment:
                    eq = j.equipment.name or j.equipment.serial_number or ''
                elif j.inspection_assignment and j.inspection_assignment.equipment:
                    eq = j.inspection_assignment.equipment.name or ''
                if eq:
                    eq_names.append(self._s(eq, 20))
            line = 'Inspections (%d):  %s' % (len(inspections), ',  '.join(eq_names) if eq_names else '-')
            self.set_fill_color(*LIGHT)
            self.set_font('Helvetica', 'I', 6.5)
            self.set_text_color(*GREY)
            self.cell(CW, 4, '  ' + self._s(line, 150), fill=True, new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*TEXT)

    def _job_table(self, jobs):
        """Render PM/defect jobs as a professional table."""
        # Column widths:  #  Type  Equipment  Description  SAP#  Team  Materials  Done
        cols = [7, 14, 55, 58, 26, 55, 55, 7]
        headers = ['#', 'Type', 'Equipment', 'Description', 'SAP #', 'Team', 'Materials', '']

        # Table header
        self.set_fill_color(70, 90, 120)
        self.set_text_color(*WHITE)
        self.set_font('Helvetica', 'B', 6.5)
        for i, (w, h) in enumerate(zip(cols, headers)):
            al = 'C' if i in (0, 4, 5, 8) else 'L'
            self.cell(w, 5, h, fill=True, align=al)
        self.ln()
        self.set_text_color(*TEXT)

        for idx, job in enumerate(jobs):
            if self.get_y() > PH - 22:
                self.add_page()
                # Re-draw header
                self.set_fill_color(70, 90, 120)
                self.set_text_color(*WHITE)
                self.set_font('Helvetica', 'B', 6.5)
                for i, (w, h) in enumerate(zip(cols, headers)):
                    al = 'C' if i in (0, 4, 5, 8) else 'L'
                    self.cell(w, 5, h, fill=True, align=al)
                self.ln()
                self.set_text_color(*TEXT)

            # Row background
            is_overdue = job.overdue_value and job.overdue_value > 0
            no_sap = not job.sap_order_number and job.job_type == 'pm'
            if is_overdue:
                bg = WARN_BG
            elif no_sap:
                bg = ERR_BG
            elif idx % 2 == 0:
                bg = LIGHT
            else:
                bg = WHITE
            self.set_fill_color(*bg)

            # #
            self.set_font('Helvetica', '', 6)
            self.cell(cols[0], 5.5, str(idx + 1), fill=True, align='C')

            # Type pill (inline)
            if job.job_type == 'pm':
                self.set_fill_color(*TEAL)
                tl = 'PM'
            else:
                self.set_fill_color(*RED)
                tl = 'DEF'
            self.set_text_color(*WHITE)
            self.set_font('Helvetica', 'B', 5.5)
            self.cell(cols[1], 5.5, tl, fill=True, align='C')
            self.set_text_color(*TEXT)
            self.set_fill_color(*bg)

            # Equipment
            eq = ''
            if job.equipment:
                eq = job.equipment.name or job.equipment.serial_number or ''
            self.set_font('Helvetica', 'B', 7)
            self.cell(cols[2], 5.5, self._s(eq, 30), fill=True)

            # Description
            desc = job.description or ''
            if not desc and job.defect:
                desc = job.defect.description or ''
            # Strip equipment name prefix from description
            if eq and desc.startswith(eq):
                desc = desc[len(eq):].lstrip(' -_.')
            self.set_font('Helvetica', '', 6.5)
            self.cell(cols[3], 5.5, self._s(desc, 35), fill=True)

            # SAP # (blank if none — user can write it in)
            sap = job.sap_order_number or ''
            if sap:
                self.set_font('Helvetica', '', 6.5)
                self.set_text_color(*BLUE)
            else:
                self.set_font('Helvetica', '', 6.5)
                self.set_text_color(*TEXT)
            self.cell(cols[4], 5.5, self._s(sap, 14), fill=True, align='C')
            self.set_text_color(*TEXT)

            # Team (full names) — collect text
            team_parts = []
            for a in (job.assignments or []):
                name = a.user.full_name if a.user and a.user.full_name else '?'
                if a.is_lead:
                    name = name + '*'
                team_parts.append(name)
            team_str = ', '.join(team_parts) if team_parts else '-'

            # Materials (show ALL) — collect text
            mat_parts = []
            for wpm in (job.materials or []):
                if wpm.material:
                    code = wpm.material.code or wpm.material.name or ''
                    mat_parts.append('%s x%g' % (self._s(code, 15), wpm.quantity or 0))
            mat_str = ', '.join(mat_parts)

            # Calculate row height based on team + materials text length
            row_x = self.get_x()
            row_y = self.get_y()
            self.set_font('Helvetica', '', 5.5)
            team_safe = self._s(team_str, 200)
            mat_safe = self._s(mat_str, 200)
            team_lines = max(1, self.get_string_width(team_safe) // (cols[5] - 2) + 1)
            mat_lines = max(1, self.get_string_width(mat_safe) // (cols[6] - 2) + 1)
            row_h = max(5.5, int(max(team_lines, mat_lines)) * 3.5 + 2)

            # Draw background for full row at calculated height
            self.set_fill_color(*bg)
            sum_before = sum(cols[:5])
            self.rect(LM + sum_before, row_y, cols[5], row_h, 'F')
            self.rect(LM + sum_before + cols[5], row_y, cols[6], row_h, 'F')
            self.rect(LM + sum_before + cols[5] + cols[6], row_y, cols[7], row_h, 'F')

            # Team — use multi_cell for wrapping
            self.set_xy(row_x, row_y)
            self.set_font('Helvetica', '', 5.5)
            self.multi_cell(cols[5], 3.5, team_safe, new_x='RIGHT', new_y='TOP', max_line_height=3.5)

            # Materials — use multi_cell for wrapping
            self.set_xy(row_x + cols[5], row_y)
            self.set_font('Helvetica', '', 5)
            self.multi_cell(cols[6], 3.5, mat_safe, new_x='RIGHT', new_y='TOP', max_line_height=3.5)

            # Done checkbox
            chk_x = LM + sum(cols[:7])
            self.set_draw_color(*BORDER)
            self.rect(chk_x + 1, row_y + (row_h / 2) - 2, 4, 4, 'D')

            # Move to next row
            self.set_y(row_y + row_h)

            # ── Extra info lines below the row ──

            # Notes line (if exists)
            if job.notes:
                self.set_font('Helvetica', 'I', 5.5)
                self.set_text_color(100, 100, 100)
                self.cell(CW, 4, '    Note: %s' % self._s(job.notes, 120), new_x='LMARGIN', new_y='NEXT')
                self.set_text_color(*TEXT)

            # Defect severity + photo indicator (if defect job)
            if job.job_type == 'defect' and job.defect:
                severity = getattr(job.defect, 'severity', None)
                photo_url = getattr(job.defect, 'photo_url', None)
                has_photo = bool(photo_url)
                if severity or has_photo:
                    self.set_font('Helvetica', 'B', 5.5)
                    sev_colors = {'critical': DANGER, 'high': (230, 126, 34), 'medium': WARN_BG, 'low': MUTED}
                    if severity:
                        sc = sev_colors.get(severity, MUTED)
                        self.set_text_color(*sc)
                        self.cell(25, 3.5, '    %s' % severity.upper())
                    if has_photo:
                        self.set_text_color(*BLUE)
                        self.cell(20, 3.5, '[Photo]')
                    self.set_text_color(*TEXT)
                    self.ln()

            # RNR reading badge (cached per equipment)
            if job.equipment_id and job.equipment_id not in self._rnr_cache:
                try:
                    from app.models.equipment_reading import EquipmentReading
                    latest = EquipmentReading.get_latest_reading(job.equipment_id, 'rnr')
                    self._rnr_cache[job.equipment_id] = latest.reading_value if latest and not latest.is_faulty else None
                except Exception:
                    self._rnr_cache[job.equipment_id] = None

            rnr_val = self._rnr_cache.get(job.equipment_id) if job.equipment_id else None
            if rnr_val is not None:
                self.set_font('Helvetica', '', 5)
                self.set_text_color(*BLUE)
                self.cell(CW, 3.5, '    RNR: %.0fh' % rnr_val, new_x='LMARGIN', new_y='NEXT')
                self.set_text_color(*TEXT)


class WorkPlanPDFService:
    """Service for generating work plan PDFs."""

    @staticmethod
    def generate_plan_pdf(plan, language='en', by_berth=True):
        """Generate a PDF for a work plan. Cover + one page per day."""
        try:
            pdf = WorkPlanPDF(plan, language)

            # Cover page
            pdf.add_cover_page()

            # One page per day
            for day in sorted(plan.days, key=lambda d: d.date):
                try:
                    pdf.add_day_page(day)
                except Exception as day_err:
                    current_app.logger.error('PDF day render failed for %s: %s' % (day.date, day_err))
                    pdf.current_day_label = day.date.strftime('%A, %d %B %Y') + ' (ERROR)'
                    pdf.current_day_stats = ''
                    pdf.add_page()
                    pdf.set_font('Helvetica', 'I', 9)
                    pdf.set_text_color(*RED)
                    pdf.cell(CW, 8, 'Error rendering this day: %s' % str(day_err)[:100], new_x='LMARGIN', new_y='NEXT')

            # Save to temp file
            temp_dir = tempfile.gettempdir()
            filename = 'work_plan_%d_%s.pdf' % (plan.id, plan.week_start.strftime('%Y%m%d'))
            temp_path = os.path.join(temp_dir, filename)
            pdf.output(temp_path)

            # Upload to Cloudinary (raw type for PDF)
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
