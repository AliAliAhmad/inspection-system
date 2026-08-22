"""
Record of every SAP export file the Windows courier has delivered.

Two things are stored in two different places, on purpose:

  * The BYTES go to the Render persistent disk (`uploads`, 1 GB, mounted at
    /app/instance/uploads). Only the CURRENT version of each file is kept —
    when a fresher copy of IW39 arrives, the previous one is deleted from disk.
    Ten transactions at ~250 MB total, flat forever, instead of 250 MB/day.

  * This ROW stays forever. It is tiny, and the history is what answers
    "when did MB52 last land?" — the question that catches a courier which has
    quietly stopped running.

Render's ordinary filesystem is ephemeral and would lose a 35 MB upload on the
next deploy; the persistent disk is why this works at all.
"""

from datetime import datetime

from app.extensions import db


class SapSyncFile(db.Model):
    __tablename__ = 'sap_sync_files'

    id = db.Column(db.Integer, primary_key=True)

    # The SAP transaction the courier recognised from the filename, or 'OTHER'
    # for the roster / asset list / material sheets it carries but cannot name.
    sheet_name = db.Column(db.String(20), nullable=False, index=True)

    # Basename of the folder on the Windows PC ('sap_import' / 'Source file').
    # Needed because the same filename exists in both (there is an SQ01 in each).
    source_folder = db.Column(db.String(100), nullable=False, index=True)
    source_filename = db.Column(db.String(255), nullable=False, index=True)

    sha256 = db.Column(db.String(64), nullable=False, index=True)
    file_size = db.Column(db.BigInteger, nullable=False)

    # mtime on the Windows PC — i.e. when SAP actually produced the export.
    # Distinct from received_at, which is when it reached us. A large gap means
    # the courier was down, not that SAP was.
    captured_at = db.Column(db.DateTime, nullable=True)
    received_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Path relative to UPLOAD_FOLDER. NULL once superseded and the bytes deleted.
    stored_path = db.Column(db.String(500), nullable=True)

    # Exactly one current row per (source_folder, source_filename).
    is_current = db.Column(db.Boolean, default=True, nullable=False, index=True)

    # Set when a parser has consumed this file. Parsing is a later task; this
    # column exists now so the receive side never needs another migration.
    parsed_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        # The courier may legitimately re-send the same bytes (a retry after a
        # network failure, or a restart). This makes that a no-op rather than a
        # duplicate, and matches the courier's own (folder, filename, sha) key.
        db.UniqueConstraint('source_folder', 'source_filename', 'sha256',
                            name='uq_sap_sync_folder_file_sha'),
        db.Index('ix_sap_sync_current', 'source_folder', 'source_filename', 'is_current'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'sheet_name': self.sheet_name,
            'source_folder': self.source_folder,
            'source_filename': self.source_filename,
            'sha256': self.sha256,
            'file_size': self.file_size,
            'captured_at': self.captured_at.isoformat() if self.captured_at else None,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'is_current': self.is_current,
            'has_bytes': self.stored_path is not None,
            'parsed_at': self.parsed_at.isoformat() if self.parsed_at else None,
        }

    def __repr__(self):
        return f'<SapSyncFile {self.source_folder}/{self.source_filename} {self.sha256[:8]}>'
