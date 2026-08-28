"""add proctoring add-on: policies, sessions, events, consents, access logs,
and online_tests.proctoring_enabled / proctoring_policy_id

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-08-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "proctoring_policies" not in tables:
        op.create_table(
            "proctoring_policies",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("require_fullscreen", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("block_copy_paste", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("max_violations_before_autosubmit", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("require_webcam", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("require_mic", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("capture_interval_seconds", sa.Integer(), nullable=True),
            sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if "proctoring_consents" not in tables:
        op.create_table(
            "proctoring_consents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("granted_by", sa.String(), nullable=False),
            sa.Column("granted_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_by", sa.String(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("scope", sa.String(), nullable=False, server_default="online_test_proctoring"),
            sa.Column("consent_text_version", sa.String(), nullable=True),
            sa.Column("ip_address", sa.String(), nullable=True),
        )
        op.create_index("ix_proctoring_consents_student_id", "proctoring_consents", ["student_id"])

    if "proctoring_sessions" not in tables:
        op.create_table(
            "proctoring_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "attempt_id",
                sa.Integer(),
                sa.ForeignKey("online_test_attempts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "consent_id", sa.Integer(), sa.ForeignKey("proctoring_consents.id", ondelete="SET NULL"), nullable=True
            ),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("ended_at", sa.DateTime(), nullable=True),
            sa.Column("review_status", sa.String(), nullable=False, server_default="Pending"),
            sa.Column("reviewed_by", sa.String(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewer_notes", sa.Text(), nullable=True),
            sa.Column("retention_expires_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("attempt_id", name="uq_proctoring_session_attempt"),
        )
        op.create_index("ix_proctoring_sessions_review_status", "proctoring_sessions", ["review_status"])

    if "proctoring_events" not in tables:
        op.create_table(
            "proctoring_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "session_id",
                sa.Integer(),
                sa.ForeignKey("proctoring_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("occurred_at", sa.DateTime(), nullable=True),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("severity", sa.String(), nullable=False, server_default="warning"),
            sa.Column("source", sa.String(), nullable=False, server_default="client"),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("detail", sa.Text(), nullable=True),
        )
        op.create_index("ix_proctoring_events_session_id", "proctoring_events", ["session_id"])
        op.create_index("ix_proctoring_events_occurred_at", "proctoring_events", ["occurred_at"])

    if "proctoring_access_logs" not in tables:
        op.create_table(
            "proctoring_access_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "session_id",
                sa.Integer(),
                sa.ForeignKey("proctoring_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("viewed_by", sa.String(), nullable=False),
            sa.Column("viewed_at", sa.DateTime(), nullable=True),
            sa.Column("action", sa.String(), nullable=False, server_default="view"),
        )
        op.create_index("ix_proctoring_access_logs_session_id", "proctoring_access_logs", ["session_id"])

    if "online_tests" in tables:
        columns = {col["name"] for col in inspector.get_columns("online_tests")}
        if "proctoring_enabled" not in columns:
            op.add_column(
                "online_tests",
                sa.Column("proctoring_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "proctoring_policy_id" not in columns:
            with op.batch_alter_table("online_tests") as batch_op:
                batch_op.add_column(sa.Column("proctoring_policy_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_online_tests_proctoring_policy_id",
                    "proctoring_policies",
                    ["proctoring_policy_id"],
                    ["id"],
                    ondelete="SET NULL",
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "online_tests" in tables:
        columns = {col["name"] for col in inspector.get_columns("online_tests")}
        if "proctoring_policy_id" in columns:
            with op.batch_alter_table("online_tests") as batch_op:
                batch_op.drop_constraint("fk_online_tests_proctoring_policy_id", type_="foreignkey")
                batch_op.drop_column("proctoring_policy_id")
        if "proctoring_enabled" in columns:
            op.drop_column("online_tests", "proctoring_enabled")

    if "proctoring_access_logs" in tables:
        op.drop_table("proctoring_access_logs")

    if "proctoring_events" in tables:
        op.drop_table("proctoring_events")

    if "proctoring_sessions" in tables:
        op.drop_table("proctoring_sessions")

    if "proctoring_consents" in tables:
        op.drop_table("proctoring_consents")

    if "proctoring_policies" in tables:
        op.drop_table("proctoring_policies")
