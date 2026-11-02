"""add semester results and placement cell

Revision ID: fa0b1c2d3e4f
Revises: f9b0c1d2e3f4
Create Date: 2026-11-01 11:15:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa0b1c2d3e4f"
down_revision: Union[str, None] = "f9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table("semester_results",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(), nullable=False), sa.Column("semester", sa.String(), nullable=False), sa.Column("sgpa", sa.Float()), sa.Column("cgpa", sa.Float()),
        sa.Column("credits_registered", sa.Float()), sa.Column("credits_earned", sa.Float()), sa.Column("backlog_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result_status", sa.String(), nullable=False, server_default="Published"), sa.Column("remarks", sa.Text()), sa.Column("created_at", sa.DateTime()), sa.Column("updated_at", sa.DateTime()),
        sa.UniqueConstraint("student_id", "academic_year", "semester", name="uq_student_semester_result"))
    op.create_table("placement_recruiters",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("company_name", sa.String(), nullable=False, unique=True), sa.Column("industry", sa.String()), sa.Column("contact_name", sa.String()), sa.Column("contact_email", sa.String()), sa.Column("contact_phone", sa.String()), sa.Column("website", sa.String()), sa.Column("status", sa.String(), nullable=False, server_default="Active"), sa.Column("remarks", sa.Text()), sa.Column("created_at", sa.DateTime()))
    op.create_table("placement_offers",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False), sa.Column("recruiter_id", sa.Integer(), sa.ForeignKey("placement_recruiters.id", ondelete="SET NULL")), sa.Column("academic_year", sa.String()), sa.Column("role_title", sa.String(), nullable=False), sa.Column("offer_type", sa.String(), nullable=False, server_default="Placement"), sa.Column("ctc_lpa", sa.Float()), sa.Column("location", sa.String()), sa.Column("drive_date", sa.Date()), sa.Column("status", sa.String(), nullable=False, server_default="Applied"), sa.Column("offer_letter_url", sa.String()), sa.Column("remarks", sa.Text()), sa.Column("created_at", sa.DateTime()), sa.Column("updated_at", sa.DateTime()))

def downgrade() -> None:
    op.drop_table("placement_offers"); op.drop_table("placement_recruiters"); op.drop_table("semester_results")
