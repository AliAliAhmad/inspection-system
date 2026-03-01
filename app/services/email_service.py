"""
Email Service for sending notifications.
Uses Flask-Mail or direct SMTP.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from flask import current_app
import logging
import requests
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending email notifications."""

    # Default planning recipients (can be overridden via env)
    DEFAULT_PLANNING_EMAILS = [
        # Add default emails here or via env variable
    ]

    @classmethod
    def get_planning_recipients(cls):
        """Get list of planning/store team email addresses."""
        env_emails = os.getenv('PLANNING_TEAM_EMAILS', '')
        if env_emails:
            return [e.strip() for e in env_emails.split(',') if e.strip()]
        return cls.DEFAULT_PLANNING_EMAILS

    @classmethod
    def get_smtp_config(cls):
        """Get SMTP configuration from environment."""
        return {
            'host': os.getenv('SMTP_HOST', 'smtp.gmail.com'),
            'port': int(os.getenv('SMTP_PORT', '587')),
            'username': os.getenv('SMTP_USERNAME', ''),
            'password': os.getenv('SMTP_PASSWORD', ''),
            'from_email': os.getenv('SMTP_FROM_EMAIL', 'noreply@inspection-system.com'),
            'from_name': os.getenv('SMTP_FROM_NAME', 'Inspection System'),
            'use_tls': os.getenv('SMTP_USE_TLS', 'true').lower() == 'true',
        }

    @classmethod
    def send_email(cls, to_emails, subject, html_body, text_body=None,
                   attachments=None, cc=None, reply_to=None):
        """
        Send an email.

        Args:
            to_emails: List of recipient email addresses
            subject: Email subject
            html_body: HTML content
            text_body: Plain text content (optional, derived from HTML if not provided)
            attachments: List of dicts with 'filename', 'content', 'mime_type'
            cc: List of CC email addresses
            reply_to: Reply-to email address

        Returns:
            True if sent successfully, False otherwise
        """
        config = cls.get_smtp_config()

        if not config['username'] or not config['password']:
            logger.warning("Email not configured - SMTP_USERNAME or SMTP_PASSWORD missing")
            return False

        if not to_emails:
            logger.warning("No recipients specified for email")
            return False

        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{config['from_name']} <{config['from_email']}>"
            msg['To'] = ', '.join(to_emails) if isinstance(to_emails, list) else to_emails

            if cc:
                msg['Cc'] = ', '.join(cc) if isinstance(cc, list) else cc

            if reply_to:
                msg['Reply-To'] = reply_to

            # Add body
            if text_body:
                msg.attach(MIMEText(text_body, 'plain'))
            msg.attach(MIMEText(html_body, 'html'))

            # Add attachments
            if attachments:
                for att in attachments:
                    part = MIMEApplication(att['content'], Name=att['filename'])
                    part['Content-Disposition'] = f'attachment; filename="{att["filename"]}"'
                    msg.attach(part)

            # Send via SMTP
            all_recipients = list(to_emails) if isinstance(to_emails, list) else [to_emails]
            if cc:
                all_recipients.extend(cc if isinstance(cc, list) else [cc])

            with smtplib.SMTP(config['host'], config['port']) as server:
                if config['use_tls']:
                    server.starttls()
                server.login(config['username'], config['password'])
                server.sendmail(config['from_email'], all_recipients, msg.as_string())

            logger.info(f"Email sent to {len(all_recipients)} recipients: {subject}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    @classmethod
    def send_work_plan_notification(cls, plan, pdf_file=None, recipients=None):
        """
        Send work plan publish notification with PDF attachment.

        Args:
            plan: WorkPlan instance
            pdf_file: Optional File instance for PDF attachment
            recipients: List of email addresses (defaults to planning team)

        Returns:
            True if sent successfully
        """
        if recipients is None:
            recipients = cls.get_planning_recipients()

        if not recipients:
            logger.warning("No recipients configured for work plan notification")
            return False

        week_str = f"{plan.week_start.strftime('%d %b')} - {plan.week_end.strftime('%d %b %Y')}"
        subject = f"Weekly Work Plan Published: {week_str}"

        # Build summary stats
        total_jobs = plan.get_total_jobs()
        total_hours = sum(sum(j.estimated_hours or 0 for j in d.jobs) for d in plan.days)
        pm_count = sum(sum(1 for j in d.jobs if j.job_type == 'pm') for d in plan.days)
        defect_count = sum(sum(1 for j in d.jobs if j.job_type == 'defect') for d in plan.days)
        no_sap_count = sum(sum(1 for j in d.jobs if not j.sap_order_number) for d in plan.days)

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2980b9; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">Weekly Work Plan Published</h1>
                <p style="margin: 10px 0 0;">{week_str}</p>
            </div>

            <div style="padding: 20px;">
                <h2>Summary</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Jobs</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{total_jobs}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Hours</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{total_hours:.1f}h</td>
                    </tr>
                    <tr style="background: #f5f5f5;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>PM Jobs</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{pm_count}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Defect Repairs</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{defect_count}</td>
                    </tr>
                    {"<tr style='background: #ffe6e6;'><td style='padding: 10px; border: 1px solid #ddd;'><strong>⚠️ Jobs Without SAP Order</strong></td><td style='padding: 10px; border: 1px solid #ddd; color: red;'>" + str(no_sap_count) + "</td></tr>" if no_sap_count > 0 else ""}
                </table>

                <p style="margin-top: 20px;">
                    {"The full work plan PDF is attached to this email." if pdf_file else "Please access the system to view the full work plan."}
                </p>

                <p style="color: #888; font-size: 12px; margin-top: 30px;">
                    This is an automated message from the Industrial Inspection System.
                </p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
        Weekly Work Plan Published: {week_str}

        Summary:
        - Total Jobs: {total_jobs}
        - Total Hours: {total_hours:.1f}h
        - PM Jobs: {pm_count}
        - Defect Repairs: {defect_count}
        {f"- ⚠️ Jobs Without SAP Order: {no_sap_count}" if no_sap_count > 0 else ""}

        {"The full work plan PDF is attached to this email." if pdf_file else "Please access the system to view the full work plan."}

        This is an automated message from the Industrial Inspection System.
        """

        # Get PDF content if available
        attachments = []
        if pdf_file:
            try:
                pdf_url = pdf_file.get_url()
                if pdf_url:
                    response = requests.get(pdf_url, timeout=30)
                    if response.status_code == 200:
                        attachments.append({
                            'filename': f'work_plan_{week_str.replace(" ", "_")}.pdf',
                            'content': response.content,
                            'mime_type': 'application/pdf'
                        })
            except Exception as e:
                logger.warning(f"Failed to attach PDF: {e}")

        return cls.send_email(
            to_emails=recipients,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            attachments=attachments if attachments else None
        )

    @classmethod
    def get_store_recipients(cls):
        """Get store/warehouse team email addresses from STORE_EMAILS env var."""
        env_emails = os.getenv('STORE_EMAILS', '')
        if env_emails:
            return [e.strip() for e in env_emails.split(',') if e.strip()]
        return []

    @classmethod
    def send_low_stock_alert(cls, critical_items, warning_items, recipients=None):
        """
        Send low-stock email alert to store/warehouse team.

        Args:
            critical_items: List of dicts from StockAlertService.check_low_stock() with severity='critical'
            warning_items:  List of dicts with severity='warning'
            recipients:     List of email addresses (defaults to STORE_EMAILS env var)
        """
        if recipients is None:
            recipients = cls.get_store_recipients()

        if not recipients:
            logger.warning("No STORE_EMAILS configured for low-stock alert")
            return False

        all_items = critical_items + warning_items
        if not all_items:
            return False

        n = len(all_items)
        subject = f"⚠️ Stock Alert: {n} Material{'s' if n != 1 else ''} Need Reorder"

        def row_color(sev):
            return '#fff2f0' if sev == 'critical' else '#fff7e6'

        rows = ''
        for i, item in enumerate(all_items):
            bg = row_color(item.get('severity', 'warning')) if i % 2 == 0 else ('#fff2f0' if item.get('severity') == 'critical' else '#fffbe6')
            suggested = max(0, (item.get('min_stock', 0) * 2) - item.get('current_stock', 0))
            rows += f"""
            <tr style="background:{bg};">
              <td style="padding:8px;border:1px solid #ddd;">{item.get('code','')}</td>
              <td style="padding:8px;border:1px solid #ddd;">{item.get('name','')}</td>
              <td style="padding:8px;border:1px solid #ddd;color:{'#ff4d4f' if item.get('severity')=='critical' else '#fa8c16'};font-weight:700;">
                {'🔴 Critical' if item.get('severity')=='critical' else '🟠 Low'}
              </td>
              <td style="padding:8px;border:1px solid #ddd;text-align:center;">{item.get('current_stock',0)} {item.get('unit','')}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:center;">{item.get('min_stock',0)} {item.get('unit','')}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:700;">{suggested} {item.get('unit','')}</td>
            </tr>"""

        html_body = f"""
        <html>
        <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
          <div style="background:#d4380d;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;">⚠️ Stock Alert</h1>
            <p style="margin:8px 0 0;">{n} material{'s' if n!=1 else ''} require immediate attention</p>
          </div>
          <div style="padding:20px;">
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <thead>
                <tr style="background:#fafafa;">
                  <th style="padding:10px;border:1px solid #ddd;text-align:left;">Code</th>
                  <th style="padding:10px;border:1px solid #ddd;text-align:left;">Name</th>
                  <th style="padding:10px;border:1px solid #ddd;text-align:left;">Status</th>
                  <th style="padding:10px;border:1px solid #ddd;">Current Stock</th>
                  <th style="padding:10px;border:1px solid #ddd;">Min Stock</th>
                  <th style="padding:10px;border:1px solid #ddd;">Suggested Order</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
            <p style="margin-top:20px;color:#888;font-size:12px;">
              This is an automated alert from the Industrial Inspection System.
              Please reorder the flagged materials as soon as possible.
            </p>
          </div>
        </body>
        </html>"""

        text_body = f"Stock Alert: {n} materials need reorder\n\n" + "\n".join(
            f"- {i.get('code')} {i.get('name')}: {i.get('current_stock')} {i.get('unit')} (min: {i.get('min_stock')})"
            for i in all_items
        )

        return cls.send_email(
            to_emails=recipients,
            subject=subject,
            html_body=html_body,
            text_body=text_body
        )

    @classmethod
    def send_store_materials_notification(cls, plan, materials_summary, recipients=None):
        """
        Send materials preparation email to store team when a work plan is published.

        Args:
            plan:              WorkPlan instance
            materials_summary: List of dicts [{code, name, total_qty, unit, location}]
            recipients:        List of email addresses (defaults to STORE_EMAILS env var)
        """
        if recipients is None:
            recipients = cls.get_store_recipients()

        if not recipients or not materials_summary:
            return False

        week_str = f"{plan.week_start.strftime('%d %b')} - {plan.week_end.strftime('%d %b %Y')}"
        subject = f"📦 Materials Needed for Work Plan: {week_str}"

        rows = ''
        for i, mat in enumerate(materials_summary):
            bg = '#fafafa' if i % 2 == 0 else '#fff'
            rows += f"""
            <tr style="background:{bg};">
              <td style="padding:8px;border:1px solid #ddd;">{mat.get('code','')}</td>
              <td style="padding:8px;border:1px solid #ddd;">{mat.get('name','')}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:700;">{mat.get('total_qty',0)} {mat.get('unit','')}</td>
              <td style="padding:8px;border:1px solid #ddd;">{mat.get('location') or '—'}</td>
            </tr>"""

        html_body = f"""
        <html>
        <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
          <div style="background:#1d39c4;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;">📦 Materials Preparation Request</h1>
            <p style="margin:8px 0 0;">Work Plan: {week_str}</p>
          </div>
          <div style="padding:20px;">
            <p>Please prepare the following materials before <strong>{plan.week_start.strftime('%A, %d %b %Y')}</strong> morning:</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <thead>
                <tr style="background:#e6f7ff;">
                  <th style="padding:10px;border:1px solid #ddd;text-align:left;">Code</th>
                  <th style="padding:10px;border:1px solid #ddd;text-align:left;">Material</th>
                  <th style="padding:10px;border:1px solid #ddd;">Total Qty Needed</th>
                  <th style="padding:10px;border:1px solid #ddd;text-align:left;">Storage Location</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
            <p style="margin-top:20px;color:#888;font-size:12px;">
              This is an automated message from the Industrial Inspection System.
            </p>
          </div>
        </body>
        </html>"""

        text_body = f"Materials for Work Plan {week_str}:\n\n" + "\n".join(
            f"- {m.get('code')} {m.get('name')}: {m.get('total_qty')} {m.get('unit')}"
            for m in materials_summary
        )

        return cls.send_email(
            to_emails=recipients,
            subject=subject,
            html_body=html_body,
            text_body=text_body
        )

    @classmethod
    def send_test_email(cls, to_email):
        """Send a test email to verify configuration."""
        return cls.send_email(
            to_emails=[to_email],
            subject="Test Email - Inspection System",
            html_body="""
            <html>
            <body>
                <h1>Test Email</h1>
                <p>This is a test email from the Industrial Inspection System.</p>
                <p>If you received this, email configuration is working correctly.</p>
            </body>
            </html>
            """,
            text_body="Test Email\n\nThis is a test email from the Industrial Inspection System."
        )
