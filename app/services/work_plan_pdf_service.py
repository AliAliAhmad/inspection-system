"""
Work Plan PDF Service.
Generates professional PDF reports for weekly work plans.
Enhanced with berth separation, overdue indicators, and SAP order highlighting.
"""

from fpdf import FPDF
from datetime import datetime
import os
import tempfile
from flask import current_app


class WorkPlanPDF(FPDF):
    """Custom PDF class for work plan reports."""

    def __init__(self, plan, language='en'):
        super().__init__()
        self.plan = plan
        self.language = language
        self.set_auto_page_break(auto=True, margin=15)

        # Colors
        self.COLORS = {
            'header_bg': (41, 128, 185),  # Blue header
            'header_text': (255, 255, 255),
            'day_header_bg': (52, 73, 94),  # Dark blue-grey
            'day_header_text': (255, 255, 255),
            'berth_east': (46, 204, 113),  # Green
            'berth_west': (155, 89, 182),  # Purple
            'table_header': (189, 195, 199),  # Light grey
            'no_sap_order': (255, 200, 200),  # Light red - CRITICAL
            'overdue_critical': (255, 150, 150),  # Red
            'overdue_high': (255, 220, 180),  # Orange
            'row_alt': (245, 245, 245),  # Alternating row
        }

    def header(self):
        """Add header to each page."""
        # Header background
        self.set_fill_color(*self.COLORS['header_bg'])
        self.rect(0, 0, 210, 25, 'F')

        # Company name
        self.set_text_color(*self.COLORS['header_text'])
        self.set_font('Helvetica', 'B', 16)
        self.set_y(5)
        self.cell(0, 8, 'Industrial Inspection System', align='C', new_x='LMARGIN', new_y='NEXT')

        # Report title with week range
        self.set_font('Helvetica', 'B', 12)
        week_str = f"Weekly Work Plan: {self.plan.week_start.strftime('%d %b')} - {self.plan.week_end.strftime('%d %b %Y')}"
        self.cell(0, 7, week_str, align='C', new_x='LMARGIN', new_y='NEXT')

        self.set_text_color(0, 0, 0)
        self.ln(5)

    def footer(self):
        """Add footer to each page."""
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128)

        # Add legend in footer
        legend = "Legend: * = Lead | [!] = No SAP Order | [O] = Overdue"
        self.cell(0, 5, legend, align='L')
        self.set_x(-50)
        self.cell(0, 5, f'Page {self.page_no()}', align='R')

    def add_day_section(self, day, berth_filter=None):
        """
        Add a day section to the report.

        Args:
            day: WorkPlanDay instance
            berth_filter: Optional 'east' or 'west' to filter jobs
        """
        # Get jobs based on berth filter
        if berth_filter == 'east':
            jobs = list(day.jobs_east) + list(day.jobs_both)
            berth_color = self.COLORS['berth_east']
            berth_label = 'EAST BERTH'
        elif berth_filter == 'west':
            jobs = list(day.jobs_west) + list(day.jobs_both)
            berth_color = self.COLORS['berth_west']
            berth_label = 'WEST BERTH'
        else:
            jobs = list(day.jobs)
            berth_color = self.COLORS['day_header_bg']
            berth_label = None

        # Sort jobs by position
        jobs = sorted(jobs, key=lambda j: j.position)

        # Day header with berth indicator
        self.set_font('Helvetica', 'B', 11)
        self.set_fill_color(*self.COLORS['day_header_bg'])
        self.set_text_color(*self.COLORS['day_header_text'])

        day_name = day.date.strftime('%A, %d %B %Y')
        header_text = f"{day_name}"
        if berth_label:
            header_text = f"{day_name} - {berth_label}"

        self.cell(0, 8, header_text, fill=True, new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(0, 0, 0)
        self.ln(1)

        if not jobs:
            self.set_font('Helvetica', 'I', 10)
            self.set_text_color(128)
            self.cell(0, 6, 'No jobs scheduled', new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(0)
            self.ln(3)
            return

        # Jobs table header
        self.set_font('Helvetica', 'B', 8)
        self.set_fill_color(*self.COLORS['table_header'])

        # Column widths: Type, SAP Order, Equipment, Hours, Status, Team
        col_widths = [12, 28, 45, 15, 25, 65]

        self.cell(col_widths[0], 5, 'Type', border=1, fill=True, align='C')
        self.cell(col_widths[1], 5, 'SAP Order', border=1, fill=True, align='C')
        self.cell(col_widths[2], 5, 'Equipment', border=1, fill=True, align='C')
        self.cell(col_widths[3], 5, 'Hours', border=1, fill=True, align='C')
        self.cell(col_widths[4], 5, 'Status', border=1, fill=True, align='C')
        self.cell(col_widths[5], 5, 'Assigned Team', border=1, fill=True, align='C', new_x='LMARGIN', new_y='NEXT')

        # Job rows
        self.set_font('Helvetica', '', 7)
        for idx, job in enumerate(jobs):
            # Check for page break
            if self.get_y() > 265:
                self.add_page()
                self.set_font('Helvetica', '', 7)

            # Determine row color based on priority and SAP order
            has_sap_order = bool(job.sap_order_number)
            is_overdue = job.overdue_value and job.overdue_value > 0
            computed_priority = getattr(job, 'computed_priority', 'normal')

            # Priority: No SAP Order > Critical > High > Normal
            if not has_sap_order:
                self.set_fill_color(*self.COLORS['no_sap_order'])
                fill = True
            elif computed_priority == 'critical':
                self.set_fill_color(*self.COLORS['overdue_critical'])
                fill = True
            elif computed_priority == 'high' or is_overdue:
                self.set_fill_color(*self.COLORS['overdue_high'])
                fill = True
            elif idx % 2 == 0:
                self.set_fill_color(*self.COLORS['row_alt'])
                fill = True
            else:
                fill = False

            # Job type with emoji indicator
            job_type_display = {
                'pm': 'PM',
                'defect': 'DEF',
                'inspection': 'INS'
            }.get(job.job_type, job.job_type.upper()[:3])

            # SAP Order (with warning if missing)
            sap_order = job.sap_order_number if has_sap_order else '[!] MISSING'

            # Equipment name
            equipment_name = ''
            if job.equipment:
                equipment_name = job.equipment.serial_number or job.equipment.name or ''
            equipment_name = equipment_name[:22]

            # Hours
            hours = f"{job.estimated_hours:.1f}h"

            # Status indicator
            status_parts = []
            if is_overdue:
                overdue_text = f"{int(job.overdue_value)}{job.overdue_unit[0] if job.overdue_unit else 'h'}"
                status_parts.append(f"[O]{overdue_text}")
            if computed_priority == 'critical':
                status_parts.append('CRIT')
            elif computed_priority == 'high':
                status_parts.append('HIGH')
            status = ' '.join(status_parts) if status_parts else 'OK'

            # Team members (lead marked with *)
            team_list = []
            for a in job.assignments:
                name = a.user.full_name.split()[0] if a.user else 'Unknown'
                if a.is_lead:
                    name = f"*{name}"
                team_list.append(name)
            team = ', '.join(team_list) if team_list else '-'
            if len(team) > 32:
                team = team[:29] + '...'

            # Render row
            self.cell(col_widths[0], 5, job_type_display, border=1, fill=fill, align='C')

            # SAP Order - bold red if missing
            if not has_sap_order:
                self.set_font('Helvetica', 'B', 7)
                self.set_text_color(180, 0, 0)
            self.cell(col_widths[1], 5, sap_order[:14], border=1, fill=fill, align='C')
            self.set_font('Helvetica', '', 7)
            self.set_text_color(0, 0, 0)

            self.cell(col_widths[2], 5, equipment_name, border=1, fill=fill)
            self.cell(col_widths[3], 5, hours, border=1, fill=fill, align='C')
            self.cell(col_widths[4], 5, status, border=1, fill=fill, align='C')
            self.cell(col_widths[5], 5, team, border=1, fill=fill, new_x='LMARGIN', new_y='NEXT')

            # Reset fill color
            self.set_fill_color(255, 255, 255)

        self.ln(4)

    def add_summary(self):
        """Add summary section at the end."""
        self.add_page()

        # Summary header
        self.set_font('Helvetica', 'B', 14)
        self.set_fill_color(*self.COLORS['header_bg'])
        self.set_text_color(*self.COLORS['header_text'])
        self.cell(0, 10, 'Weekly Summary', fill=True, align='C', new_x='LMARGIN', new_y='NEXT')
        self.set_text_color(0, 0, 0)
        self.ln(5)

        # Statistics
        total_jobs = self.plan.get_total_jobs()
        total_hours = sum(sum(j.estimated_hours or 0 for j in d.jobs) for d in self.plan.days)

        # Count by type
        pm_count = sum(sum(1 for j in d.jobs if j.job_type == 'pm') for d in self.plan.days)
        defect_count = sum(sum(1 for j in d.jobs if j.job_type == 'defect') for d in self.plan.days)
        inspection_count = sum(sum(1 for j in d.jobs if j.job_type == 'inspection') for d in self.plan.days)

        # Count jobs without SAP orders
        no_sap_count = sum(sum(1 for j in d.jobs if not j.sap_order_number) for d in self.plan.days)

        # Count overdue jobs
        overdue_count = sum(sum(1 for j in d.jobs if j.overdue_value and j.overdue_value > 0) for d in self.plan.days)

        # All assigned users with roles
        users_by_role = {}
        for day in self.plan.days:
            for job in day.jobs:
                for a in job.assignments:
                    if a.user:
                        role = a.user.role or 'other'
                        if role not in users_by_role:
                            users_by_role[role] = set()
                        users_by_role[role].add(a.user.full_name)

        # Statistics table
        self.set_font('Helvetica', 'B', 10)
        self.cell(80, 7, 'Metric', border=1, fill=True)
        self.cell(50, 7, 'Value', border=1, fill=True, new_x='LMARGIN', new_y='NEXT')

        self.set_font('Helvetica', '', 10)
        stats = [
            ('Total Jobs', str(total_jobs)),
            ('Total Estimated Hours', f'{total_hours:.1f}h'),
            ('PM Jobs', str(pm_count)),
            ('Defect Repairs', str(defect_count)),
            ('Inspections', str(inspection_count)),
            ('Jobs Without SAP Order', f'{no_sap_count} ⚠️' if no_sap_count > 0 else '0'),
            ('Overdue Jobs', f'{overdue_count} ⚠️' if overdue_count > 0 else '0'),
            ('Team Members', str(sum(len(v) for v in users_by_role.values()))),
        ]

        for label, value in stats:
            # Highlight warnings
            if '⚠️' in value:
                self.set_fill_color(*self.COLORS['no_sap_order'])
                fill = True
            else:
                fill = False
            self.cell(80, 6, label, border=1, fill=fill)
            self.cell(50, 6, value.replace('⚠️', ''), border=1, fill=fill, new_x='LMARGIN', new_y='NEXT')

        self.ln(8)

        # Team by role
        self.set_font('Helvetica', 'B', 11)
        self.cell(0, 7, 'Assigned Team by Role:', new_x='LMARGIN', new_y='NEXT')
        self.ln(2)

        role_display = {
            'engineer': '🔧 Engineers',
            'specialist': '🔨 Specialists',
            'inspector': '🔍 Inspectors',
        }

        self.set_font('Helvetica', '', 9)
        for role, users in sorted(users_by_role.items()):
            role_label = role_display.get(role, role.title())
            self.set_font('Helvetica', 'B', 9)
            self.cell(0, 5, f'{role_label}:', new_x='LMARGIN', new_y='NEXT')
            self.set_font('Helvetica', '', 9)
            for name in sorted(users):
                self.cell(10, 4, '')
                self.cell(0, 4, f'- {name}', new_x='LMARGIN', new_y='NEXT')
            self.ln(2)


class WorkPlanPDFService:
    """Service for generating work plan PDFs."""

    @staticmethod
    def generate_plan_pdf(plan, language='en', by_berth=True):
        """
        Generate a PDF for a work plan.

        Args:
            plan: WorkPlan instance
            language: Language for the report
            by_berth: If True, generates separate sections for East/West

        Returns:
            File instance if successful, None otherwise
        """
        try:
            pdf = WorkPlanPDF(plan, language)
            pdf.add_page()

            if by_berth:
                # First: All East Berth jobs by day
                pdf.set_font('Helvetica', 'B', 14)
                pdf.set_fill_color(46, 204, 113)  # Green
                pdf.set_text_color(255, 255, 255)
                pdf.cell(0, 10, '🚢  EAST BERTH', fill=True, align='C', new_x='LMARGIN', new_y='NEXT')
                pdf.set_text_color(0, 0, 0)
                pdf.ln(3)

                for day in sorted(plan.days, key=lambda d: d.date):
                    pdf.add_day_section(day, berth_filter='east')

                # Then: All West Berth jobs by day
                pdf.add_page()
                pdf.set_font('Helvetica', 'B', 14)
                pdf.set_fill_color(155, 89, 182)  # Purple
                pdf.set_text_color(255, 255, 255)
                pdf.cell(0, 10, '⚓  WEST BERTH', fill=True, align='C', new_x='LMARGIN', new_y='NEXT')
                pdf.set_text_color(0, 0, 0)
                pdf.ln(3)

                for day in sorted(plan.days, key=lambda d: d.date):
                    pdf.add_day_section(day, berth_filter='west')
            else:
                # Combined view
                for day in sorted(plan.days, key=lambda d: d.date):
                    pdf.add_day_section(day)

            # Add summary
            pdf.add_summary()

            # Save to temp file
            temp_dir = tempfile.gettempdir()
            filename = f"work_plan_{plan.id}_{plan.week_start.strftime('%Y%m%d')}.pdf"
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

            # Clean up temp file
            os.remove(temp_path)

            return file_record

        except Exception as e:
            current_app.logger.error(f"Failed to generate work plan PDF: {e}")
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def generate_day_pdf(plan, day_date, language='en'):
        """
        Generate a PDF for a single day.

        Args:
            plan: WorkPlan instance
            day_date: Date string (YYYY-MM-DD)
            language: Language for the report

        Returns:
            File instance if successful, None otherwise
        """
        try:
            # Find the day
            target_day = None
            for day in plan.days:
                if day.date.strftime('%Y-%m-%d') == day_date:
                    target_day = day
                    break

            if not target_day:
                return None

            pdf = WorkPlanPDF(plan, language)
            pdf.add_page()

            # Single day - show both berths
            pdf.set_font('Helvetica', 'B', 12)
            pdf.cell(0, 8, f"Daily Work Plan: {target_day.date.strftime('%A, %d %B %Y')}", align='C', new_x='LMARGIN', new_y='NEXT')
            pdf.ln(3)

            # East berth section
            pdf.add_day_section(target_day, berth_filter='east')

            # West berth section
            pdf.add_day_section(target_day, berth_filter='west')

            # Save to temp file
            temp_dir = tempfile.gettempdir()
            filename = f"work_plan_{plan.id}_day_{day_date}.pdf"
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
                    related_type='work_plan_day',
                    related_id=target_day.id,
                    category='work_plan'
                )

            # Clean up temp file
            os.remove(temp_path)

            return file_record

        except Exception as e:
            current_app.logger.error(f"Failed to generate day PDF: {e}")
            import traceback
            traceback.print_exc()
            return None
