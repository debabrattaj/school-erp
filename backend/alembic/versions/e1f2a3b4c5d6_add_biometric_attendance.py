"""add biometric attendance tables: devices, enrollments, punches, sync runs,
and the attendance-derivation config

Revision ID: e1f2a3b4c5d6
Revises: c9d0e1f2a3b4
Create Date: 2026-08-16 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "biometric_devices" not in tables:
        op.create_table(
            "biometric_devices",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("serial_number", sa.String(), nullable=False),
            sa.Column("location", sa.String(), nullable=True),
            sa.Column("vendor", sa.String(), nullable=True),
            sa.Column("mode", sa.String(), nullable=False, server_default="push"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("auth_token_hash", sa.String(), nullable=True),
            sa.Column("pull_endpoint", sa.String(), nullable=True),
            sa.Column("pull_config", sa.Text(), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("last_sync_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("serial_number", name="uq_biometric_device_serial"),
        )
        op.create_index("ix_biometric_devices_serial_number", "biometric_devices", ["serial_number"])

    if "biometric_enrollments" not in tables:
        op.create_table(
            "biometric_enrollments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "device_id",
                sa.Integer(),
                sa.ForeignKey("biometric_devices.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("device_user_id", sa.String(), nullable=False),
            sa.Column(
                "student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=True
            ),
            sa.Column(
                "teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True
            ),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index(
            "ix_biometric_enrollments_device_user_id", "biometric_enrollments", ["device_user_id"]
        )

    if "biometric_punches" not in tables:
        op.create_table(
            "biometric_punches",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "device_id",
                sa.Integer(),
                sa.ForeignKey("biometric_devices.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("device_user_id", sa.String(), nullable=False),
            sa.Column("punched_at", sa.DateTime(), nullable=False),
            sa.Column("direction", sa.String(), nullable=True),
            sa.Column("raw_payload", sa.Text(), nullable=True),
            sa.Column("dedupe_key", sa.String(), nullable=False),
            sa.Column(
                "student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True
            ),
            sa.Column(
                "teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True
            ),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("dedupe_key", name="uq_biometric_punch_dedupe"),
        )
        op.create_index("ix_biometric_punches_dedupe_key", "biometric_punches", ["dedupe_key"])
        op.create_index("ix_biometric_punches_punched_at", "biometric_punches", ["punched_at"])

    if "biometric_sync_runs" not in tables:
        op.create_table(
            "biometric_sync_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "device_id",
                sa.Integer(),
                sa.ForeignKey("biometric_devices.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("run_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("fetched_count", sa.Integer(), nullable=True),
            sa.Column("ingested_count", sa.Integer(), nullable=True),
            sa.Column("duplicate_count", sa.Integer(), nullable=True),
            sa.Column("unmatched_count", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
        )

    if "biometric_attendance_config" not in tables:
        op.create_table(
            "biometric_attendance_config",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("derive_attendance", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("late_after", sa.Time(), nullable=True),
            sa.Column("half_day_before", sa.Time(), nullable=True),
            sa.Column("absent_if_no_punch", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("overwrite_manual", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in (
        "biometric_attendance_config",
        "biometric_sync_runs",
        "biometric_punches",
        "biometric_enrollments",
        "biometric_devices",
    ):
        if table in tables:
            op.drop_table(table)
