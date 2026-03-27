"""
Work Plan PDF Service.
Generates professional PDF reports for weekly work plans.
Layout: one page per day, landscape, berth-separated, with job details.
"""

from fpdf import FPDF
from datetime import datetime
import os
import tempfile
import requests
from flask import current_app


# Color palette
C_PRIMARY = (41, 98, 155)       # Dark blue
C_ACCENT = (52, 152, 219)       # Blue
C_EAST = (39, 174, 96)          # Green
C_WEST = (142, 68, 173)         # Purple
C_PM = (41, 128, 185)           # Blue
C_DEFECT = (192, 57, 43)        # Red
C_INSPECTION = (127, 140, 141)  # Grey
C_WHITE = (255, 255, 255)
C_LIGHT = (245, 247, 250)       # Light background
C_BORDER = (220, 220, 220)      # Light border
C_TEXT = (44, 62, 80)           # Dark text
C_MUTED = (149, 165, 166)       # Muted text
C_WARNING = (243, 156, 18)      # Orange
C_DANGER = (231, 76, 60)        # Red


class WorkPlanPDF(FPDF):
    """Custom landscape PDF for work plan reports."""

    def __init__(self, plan, language='en'):
        super().__init__(orientation='L', format='A4')
        self.plan = plan
        self.language = language
        self.set_auto_page_break(auto=True, margin=12)
        self.current_day_label = ''

    def header(self):
        # Thin accent bar at top
        self.set_fill_color(*C_PRIMARY)
        self.rect(0, 0, 297, 3, 'F')

        # Company + week info
        self.set_y(5)
        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(*C_PRIMARY)
        self.cell(100, 5, 'WORK PLAN', new_x='RIGHT')

        self.set_font('Helvetica', '', 9)
        self.set_text_color(*C_MUTED)
        week_str = '%s - %s' % (
            self.plan.week_start.strftime('%d %b'),
            self.plan.week_end.strftime('%d %b %Y')
        )
        self.cell(0, 5, week_str, align='R', new_x='LMARGIN', new_y='NEXT')

        # Day label if set
        if self.current_day_label:
            self.set_font('Helvetica', 'B', 13)
            self.set_text_color(*C_TEXT)
            self.cell(0, 7, self.current_day_label, align='C', new_x='LMARGIN', new_y='NEXT')

        # Separator line
        self.set_draw_color(*C_BORDER)
        self.line(10, self.get_y() + 1, 287, self.get_y() + 1)
        self.ln(4)

    def footer(self):
        self.set_y(-10)
        self.set_font('Helvetica', 'I', 7)
        self.set_text_color(*C_MUTED)
        self.cell(0, 4, 'Generated %s' % datetime.utcnow().strftime('%d %b %Y %H:%M UTC'), align='L')
        self.set_x(-30)
        self.cell(0, 4, 'Page %d' % self.page_no(), align='R')

    def _safe(self, text, max_len=0):
        """Ensure text is ASCII-safe and optionally truncated."""
        if text is None:
            return ''
        s = str(text)
        # Remove non-latin1 characters
        s = s.encode('latin-1', errors='replace').decode('latin-1')
        if max_len and len(s) > max_len:
            return s[:max_len - 2] + '..'
        return s

    def _berth_header(self, label, color):
        """Draw a berth section header."""
        self.set_fill_color(*color)
        self.set_text_color(*C_WHITE)
        self.set_font('Helvetica', 'B', 9)
        self.cell(0, 6, '  ' + label, fill=True, new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(*C_TEXT)
        self.ln(2)

    def _table_header(self, cols):
        """Draw table column headers."""
        self.set_fill_color(*C_LIGHT)
        self.set_font('Helvetica', 'B', 7)
        self.set_text_color(*C_MUTED)
        for width, label, align in cols:
            self.cell(width, 5, label, border=0, fill=True, align=align)
        self.ln()
        self.set_text_color(*C_TEXT)

    def add_day_page(self, day):
        """Add a full page for one day with East and West berth sections."""
        self.current_day_label = day.date.strftime('%A, %d %B %Y')
        self.add_page()

        all_jobs = list(day.jobs) if day.jobs else []
        east_jobs = sorted(
            [j for j in all_jobs if getattr(j, 'berth', '') in ('east', 'both')],
            key=lambda j: (0 if j.job_type == 'pm' else 1 if j.job_type == 'defect' else 2, j.position)
        )
        west_jobs = sorted(
            [j for j in all_jobs if getattr(j, 'berth', '') in ('west', 'both')],
            key=lambda j: (0 if j.job_type == 'pm' else 1 if j.job_type == 'defect' else 2, j.position)
        )

        # East berth
        self._berth_header('EAST BERTH', C_EAST)
        self._render_job_list(east_jobs)

        self.ln(4)

        # West berth
        self._berth_header('WEST BERTH', C_WEST)
        self._render_job_list(west_jobs)

    def _render_job_list(self, jobs):
        """Render a list of jobs, separating inspection (compact) from PM/defect (detailed)."""
        if not jobs:
            self.set_font('Helvetica', 'I', 8)
            self.set_text_color(*C_MUTED)
            self.cell(0, 5, 'No jobs scheduled', new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*C_TEXT)
            return

        inspections = [j for j in jobs if j.job_type == 'inspection']
        pm_defect = [j for j in jobs if j.job_type != 'inspection']

        # ---- PM & Defect Jobs (detailed) ----
        if pm_defect:
            cols = [
                (12, 'TYPE', 'C'),
                (50, 'EQUIPMENT', 'L'),
                (70, 'DESCRIPTION', 'L'),
                (25, 'SAP #', 'C'),
                (12, 'HRS', 'C'),
                (55, 'TEAM', 'L'),
                (50, 'MATERIALS', 'L'),
            ]
            self._table_header(cols)

            self.set_font('Helvetica', '', 7)
            for idx, job in enumerate(pm_defect):
                if self.get_y() > 185:
                    self.add_page()
                    self._table_header(cols)
                    self.set_font('Helvetica', '', 7)

                # Alternate row bg
                if idx % 2 == 0:
                    self.set_fill_color(*C_LIGHT)
                else:
                    self.set_fill_color(*C_WHITE)

                # Type badge color
                if job.job_type == 'pm':
                    type_label = 'PM'
                elif job.job_type == 'defect':
                    type_label = 'DEF'
                else:
                    type_label = job.job_type[:3].upper()

                # Equipment
                eq_name = ''
                if job.equipment:
                    eq_name = job.equipment.name or job.equipment.serial_number or ''

                # Description
                desc = job.description or ''
                if not desc and job.defect:
                    desc = job.defect.description or ''

                # SAP
                sap = job.sap_order_number or '-'

                # Hours
                hours = '%.1fh' % (job.estimated_hours or 0)

                # Team
                team_parts = []
                for a in (job.assignments or []):
                    name = a.user.full_name.split()[0] if a.user and a.user.full_name else '?'
                    if a.is_lead:
                        name = '*' + name
                    team_parts.append(name)
                team = ', '.join(team_parts) if team_parts else '-'

                # Materials
                mat_parts = []
                for wpm in (job.materials or []):
                    if wpm.material:
                        mat_parts.append('%s x%.0f' % (self._safe(wpm.material.code, 12), wpm.quantity))
                materials = ', '.join(mat_parts[:3])
                if len(mat_parts) > 3:
                    materials += ' +%d more' % (len(mat_parts) - 3)

                fill = idx % 2 == 0

                # Highlight row for overdue or missing SAP
                is_overdue = job.overdue_value and job.overdue_value > 0
                if not job.sap_order_number and job.job_type == 'pm':
                    self.set_fill_color(255, 235, 235)
                    fill = True
                elif is_overdue:
                    self.set_fill_color(255, 243, 224)
                    fill = True

                self.cell(12, 5, type_label, border=0, fill=fill, align='C')
                self.cell(50, 5, self._safe(eq_name, 28), border=0, fill=fill)
                self.cell(70, 5, self._safe(desc, 42), border=0, fill=fill)
                self.cell(25, 5, self._safe(sap, 12), border=0, fill=fill, align='C')
                self.cell(12, 5, hours, border=0, fill=fill, align='C')
                self.cell(55, 5, self._safe(team, 30), border=0, fill=fill)
                self.cell(50, 5, self._safe(materials, 28), border=0, fill=fill, new_x='LMARGIN', new_y='NEXT')

                # Reset fill
                self.set_fill_color(*C_WHITE)

            self.ln(2)

        # ---- Inspections (compact list) ----
        if inspections:
            self.set_font('Helvetica', 'B', 7)
            self.set_text_color(*C_INSPECTION)
            self.cell(0, 4, 'INSPECTIONS (%d)' % len(inspections), new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(*C_TEXT)
            self.set_font('Helvetica', '', 6)

            # Compact: 3 inspections per row
            row_items = []
            for j in inspections:
                eq = j.equipment.serial_number if j.equipment and j.equipment.serial_number else (j.equipment.name[:15] if j.equipment else '?')
                team = ', '.join(
                    a.user.full_name.split()[0] for a in (j.assignments or []) if a.user
                ) or '-'
                row_items.append('%s [%s]' % (self._safe(eq, 15), self._safe(team, 12)))

            # Print in compact rows of ~4 items
            line = ''
            for i, item in enumerate(row_items):
                if line:
                    line += '   |   '
                line += item
                if (i + 1) % 4 == 0:
                    self.cell(0, 3.5, line, new_x='LMARGIN', new_y='NEXT')
                    line = ''
            if line:
                self.cell(0, 3.5, line, new_x='LMARGIN', new_y='NEXT')

    def add_summary_page(self):
        """Add a summary page at the end."""
        self.current_day_label = 'WEEKLY SUMMARY'
        self.add_page()

        total_jobs = sum(len(list(d.jobs)) for d in self.plan.days)
        total_hours = sum(sum(j.estimated_hours or 0 for j in d.jobs) for d in self.plan.days)
        pm_count = sum(sum(1 for j in d.jobs if j.job_type == 'pm') for d in self.plan.days)
        defect_count = sum(sum(1 for j in d.jobs if j.job_type == 'defect') for d in self.plan.days)
        inspection_count = sum(sum(1 for j in d.jobs if j.job_type == 'inspection') for d in self.plan.days)

        # Stats grid
        self.set_font('Helvetica', 'B', 20)
        self.set_text_color(*C_PRIMARY)
        self.cell(60, 12, str(total_jobs), align='C')
        self.cell(60, 12, '%.0fh' % total_hours, align='C')
        self.cell(60, 12, str(pm_count), align='C')
        self.cell(60, 12, str(defect_count), align='C', new_x='LMARGIN', new_y='NEXT')

        self.set_font('Helvetica', '', 8)
        self.set_text_color(*C_MUTED)
        self.cell(60, 5, 'Total Jobs', align='C')
        self.cell(60, 5, 'Total Hours', align='C')
        self.cell(60, 5, 'PM Jobs', align='C')
        self.cell(60, 5, 'Defect Repairs', align='C', new_x='LMARGIN', new_y='NEXT')
        self.ln(8)

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

        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(*C_TEXT)
        self.cell(0, 6, 'Team Roster', new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

        self.set_font('Helvetica', '', 8)
        for role, users in sorted(users_by_role.items()):
            self.set_font('Helvetica', 'B', 8)
            self.cell(30, 5, role.title() + ':', new_x='RIGHT')
            self.set_font('Helvetica', '', 8)
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
