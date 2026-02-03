"""
PDF Report Generation Service for Inspections.
Generates professional PDF reports with equipment info, checklist answers, photos, and findings.
"""

import io
import logging
import tempfile
import requests
from datetime import datetime
from fpdf import FPDF

logger = logging.getLogger(__name__)


class InspectionReportPDF(FPDF):
    """Custom PDF class for inspection reports."""

    def __init__(self, inspection, language='en'):
        super().__init__()
        self.inspection = inspection
        self.language = language
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        """Page header with company name and report title."""
        self.set_font('Helvetica', 'B', 16)
        self.cell(0, 10, 'Inspection Report', align='C', ln=True)
        self.set_font('Helvetica', '', 10)
        self.set_text_color(128, 128, 128)
        code = self.inspection.get('inspection_code') or f"INS-{self.inspection.get('id', 'N/A')}"
        self.cell(0, 6, f"Report #{code}", align='C', ln=True)
        self.set_text_color(0, 0, 0)
        self.ln(5)
        # Line separator
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        """Page footer with page number and generation date."""
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}} | Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}', align='C')

    def section_title(self, title):
        """Add a section title."""
        self.set_font('Helvetica', 'B', 12)
        self.set_fill_color(240, 240, 240)
        self.cell(0, 8, f'  {title}', fill=True, ln=True)
        self.ln(3)

    def key_value(self, key, value, indent=0):
        """Add a key-value pair."""
        self.set_font('Helvetica', 'B', 10)
        self.set_x(10 + indent)
        self.cell(45, 6, f'{key}:')
        self.set_font('Helvetica', '', 10)
        # Handle long values
        value_str = str(value) if value else '-'
        self.multi_cell(0, 6, value_str)

    def add_status_badge(self, status, result=None):
        """Add colored status badge."""
        self.set_font('Helvetica', 'B', 10)

        # Status colors
        colors = {
            'draft': (150, 150, 150),
            'submitted': (33, 150, 243),
            'reviewed': (76, 175, 80),
            'pass': (76, 175, 80),
            'fail': (244, 67, 54),
            'incomplete': (255, 152, 0),
        }

        if status:
            color = colors.get(status.lower(), (150, 150, 150))
            self.set_text_color(*color)
            self.cell(30, 6, status.upper())

        if result:
            color = colors.get(result.lower(), (150, 150, 150))
            self.set_text_color(*color)
            self.cell(30, 6, f'  [{result.upper()}]')

        self.set_text_color(0, 0, 0)
        self.ln()


def generate_inspection_report(inspection_data, language='en'):
    """
    Generate a PDF report for an inspection.

    Args:
        inspection_data: Dictionary with inspection details including:
            - id, inspection_code, status, result
            - equipment: {name, equipment_type, location, berth}
            - technician: {full_name}
            - started_at, submitted_at, reviewed_at
            - answers: [{checklist_item, answer_value, comment, photo_file, video_file, voice_note}]
        language: 'en' or 'ar'

    Returns:
        BytesIO object containing the PDF
    """
    pdf = InspectionReportPDF(inspection_data, language)
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- Equipment Information ---
    pdf.section_title('Equipment Information')
    equipment = inspection_data.get('equipment') or {}
    pdf.key_value('Equipment Name', equipment.get('name') or f"ID: {inspection_data.get('equipment_id')}")
    pdf.key_value('Equipment Type', equipment.get('equipment_type'))
    pdf.key_value('Location', equipment.get('location'))
    pdf.key_value('Berth', equipment.get('berth'))
    pdf.key_value('Serial Number', equipment.get('serial_number'))
    pdf.ln(5)

    # --- Inspection Details ---
    pdf.section_title('Inspection Details')
    technician = inspection_data.get('technician') or {}
    pdf.key_value('Inspector', technician.get('full_name') or f"ID: {inspection_data.get('technician_id')}")
    pdf.key_value('Started', _format_date(inspection_data.get('started_at')))
    pdf.key_value('Submitted', _format_date(inspection_data.get('submitted_at')))
    pdf.key_value('Reviewed', _format_date(inspection_data.get('reviewed_at')))

    # Status with badge
    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(45, 6, 'Status:')
    pdf.add_status_badge(inspection_data.get('status'), inspection_data.get('result'))

    if inspection_data.get('notes'):
        pdf.key_value('Review Notes', inspection_data.get('notes'))
    pdf.ln(5)

    # --- Checklist Answers ---
    answers = inspection_data.get('answers') or []
    if answers:
        pdf.section_title(f'Checklist Answers ({len(answers)} items)')

        # Summary counts
        pass_count = sum(1 for a in answers if a.get('answer_value', '').lower() in ('pass', 'yes'))
        fail_count = sum(1 for a in answers if a.get('answer_value', '').lower() in ('fail', 'no'))

        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(76, 175, 80)
        pdf.cell(40, 6, f'Passed: {pass_count}')
        pdf.set_text_color(244, 67, 54)
        pdf.cell(40, 6, f'Failed: {fail_count}')
        pdf.set_text_color(0, 0, 0)
        pdf.ln(8)

        # Individual answers
        for i, answer in enumerate(answers, 1):
            _add_answer_to_pdf(pdf, answer, i, language)

    # --- Generate PDF bytes ---
    pdf_bytes = io.BytesIO()
    pdf.output(pdf_bytes)
    pdf_bytes.seek(0)

    return pdf_bytes


def _add_answer_to_pdf(pdf, answer, index, language='en'):
    """Add a single answer to the PDF."""
    checklist_item = answer.get('checklist_item') or {}

    # Question text
    if language == 'ar' and checklist_item.get('question_text_ar'):
        question = checklist_item.get('question_text_ar')
    else:
        question = checklist_item.get('question_text') or f"Question #{answer.get('checklist_item_id')}"

    # Answer value with color
    answer_value = answer.get('answer_value', '-')
    is_fail = answer_value.lower() in ('fail', 'no')
    is_pass = answer_value.lower() in ('pass', 'yes')

    # Question box
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(250, 250, 250)

    # Check if we need a new page
    if pdf.get_y() > 240:
        pdf.add_page()

    pdf.cell(10, 7, f'{index}.', fill=True)
    pdf.set_font('Helvetica', '', 10)

    # Question text (may wrap)
    start_y = pdf.get_y()
    pdf.set_x(20)
    pdf.multi_cell(140, 7, question, fill=True)
    end_y = pdf.get_y()

    # Answer value badge on the right
    pdf.set_y(start_y)
    pdf.set_x(165)
    if is_fail:
        pdf.set_fill_color(255, 235, 238)
        pdf.set_text_color(198, 40, 40)
    elif is_pass:
        pdf.set_fill_color(232, 245, 233)
        pdf.set_text_color(46, 125, 50)
    else:
        pdf.set_fill_color(240, 240, 240)
        pdf.set_text_color(0, 0, 0)

    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(35, 7, answer_value.upper(), fill=True, align='C')
    pdf.set_text_color(0, 0, 0)
    pdf.set_fill_color(255, 255, 255)

    pdf.set_y(max(end_y, start_y + 7))

    # Category and critical badges
    category = checklist_item.get('category')
    critical = checklist_item.get('critical_failure')
    if category or critical:
        pdf.set_x(20)
        pdf.set_font('Helvetica', 'I', 8)
        pdf.set_text_color(100, 100, 100)
        badges = []
        if category:
            badges.append(f'[{category.upper()}]')
        if critical:
            badges.append('[CRITICAL]')
        pdf.cell(0, 5, ' '.join(badges), ln=True)
        pdf.set_text_color(0, 0, 0)

    # Comment
    comment = answer.get('comment')
    if comment:
        pdf.set_x(20)
        pdf.set_font('Helvetica', 'I', 9)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 5, f'Comment: {comment}')
        pdf.set_text_color(0, 0, 0)

    # Voice transcription
    voice_note = answer.get('voice_note')
    if voice_note:
        pdf.set_x(20)
        pdf.set_font('Helvetica', 'I', 9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 5, '[Voice note attached]', ln=True)
        pdf.set_text_color(0, 0, 0)

    # Photo
    photo_file = answer.get('photo_file')
    if photo_file and photo_file.get('url'):
        _add_image_to_pdf(pdf, photo_file.get('url'), 'Photo')

    # Video thumbnail
    video_file = answer.get('video_file')
    if video_file and video_file.get('url'):
        pdf.set_x(20)
        pdf.set_font('Helvetica', 'I', 9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 5, '[Video attached]', ln=True)
        pdf.set_text_color(0, 0, 0)

    pdf.ln(3)


def _add_image_to_pdf(pdf, url, label='Image'):
    """Download and add an image to the PDF."""
    try:
        # Check if we need a new page for the image
        if pdf.get_y() > 200:
            pdf.add_page()

        # Download image to temp file
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name

        # Add image to PDF
        pdf.set_x(20)
        pdf.image(tmp_path, x=20, y=pdf.get_y(), w=80)
        pdf.ln(55)  # Space for image

        # Cleanup
        import os
        os.unlink(tmp_path)

    except Exception as e:
        logger.warning(f"Failed to add image to PDF: {e}")
        pdf.set_x(20)
        pdf.set_font('Helvetica', 'I', 9)
        pdf.set_text_color(200, 100, 100)
        pdf.cell(0, 5, f'[{label} could not be loaded]', ln=True)
        pdf.set_text_color(0, 0, 0)


def _format_date(date_str):
    """Format ISO date string to readable format."""
    if not date_str:
        return '-'
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d %H:%M')
    except:
        return date_str
