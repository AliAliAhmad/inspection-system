"""
Work Plan PDF Service.
Generates professional PDF reports for weekly work plans.
Layout: one page per day, landscape, berth-separated, with job details.
PM/Defect: full details (equipment, description, SAP#, team, materials, defect photo).
Inspection: compact summary.
"""

from fpdf import FPDF
from datetime import datetime
import os
import tempfile
import requests
from flask import current_app


# Color palette — professional dark/accent scheme
C_PRIMARY = (25, 55, 109)         # Navy
C_ACCENT = (41, 128, 185)         # Blue
C_EAST = (39, 174, 96)            # Green
C_WEST = (142, 68, 173)           # Purple
C_PM = (41, 128, 185)             # Blue
C_DEFECT = (192, 57, 43)          # Red
C_INSPECTION = (127, 140, 141)    # Grey
C_WHITE = (255, 255, 255)
C_LIGHT = (245, 247, 250)         # Light background
C_LIGHT2 = (235, 240, 248)        # Slightly darker alternate
C_BORDER = (200, 210, 220)        # Border
C_TEXT = (44, 62, 80)             # Dark text
C_MUTED = (130, 145, 155)         # Muted text
C_WARNING = (243, 156, 18)        # Orange
C_DANGER = (231, 76, 60)          # Red
C_SUCCESS = (46, 204, 113)        # Green


class WorkPlanPDF(FPDF):
    """Custom landscape PDF for work plan reports."""

    def __init__(self, plan, language='en'):
        super().__init__(orientation='L', format='A4')
        self.plan = plan
        self.language = language
        self.set_auto_page_break(auto=True, margin=15)
        self.current_day_label = ''
        self._photo_cache = {}

    def header(self):
        # Top accent bar
        self.set_fill_color(*C_PRIMARY)
        self.rect(0, 0, 297, 4, 'F')

        # Header row
        self.set_y(6)
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(*C_PRIMARY)
        self.cell(80, 6, 'WEEKLY WORK PLAN', new_x='RIGHT')

        # Week dates
        self.set_font('Helvetica', '', 9)
        self.set_text_color(*C_MUTED)
        week_str = '%s - %s' % (
            self.plan.week_start.strftime('%d %b'),
            self.plan.week_end.strftime('%d %b %Y')
        )
        self.cell(100, 6, week_str, align='C')

        # Status badge
        status = getattr(self.plan, 'status', 'draft')
        if status == 'published':
            self.set_fill_color(*C_SUCCESS)
        else:
            self.set_fill_color(*C_WARNING)
        self.set_text_color(*C_WHITE)
        self.set_font('Helvetica', 'B', 7)
        self.cell(0, 6, '  %s  ' % status.upper(), fill=True, align='R', new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*C_TEXT)

        # Day label
        if self.current_day_label:
            self.ln(1)
            self.set_fill_color(*C_PRIMARY)
            self.set_text_color(*C_WHITE)
            self.set_font('Helvetica', 'B', 11)
            self.cell(0, 8, '  %s' % self.current_day_label, fill=True, new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*C_TEXT)
        self.ln(3)

    def footer(self):
        self.set_y(-10)
        self.set_font('Helvetica', 'I', 7)
        self.set_text_color(*C_MUTED)
        self.cell(0, 4, 'Generated %s   |   Inspection System' % datetime.utcnow().strftime('%d %b %Y %H:%M UTC'), align='L')
        self.set_x(-30)
        self.cell(0, 4, 'Page %d' % self.page_no(), align='R')

    def _safe(self, text, max_len=0):
        """Ensure text is latin-1 safe and optionally truncated."""
        if text is None:
            return ''
        s = str(text)
        s = s.encode('latin-1', errors='replace').decode('latin-1')
        if max_len and len(s) > max_len:
            return s[:max_len - 2] + '..'
        return s

    def _type_badge(self, job_type, x=None, y=None):
        """Draw a small colored type badge."""
        colors = {'pm': C_PM, 'defect': C_DEFECT, 'inspection': C_INSPECTION}
        labels = {'pm': 'PM', 'defect': 'DEFECT', 'inspection': 'INSP'}
        color = colors.get(job_type, C_MUTED)
        label = labels.get(job_type, job_type[:4].upper())

        self.set_fill_color(*color)
        self.set_text_color(*C_WHITE)
        self.set_font('Helvetica', 'B', 7)
        self.cell(18, 5, label, fill=True, align='C')
        self.set_text_color(*C_TEXT)

    def _berth_header(self, label, color, job_count, total_hours):
        """Draw berth section header with stats."""
        self.set_fill_color(*color)
        self.set_text_color(*C_WHITE)
        self.set_font('Helvetica', 'B', 10)
        self.cell(180, 7, '  %s' % label, fill=True)
        self.set_font('Helvetica', '', 8)
        stats = '%d jobs  |  %.1f hours' % (job_count, total_hours)
        self.cell(0, 7, '%s  ' % stats, fill=True, align='R', new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*C_TEXT)
        self.ln(2)

    def _download_photo(self, url):
        """Download a photo and return the temp file path (cached)."""
        if not url:
            return None
        if url in self._photo_cache:
            return self._photo_cache[url]
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200 and len(resp.content) > 100:
                ext = '.jpg'
                if 'png' in resp.headers.get('content-type', ''):
                    ext = '.png'
                tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                tmp.write(resp.content)
                tmp.close()
                self._photo_cache[url] = tmp.name
                return tmp.name
        except Exception:
            pass
        self._photo_cache[url] = None
        return None

    def _cleanup_photos(self):
        """Remove cached photo temp files."""
        for path in self._photo_cache.values():
            if path:
                try:
                    os.remove(path)
                except Exception:
                    pass

    def add_day_page(self, day):
        """Add a full page for one day with East and West berth sections."""
        self.current_day_label = day.date.strftime('%A, %d %B %Y')
        self.add_page()

        all_jobs = list(day.jobs) if day.jobs else []
        east_jobs = sorted(
            [j for j in all_jobs if getattr(j, 'berth', '') in ('east', 'both', None)],
            key=lambda j: (0 if j.job_type == 'pm' else 1 if j.job_type == 'defect' else 2, j.position or 0)
        )
        west_jobs = sorted(
            [j for j in all_jobs if getattr(j, 'berth', '') == 'west'],
            key=lambda j: (0 if j.job_type == 'pm' else 1 if j.job_type == 'defect' else 2, j.position or 0)
        )

        # East berth
        east_hours = sum(j.estimated_hours or 0 for j in east_jobs)
        self._berth_header('EAST BERTH', C_EAST, len(east_jobs), east_hours)
        self._render_jobs(east_jobs)

        self.ln(4)

        # West berth
        west_hours = sum(j.estimated_hours or 0 for j in west_jobs)
        self._berth_header('WEST BERTH', C_WEST, len(west_jobs), west_hours)
        self._render_jobs(west_jobs)

    def _render_jobs(self, jobs):
        """Render jobs: PM/defect detailed, inspections compact."""
        if not jobs:
            self.set_font('Helvetica', 'I', 8)
            self.set_text_color(*C_MUTED)
            self.cell(0, 6, '  No jobs scheduled', new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*C_TEXT)
            return

        inspections = [j for j in jobs if j.job_type == 'inspection']
        pm_defect = [j for j in jobs if j.job_type != 'inspection']

        # ---- PM & Defect: Detailed cards ----
        for idx, job in enumerate(pm_defect):
            self._render_job_card(job, idx)

        # ---- Inspections: Compact list ----
        if inspections:
            self.ln(2)
            self.set_fill_color(*C_INSPECTION)
            self.set_text_color(*C_WHITE)
            self.set_font('Helvetica', 'B', 8)
            self.cell(0, 5, '  INSPECTIONS (%d)' % len(inspections), fill=True, new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*C_TEXT)
            self.ln(1)

            self.set_font('Helvetica', '', 7)
            for idx, j in enumerate(inspections):
                if self.get_y() > 185:
                    self.add_page()
                eq_name = ''
                if j.equipment:
                    eq_name = j.equipment.name or j.equipment.serial_number or ''
                elif j.inspection_assignment and j.inspection_assignment.equipment:
                    eq_name = j.inspection_assignment.equipment.name or ''
                team = ', '.join(
                    a.user.full_name.split()[0] for a in (j.assignments or []) if a.user and a.user.full_name
                ) or '-'

                bg = C_LIGHT if idx % 2 == 0 else C_WHITE
                self.set_fill_color(*bg)
                self.cell(8, 4, str(idx + 1), fill=True, align='C')
                self.cell(80, 4, self._safe(eq_name, 45), fill=True)
                self.cell(60, 4, self._safe(j.description or '', 35), fill=True)
                self.cell(50, 4, self._safe(team, 28), fill=True)
                self.cell(15, 4, '%.1fh' % (j.estimated_hours or 0), fill=True, align='C', new_x='LMARGIN', new_y='NEXT')

    def _render_job_card(self, job, idx):
        """Render a single PM or defect job as a detailed card."""
        # Check page break
        needed_height = 22
        if job.job_type == 'defect':
            needed_height = 35  # Extra space for photo
        if self.get_y() + needed_height > 185:
            self.add_page()

        # Card background
        bg = C_LIGHT if idx % 2 == 0 else C_LIGHT2
        card_y = self.get_y()

        # Highlight overdue or missing SAP
        is_overdue = job.overdue_value and job.overdue_value > 0
        if is_overdue:
            bg = (255, 240, 220)
        if not job.sap_order_number and job.job_type == 'pm':
            bg = (255, 230, 230)

        # Draw card background
        self.set_fill_color(*bg)
        card_height = 18
        if job.job_type == 'defect':
            card_height = 28
        self.rect(10, card_y, 277, card_height, 'F')

        # Left color bar
        bar_color = C_PM if job.job_type == 'pm' else C_DEFECT
        self.set_fill_color(*bar_color)
        self.rect(10, card_y, 3, card_height, 'F')

        # Row 1: Type badge + Equipment + SAP + Hours
        self.set_xy(15, card_y + 1)
        self._type_badge(job.job_type)

        # Equipment name
        eq_name = ''
        if job.equipment:
            eq_name = job.equipment.name or job.equipment.serial_number or ''
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(*C_TEXT)
        self.cell(2, 5, '')  # spacer
        self.cell(90, 5, self._safe(eq_name, 50))

        # SAP order
        sap = job.sap_order_number or ''
        if sap:
            self.set_font('Helvetica', '', 8)
            self.set_text_color(*C_ACCENT)
            self.cell(40, 5, 'SAP: %s' % self._safe(sap, 15))
        else:
            self.set_font('Helvetica', 'I', 7)
            self.set_text_color(*C_DANGER)
            self.cell(40, 5, 'No SAP #')

        # Hours
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(*C_PRIMARY)
        self.cell(20, 5, '%.1fh' % (job.estimated_hours or 0), align='C')

        # Overdue warning
        if is_overdue:
            self.set_font('Helvetica', 'B', 7)
            self.set_text_color(*C_DANGER)
            self.cell(0, 5, 'OVERDUE %s%s' % (job.overdue_value, job.overdue_unit or 'h'), align='R')

        # Row 2: Description + Team + Materials
        self.set_xy(15, card_y + 7)
        self.set_font('Helvetica', '', 8)
        self.set_text_color(*C_TEXT)

        # Description
        desc = job.description or ''
        if not desc and job.defect:
            desc = job.defect.description or ''
        self.cell(100, 4, self._safe(desc, 58))

        # Team
        team_parts = []
        for a in (job.assignments or []):
            name = a.user.full_name.split()[0] if a.user and a.user.full_name else '?'
            if a.is_lead:
                name = '* ' + name
            team_parts.append(name)
        team_str = ', '.join(team_parts) if team_parts else 'No team'

        self.set_font('Helvetica', '', 7)
        self.set_text_color(*C_MUTED)
        self.cell(5, 4, '')
        self.set_text_color(80, 80, 80)
        self.cell(70, 4, 'Team: %s' % self._safe(team_str, 38))

        # Materials
        mat_parts = []
        for wpm in (job.materials or []):
            if wpm.material:
                mat_parts.append('%s x%.0f' % (self._safe(wpm.material.code or wpm.material.name, 15), wpm.quantity or 0))
        if mat_parts:
            mat_str = ', '.join(mat_parts[:4])
            if len(mat_parts) > 4:
                mat_str += ' +%d' % (len(mat_parts) - 4)
            self.cell(0, 4, 'Mat: %s' % mat_str, align='R')

        # Row 3 (defect only): Photo thumbnail + severity
        if job.job_type == 'defect' and job.defect:
            self.set_xy(15, card_y + 12)

            # Severity badge
            severity = getattr(job.defect, 'severity', None)
            if severity:
                sev_colors = {'critical': C_DANGER, 'high': (230, 126, 34), 'medium': C_WARNING, 'low': C_MUTED}
                sev_color = sev_colors.get(severity, C_MUTED)
                self.set_fill_color(*sev_color)
                self.set_text_color(*C_WHITE)
                self.set_font('Helvetica', 'B', 6)
                self.cell(20, 4, severity.upper(), fill=True, align='C')
                self.set_text_color(*C_TEXT)
                self.cell(3, 4, '')

            # Defect photo thumbnail
            photo_url = None
            if job.defect.inspection_id:
                # Get photo from inspection answer
                try:
                    from app.models.inspection import InspectionAnswer
                    answer = InspectionAnswer.query.filter_by(
                        inspection_id=job.defect.inspection_id,
                        checklist_item_id=job.defect.checklist_item_id
                    ).first()
                    if answer and answer.photo_file:
                        photo_url = answer.photo_file.get_url()
                except Exception:
                    pass
            if not photo_url:
                photo_url = getattr(job.defect, 'photo_url', None)

            if photo_url:
                photo_path = self._download_photo(photo_url)
                if photo_path:
                    try:
                        self.image(photo_path, x=self.get_x(), y=card_y + 12, h=14)
                    except Exception:
                        pass

        # Move Y after card
        self.set_y(card_y + card_height + 2)

    def add_summary_page(self):
        """Add a summary page at the end."""
        self.current_day_label = 'WEEKLY SUMMARY'
        self.add_page()

        total_jobs = sum(len(list(d.jobs)) for d in self.plan.days)
        total_hours = sum(sum(j.estimated_hours or 0 for j in d.jobs) for d in self.plan.days)
        pm_count = sum(sum(1 for j in d.jobs if j.job_type == 'pm') for d in self.plan.days)
        defect_count = sum(sum(1 for j in d.jobs if j.job_type == 'defect') for d in self.plan.days)
        inspection_count = sum(sum(1 for j in d.jobs if j.job_type == 'inspection') for d in self.plan.days)

        # Stats boxes
        stats = [
            ('Total Jobs', str(total_jobs), C_PRIMARY),
            ('Total Hours', '%.0fh' % total_hours, C_ACCENT),
            ('PM Jobs', str(pm_count), C_PM),
            ('Defect Repairs', str(defect_count), C_DEFECT),
            ('Inspections', str(inspection_count), C_INSPECTION),
        ]
        box_w = 50
        start_x = (297 - box_w * len(stats) - 8 * (len(stats) - 1)) / 2
        for i, (label, value, color) in enumerate(stats):
            x = start_x + i * (box_w + 8)
            y = self.get_y()
            # Box background
            self.set_fill_color(*color)
            self.rect(x, y, box_w, 22, 'F')
            # Value
            self.set_xy(x, y + 2)
            self.set_font('Helvetica', 'B', 18)
            self.set_text_color(*C_WHITE)
            self.cell(box_w, 10, value, align='C')
            # Label
            self.set_xy(x, y + 13)
            self.set_font('Helvetica', '', 8)
            self.cell(box_w, 6, label, align='C')

        self.set_y(self.get_y() + 30)
        self.set_text_color(*C_TEXT)

        # Per-day breakdown table
        self.set_font('Helvetica', 'B', 10)
        self.cell(0, 7, 'Daily Breakdown', new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

        # Table header
        self.set_fill_color(*C_PRIMARY)
        self.set_text_color(*C_WHITE)
        self.set_font('Helvetica', 'B', 8)
        self.cell(50, 6, '  Day', fill=True)
        self.cell(25, 6, 'PM', fill=True, align='C')
        self.cell(25, 6, 'Defect', fill=True, align='C')
        self.cell(25, 6, 'Inspect', fill=True, align='C')
        self.cell(25, 6, 'Total', fill=True, align='C')
        self.cell(30, 6, 'Hours', fill=True, align='C')
        self.cell(60, 6, 'Team', fill=True, new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*C_TEXT)

        for idx, day in enumerate(sorted(self.plan.days, key=lambda d: d.date)):
            bg = C_LIGHT if idx % 2 == 0 else C_WHITE
            self.set_fill_color(*bg)
            self.set_font('Helvetica', '', 8)

            all_jobs = list(day.jobs)
            day_pm = sum(1 for j in all_jobs if j.job_type == 'pm')
            day_def = sum(1 for j in all_jobs if j.job_type == 'defect')
            day_insp = sum(1 for j in all_jobs if j.job_type == 'inspection')
            day_hours = sum(j.estimated_hours or 0 for j in all_jobs)
            day_team = set()
            for j in all_jobs:
                for a in (j.assignments or []):
                    if a.user and a.user.full_name:
                        day_team.add(a.user.full_name.split()[0])

            self.cell(50, 5, '  %s' % day.date.strftime('%A, %d %b'), fill=True)
            self.cell(25, 5, str(day_pm), fill=True, align='C')
            self.cell(25, 5, str(day_def), fill=True, align='C')
            self.cell(25, 5, str(day_insp), fill=True, align='C')
            self.set_font('Helvetica', 'B', 8)
            self.cell(25, 5, str(len(all_jobs)), fill=True, align='C')
            self.cell(30, 5, '%.1fh' % day_hours, fill=True, align='C')
            self.set_font('Helvetica', '', 7)
            self.cell(60, 5, self._safe(', '.join(sorted(day_team)), 35), fill=True, new_x='LMARGIN', new_y='NEXT')

        self.ln(6)

        # Team roster
        users_by_role = {}
        for day in self.plan.days:
            for job in day.jobs:
                for a in (job.assignments or []):
                    if a.user:
                        role = a.user.role or 'other'
                        if role not in users_by_role:
                            users_by_role[role] = set()
                        users_by_role[role].add(a.user.full_name or 'Unknown')

        if users_by_role:
            self.set_font('Helvetica', 'B', 10)
            self.cell(0, 7, 'Team Roster', new_x='LMARGIN', new_y='NEXT')
            self.ln(1)
            self.set_font('Helvetica', '', 8)
            for role, users in sorted(users_by_role.items()):
                self.set_font('Helvetica', 'B', 8)
                self.set_text_color(*C_ACCENT)
                self.cell(35, 5, '  %s:' % role.replace('_', ' ').title())
                self.set_font('Helvetica', '', 8)
                self.set_text_color(*C_TEXT)
                self.cell(0, 5, ', '.join(sorted(users)), new_x='LMARGIN', new_y='NEXT')


class WorkPlanPDFService:
    """Service for generating work plan PDFs."""

    @staticmethod
    def generate_plan_pdf(plan, language='en', by_berth=True):
        """Generate a PDF for a work plan. One page per day + summary."""
        try:
            pdf = WorkPlanPDF(plan, language)

            # One page per day
            for day in sorted(plan.days, key=lambda d: d.date):
                pdf.add_day_page(day)

            # Summary page
            pdf.add_summary_page()

            # Cleanup photo cache
            pdf._cleanup_photos()

            # Save to temp file
            temp_dir = tempfile.gettempdir()
            filename = 'work_plan_%d_%s.pdf' % (plan.id, plan.week_start.strftime('%Y%m%d'))
            temp_path = os.path.join(temp_dir, filename)
            pdf.output(temp_path)

            # Upload to Cloudinary
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
            pdf._cleanup_photos()

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
