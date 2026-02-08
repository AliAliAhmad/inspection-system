"""
Work Plan PDF Service.
Generates professional PDF reports for weekly work plans.
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

    def header(self):
        """Add header to each page."""
        # Company name
        self.set_font('Helvetica', 'B', 16)
        self.cell(0, 10, 'Industrial Inspection System', align='C', new_x='LMARGIN', new_y='NEXT')

        # Report title
        self.set_font('Helvetica', 'B', 14)
        week_str = f"Week: {self.plan.week_start.strftime('%d %b')} - {self.plan.week_end.strftime('%d %b %Y')}"
        self.cell(0, 8, f'Weekly Work Plan - {week_str}', align='C', new_x='LMARGIN', new_y='NEXT')

        # Line separator
        self.set_draw_color(0, 0, 0)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        """Add footer to each page."""
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128)
        self.cell(0, 10, f'Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")} | Page {self.page_no()}', align='C')

    def add_day_section(self, day):
        """Add a day section to the report."""
        # Day header
        self.set_font('Helvetica', 'B', 12)
        self.set_fill_color(240, 240, 240)
        day_name = day.date.strftime('%A, %B %d, %Y')
        self.cell(0, 8, day_name, fill=True, new_x='LMARGIN', new_y='NEXT')
        self.ln(2)

        if not day.jobs:
            self.set_font('Helvetica', 'I', 10)
            self.set_text_color(128)
            self.cell(0, 6, 'No jobs scheduled', new_x='LMARGIN', new_y='NEXT')
            self.set_text_color(0)
            self.ln(3)
            return

        # Jobs table header
        self.set_font('Helvetica', 'B', 9)
        self.set_fill_color(200, 200, 200)

        col_widths = [15, 40, 25, 25, 50, 35]  # Type, Equipment, Berth, Hours, Team, Materials

        self.cell(col_widths[0], 6, 'Type', border=1, fill=True)
        self.cell(col_widths[1], 6, 'Equipment', border=1, fill=True)
        self.cell(col_widths[2], 6, 'Berth', border=1, fill=True)
        self.cell(col_widths[3], 6, 'Hours', border=1, fill=True)
        self.cell(col_widths[4], 6, 'Assigned Team', border=1, fill=True)
        self.cell(col_widths[5], 6, 'Materials', border=1, fill=True, new_x='LMARGIN', new_y='NEXT')

        # Job rows
        self.set_font('Helvetica', '', 8)
        for job in day.jobs:
            # Check for page break
            if self.get_y() > 260:
                self.add_page()
                self.set_font('Helvetica', '', 8)

            # Get job details
            job_type = job.job_type.upper()
            equipment_name = job.equipment.name if job.equipment else '-'
            berth = (job.berth or 'both').title()
            hours = f"{job.estimated_hours:.1f}h"

            # Team members
            team_list = []
            for a in job.assignments:
                name = a.user.full_name if a.user else 'Unknown'
                if a.is_lead:
                    name = f"*{name}"
                team_list.append(name)
            team = ', '.join(team_list[:3])
            if len(team_list) > 3:
                team += f' +{len(team_list) - 3}'

            # Materials
            mat_list = [f"{m.material.code}({m.quantity})" for m in job.materials[:2] if m.material]
            materials = ', '.join(mat_list)
            if len(job.materials) > 2:
                materials += f' +{len(job.materials) - 2}'

            # Priority color
            if job.priority == 'urgent':
                self.set_fill_color(255, 200, 200)
                fill = True
            elif job.priority == 'high':
                self.set_fill_color(255, 230, 200)
                fill = True
            else:
                fill = False

            self.cell(col_widths[0], 5, job_type, border=1, fill=fill)
            self.cell(col_widths[1], 5, equipment_name[:20], border=1, fill=fill)
            self.cell(col_widths[2], 5, berth, border=1, fill=fill)
            self.cell(col_widths[3], 5, hours, border=1, fill=fill)
            self.cell(col_widths[4], 5, team[:25], border=1, fill=fill)
            self.cell(col_widths[5], 5, materials[:18], border=1, fill=fill, new_x='LMARGIN', new_y='NEXT')

            # Reset fill color
            self.set_fill_color(255, 255, 255)

        self.ln(5)

    def add_summary(self):
        """Add summary section at the end."""
        self.add_page()
        self.set_font('Helvetica', 'B', 12)
        self.cell(0, 8, 'Weekly Summary', new_x='LMARGIN', new_y='NEXT')
        self.ln(2)

        # Statistics
        total_jobs = self.plan.get_total_jobs()
        total_hours = sum(sum(j.estimated_hours or 0 for j in d.jobs) for d in self.plan.days)

        # Count by type
        pm_count = sum(sum(1 for j in d.jobs if j.job_type == 'pm') for d in self.plan.days)
        defect_count = sum(sum(1 for j in d.jobs if j.job_type == 'defect') for d in self.plan.days)
        inspection_count = sum(sum(1 for j in d.jobs if j.job_type == 'inspection') for d in self.plan.days)

        # All assigned users
        all_users = set()
        for day in self.plan.days:
            for job in day.jobs:
                for a in job.assignments:
                    if a.user:
                        all_users.add(a.user.full_name)

        self.set_font('Helvetica', '', 10)
        self.cell(0, 6, f'Total Jobs: {total_jobs}', new_x='LMARGIN', new_y='NEXT')
        self.cell(0, 6, f'Total Estimated Hours: {total_hours:.1f}', new_x='LMARGIN', new_y='NEXT')
        self.cell(0, 6, f'PM Jobs: {pm_count}', new_x='LMARGIN', new_y='NEXT')
        self.cell(0, 6, f'Defect Repairs: {defect_count}', new_x='LMARGIN', new_y='NEXT')
        self.cell(0, 6, f'Inspections: {inspection_count}', new_x='LMARGIN', new_y='NEXT')
        self.cell(0, 6, f'Team Members Assigned: {len(all_users)}', new_x='LMARGIN', new_y='NEXT')

        self.ln(5)

        # Team list
        if all_users:
            self.set_font('Helvetica', 'B', 10)
            self.cell(0, 6, 'Assigned Team Members:', new_x='LMARGIN', new_y='NEXT')
            self.set_font('Helvetica', '', 9)
            for name in sorted(all_users):
                self.cell(0, 5, f'  - {name}', new_x='LMARGIN', new_y='NEXT')


class WorkPlanPDFService:
    """Service for generating work plan PDFs."""

    @staticmethod
    def generate_plan_pdf(plan, language='en'):
        """
        Generate a PDF for a work plan.

        Args:
            plan: WorkPlan instance
            language: Language for the report

        Returns:
            File instance if successful, None otherwise
        """
        try:
            pdf = WorkPlanPDF(plan, language)
            pdf.add_page()

            # Add each day
            for day in plan.days:
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
            return None
