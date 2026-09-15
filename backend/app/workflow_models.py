"""Transactional workflow records, registered by app.models."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Float, ForeignKey, UniqueConstraint
from app.database import Base


class RecordRevision(Base):
    __tablename__ = "record_revisions"
    id = Column(Integer, primary_key=True)
    entity = Column(String, nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    action = Column(String, nullable=False)
    before_json = Column(Text)
    after_json = Column(Text)
    actor = Column(String, nullable=False)
    reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ResultRelease(Base):
    __tablename__ = "result_releases"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", "version", name="uq_result_release_version"),)
    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="Draft")
    data_json = Column(Text, nullable=False)
    source_hash = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    created_by = Column(String, nullable=False)
    reviewed_by = Column(String)
    published_by = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    published_at = Column(DateTime)


class PaymentCase(Base):
    __tablename__ = "payment_cases"
    __table_args__ = (UniqueConstraint("kind", "reference", name="uq_payment_case_reference"),)
    id = Column(Integer, primary_key=True)
    fee_id = Column(Integer, ForeignKey("fees.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    reference = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="Pending", index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    due_date = Column(Date)
    notes = Column(Text, nullable=False)
    target_fee_id = Column(Integer, ForeignKey("fees.id"))
    created_by = Column(String, nullable=False)
    decided_by = Column(String)
    decision_note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime)


class SettlementEntry(Base):
    __tablename__ = "settlement_entries"
    id = Column(Integer, primary_key=True)
    reference = Column(String, nullable=False, unique=True)
    gross_amount = Column(Float, nullable=False)
    charges = Column(Float, nullable=False, default=0)
    net_amount = Column(Float, nullable=False)
    settlement_date = Column(Date, nullable=False)
    fee_id = Column(Integer, ForeignKey("fees.id"))
    status = Column(String, nullable=False)
    imported_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class OperationalSnapshot(Base):
    __tablename__ = "operational_snapshots"
    __table_args__ = (UniqueConstraint("kind", "scope", "version", name="uq_operational_snapshot_version"),)
    id = Column(Integer, primary_key=True)
    kind = Column(String, nullable=False, index=True)
    scope = Column(String, nullable=False, index=True)
    version = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="Draft")
    effective_from = Column(Date)
    effective_until = Column(Date)
    data_json = Column(Text, nullable=False)
    reason = Column(Text, nullable=False)
    created_by = Column(String, nullable=False)
    approved_by = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AttendanceRegister(Base):
    __tablename__ = "attendance_registers"
    __table_args__ = (UniqueConstraint("class_id", "attendance_date", "period_no", name="uq_attendance_register_slot"),)
    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    attendance_date = Column(Date, nullable=False)
    period_no = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="Submitted")
    submitted_by = Column(String, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class MessageAcknowledgement(Base):
    __tablename__ = "message_acknowledgements"
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_message_user_ack"),)
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("communication_logs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    acknowledged_at = Column(DateTime, default=datetime.utcnow, nullable=False)
