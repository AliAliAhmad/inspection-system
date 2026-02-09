"""
Equipment Report Generation Service.
Generates professional PDF reports for equipment including status history,
certifications, costs, and analytics.
"""

import io
import logging
from datetime import datetime
from fpdf import FPDF

logger = logging.getLogger(__name__)


class EquipmentReportPDF(FPDF):
    """Custom PDF class for equipment reports."""

    def __init__(self, equipment, language='en'):
        super().__init__()
        self.equipment = equipment
        self.language = language
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        """Page header with company name and report title."""
        self.set_font('Helvetica', 'B', 16)
        self.cell(0, 10, 'Equipment Report', align='C', ln=True)
        self.set_font('Helvetica', '', 10)
        self.set_text_color(128, 128, 128)
        if self.equipment:
            self.cell(0, 6, f"{self.equipment.name} | {self.equipment.serial_number}", align='C', ln=True)
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

    def add_status_badge(self, status):
        """Add colored status badge."""
        self.set_font('Helvetica', 'B', 10)

        # Status colors
        colors = {
            'active': (76, 175, 80),
            'under_maintenance': (255, 193, 7),
            'stopped': (244, 67, 54),
            'out_of_service': (158, 158, 158),
            'paused': (255, 152, 0),
        }

        color = colors.get(status.lower() if status else 'active', (150, 150, 150))
        self.set_text_color(*color)
        self.cell(0, 6, status.upper() if status else 'UNKNOWN', ln=True)
        self.set_text_color(0, 0, 0)


def generate_equipment_report(equipment, language='en'):
    """
    Generate a detailed PDF report for a single equipment.

    Args:
        equipment: Equipment model object
        language: 'en' or 'ar'

    Returns:
        BytesIO object containing the PDF
    """
    from app.models import EquipmentStatusLog, EquipmentCertification, EquipmentNote, Defect, Inspection

    pdf = EquipmentReportPDF(equipment, language)
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- Equipment Information ---
    pdf.section_title('Equipment Information')
    pdf.key_value('Name', equipment.name)
    if equipment.name_ar:
        pdf.key_value('Name (Arabic)', equipment.name_ar)
    pdf.key_value('Equipment Type', f"{equipment.equipment_type} / {equipment.equipment_type_2}")
    pdf.key_value('Serial Number', equipment.serial_number)
    pdf.key_value('Manufacturer', equipment.manufacturer)
    pdf.key_value('Model Number', equipment.model_number)
    pdf.key_value('Capacity', equipment.capacity)
    pdf.key_value('Location', equipment.location)
    pdf.key_value('Berth', equipment.berth)
    pdf.key_value('Home Berth', equipment.home_berth)
    pdf.key_value('Installation Date', equipment.installation_date.isoformat() if equipment.installation_date else '-')
    pdf.ln(3)

    # Status with badge
    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(45, 6, 'Current Status:')
    pdf.add_status_badge(equipment.status)
    pdf.ln(5)

    # --- Cost Information ---
    if equipment.hourly_cost:
        pdf.section_title('Cost Information')
        pdf.key_value('Hourly Cost', f"${float(equipment.hourly_cost):.2f}")
        pdf.key_value('Criticality Level', equipment.criticality_level or 'Not set')
        if equipment.last_risk_score:
            pdf.key_value('Last Risk Score', f"{float(equipment.last_risk_score):.1f}/100")
        pdf.ln(5)

    # --- Status History ---
    pdf.section_title('Recent Status History')
    status_logs = EquipmentStatusLog.query.filter_by(equipment_id=equipment.id).order_by(
        EquipmentStatusLog.created_at.desc()
    ).limit(10).all()

    if status_logs:
        # Table header
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(30, 6, 'Date', border=1, fill=True)
        pdf.cell(30, 6, 'From', border=1, fill=True)
        pdf.cell(30, 6, 'To', border=1, fill=True)
        pdf.cell(50, 6, 'Reason', border=1, fill=True)
        pdf.cell(40, 6, 'Changed By', border=1, fill=True, ln=True)

        pdf.set_font('Helvetica', '', 8)
        for log in status_logs:
            pdf.cell(30, 5, log.created_at.strftime('%Y-%m-%d') if log.created_at else '-', border=1)
            pdf.cell(30, 5, log.old_status or '-', border=1)
            pdf.cell(30, 5, log.new_status or '-', border=1)
            reason = (log.reason[:30] + '...') if log.reason and len(log.reason) > 30 else (log.reason or '-')
            pdf.cell(50, 5, reason, border=1)
            pdf.cell(40, 5, log.changed_by.full_name if log.changed_by else '-', border=1, ln=True)
    else:
        pdf.set_font('Helvetica', 'I', 10)
        pdf.cell(0, 6, 'No status history available', ln=True)
    pdf.ln(5)

    # --- Certifications ---
    certs = EquipmentCertification.query.filter_by(equipment_id=equipment.id).order_by(
        EquipmentCertification.expiry_date.asc()
    ).all()

    if certs:
        pdf.section_title('Certifications')
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(60, 6, 'Certification', border=1, fill=True)
        pdf.cell(35, 6, 'Issued', border=1, fill=True)
        pdf.cell(35, 6, 'Expiry', border=1, fill=True)
        pdf.cell(35, 6, 'Status', border=1, fill=True, ln=True)

        pdf.set_font('Helvetica', '', 8)
        for cert in certs:
            pdf.cell(60, 5, cert.name[:35] if len(cert.name) > 35 else cert.name, border=1)
            pdf.cell(35, 5, cert.issued_date.isoformat() if cert.issued_date else '-', border=1)
            pdf.cell(35, 5, cert.expiry_date.isoformat() if cert.expiry_date else 'Never', border=1)
            status = cert.computed_status
            pdf.cell(35, 5, status.upper(), border=1, ln=True)
        pdf.ln(5)

    # --- Recent Defects ---
    defects = Defect.query.filter_by(equipment_id=equipment.id).order_by(
        Defect.created_at.desc()
    ).limit(10).all()

    if defects:
        pdf.section_title('Recent Defects')
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(25, 6, 'ID', border=1, fill=True)
        pdf.cell(30, 6, 'Date', border=1, fill=True)
        pdf.cell(25, 6, 'Severity', border=1, fill=True)
        pdf.cell(25, 6, 'Status', border=1, fill=True)
        pdf.cell(75, 6, 'Description', border=1, fill=True, ln=True)

        pdf.set_font('Helvetica', '', 8)
        for defect in defects:
            pdf.cell(25, 5, f'#{defect.id}', border=1)
            pdf.cell(30, 5, defect.created_at.strftime('%Y-%m-%d') if defect.created_at else '-', border=1)
            pdf.cell(25, 5, defect.severity or '-', border=1)
            pdf.cell(25, 5, defect.status or '-', border=1)
            desc = (defect.description[:45] + '...') if defect.description and len(defect.description) > 45 else (defect.description or '-')
            pdf.cell(75, 5, desc, border=1, ln=True)
        pdf.ln(5)

    # --- Recent Inspections ---
    inspections = Inspection.query.filter_by(equipment_id=equipment.id).order_by(
        Inspection.created_at.desc()
    ).limit(10).all()

    if inspections:
        pdf.section_title('Recent Inspections')
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(35, 6, 'Date', border=1, fill=True)
        pdf.cell(50, 6, 'Inspector', border=1, fill=True)
        pdf.cell(30, 6, 'Result', border=1, fill=True)
        pdf.cell(30, 6, 'Status', border=1, fill=True, ln=True)

        pdf.set_font('Helvetica', '', 8)
        for insp in inspections:
            pdf.cell(35, 5, insp.submitted_at.strftime('%Y-%m-%d') if insp.submitted_at else '-', border=1)
            pdf.cell(50, 5, insp.technician.full_name if insp.technician else '-', border=1)
            pdf.cell(30, 5, (insp.result or '-').upper(), border=1)
            pdf.cell(30, 5, (insp.status or '-').upper(), border=1, ln=True)

    # --- Generate PDF bytes ---
    pdf_bytes = io.BytesIO()
    pdf.output(pdf_bytes)
    pdf_bytes.seek(0)

    return pdf_bytes


def generate_equipment_list_report(equipment_list, include_history=False, include_certifications=False):
    """
    Generate a PDF report for multiple equipment items.

    Args:
        equipment_list: List of Equipment model objects
        include_history: Include status history
        include_certifications: Include certifications

    Returns:
        BytesIO object containing the PDF
    """
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title
    pdf.set_font('Helvetica', 'B', 18)
    pdf.cell(0, 10, 'Equipment Export Report', align='C', ln=True)
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(128, 128, 128)
    pdf.cell(0, 6, f'Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")} | Total: {len(equipment_list)} items', align='C', ln=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(10)

    # Equipment summary table
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_fill_color(230, 230, 230)
    pdf.cell(50, 7, 'Name', border=1, fill=True)
    pdf.cell(30, 7, 'Type', border=1, fill=True)
    pdf.cell(40, 7, 'Serial Number', border=1, fill=True)
    pdf.cell(25, 7, 'Berth', border=1, fill=True)
    pdf.cell(30, 7, 'Status', border=1, fill=True, ln=True)

    pdf.set_font('Helvetica', '', 9)
    for eq in equipment_list:
        name = eq.name[:28] if len(eq.name) > 28 else eq.name
        eq_type = eq.equipment_type[:15] if len(eq.equipment_type) > 15 else eq.equipment_type
        serial = eq.serial_number[:22] if len(eq.serial_number) > 22 else eq.serial_number

        pdf.cell(50, 6, name, border=1)
        pdf.cell(30, 6, eq_type, border=1)
        pdf.cell(40, 6, serial, border=1)
        pdf.cell(25, 6, eq.berth or '-', border=1)
        pdf.cell(30, 6, eq.status or '-', border=1, ln=True)

    # Status summary
    pdf.ln(10)
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 8, 'Status Summary', ln=True)

    status_counts = {}
    for eq in equipment_list:
        status = eq.status or 'unknown'
        status_counts[status] = status_counts.get(status, 0) + 1

    pdf.set_font('Helvetica', '', 10)
    for status, count in sorted(status_counts.items()):
        pdf.cell(0, 6, f'  {status.replace("_", " ").title()}: {count}', ln=True)

    # Generate PDF bytes
    pdf_bytes = io.BytesIO()
    pdf.output(pdf_bytes)
    pdf_bytes.seek(0)

    return pdf_bytes
