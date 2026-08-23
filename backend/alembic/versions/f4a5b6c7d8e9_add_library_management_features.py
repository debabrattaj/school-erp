"""add library management features (settings, per-copy tracking,
reservations, renewals, staff issuance, overdue reminders)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "library_settings" not in tables:
        op.create_table(
            "library_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("loan_period_days", sa.Integer(), nullable=False, server_default="14"),
            sa.Column("loan_period_days_staff", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("fine_per_day", sa.Float(), nullable=False, server_default="2"),
            sa.Column("fine_grace_days", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_books_student", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("max_books_staff", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("max_renewals", sa.Integer(), nullable=False, server_default="2"),
            sa.Column("block_renewal_if_reserved", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("reservation_hold_days", sa.Integer(), nullable=False, server_default="2"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if "library_book_copies" not in tables:
        op.create_table(
            "library_book_copies",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("book_id", sa.Integer(), sa.ForeignKey("library_books.id", ondelete="CASCADE"), nullable=False),
            sa.Column("copy_no", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("barcode", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=True, server_default="Available"),
            sa.Column("shelf_no", sa.String(), nullable=True),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("book_id", "copy_no", name="uq_library_copy_no"),
            sa.UniqueConstraint("barcode", name="uq_library_book_copies_barcode"),
        )
        op.create_index("ix_library_book_copies_book_id", "library_book_copies", ["book_id"])
        op.create_index("ix_library_book_copies_barcode", "library_book_copies", ["barcode"], unique=True)
        op.create_index("ix_library_book_copies_status", "library_book_copies", ["status"])

    if "library_reservations" not in tables:
        op.create_table(
            "library_reservations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("book_id", sa.Integer(), sa.ForeignKey("library_books.id", ondelete="CASCADE"), nullable=False),
            sa.Column("borrower_type", sa.String(), nullable=False, server_default="Student"),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=True),
            sa.Column("staff_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True),
            sa.Column("status", sa.String(), nullable=True, server_default="Waiting"),
            sa.Column("queue_position", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("reserved_at", sa.DateTime(), nullable=True),
            sa.Column("ready_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_library_reservations_book_id", "library_reservations", ["book_id"])
        op.create_index("ix_library_reservations_student_id", "library_reservations", ["student_id"])
        op.create_index("ix_library_reservations_staff_id", "library_reservations", ["staff_id"])
        op.create_index("ix_library_reservations_status", "library_reservations", ["status"])
        op.create_index("ix_library_reservations_borrower_type", "library_reservations", ["borrower_type"])

    if "library_renewals" not in tables:
        op.create_table(
            "library_renewals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("issue_id", sa.Integer(), sa.ForeignKey("library_issues.id", ondelete="CASCADE"), nullable=False),
            sa.Column("previous_due_date", sa.Date(), nullable=False),
            sa.Column("new_due_date", sa.Date(), nullable=False),
            sa.Column("renewed_at", sa.DateTime(), nullable=True),
            sa.Column("remarks", sa.String(), nullable=True),
        )
        op.create_index("ix_library_renewals_issue_id", "library_renewals", ["issue_id"])

    if "library_reminder_rules" not in tables:
        op.create_table(
            "library_reminder_rules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("offset_days", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("channel", sa.String(), nullable=False, server_default="Email"),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("communication_templates.id", ondelete="SET NULL"), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("offset_days", "channel", name="uq_library_reminder_rung"),
        )

    if "library_reminder_logs" not in tables:
        op.create_table(
            "library_reminder_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("issue_id", sa.Integer(), sa.ForeignKey("library_issues.id", ondelete="CASCADE"), nullable=False),
            sa.Column("rule_id", sa.Integer(), sa.ForeignKey("library_reminder_rules.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=True),
            sa.Column("staff_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True),
            sa.Column("communication_log_id", sa.Integer(), sa.ForeignKey("communication_logs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Sent"),
            sa.Column("skip_reason", sa.String(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("fine_amount", sa.Float(), nullable=True),
            sa.Column("recipient", sa.String(), nullable=True),
            sa.Column("offset_days", sa.Integer(), nullable=True),
            sa.Column("sent_on", sa.Date(), nullable=False),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("issue_id", "rule_id", name="uq_library_reminder_once"),
        )
        op.create_index("ix_library_reminder_logs_issue_id", "library_reminder_logs", ["issue_id"])
        op.create_index("ix_library_reminder_logs_rule_id", "library_reminder_logs", ["rule_id"])
        op.create_index("ix_library_reminder_logs_student_id", "library_reminder_logs", ["student_id"])
        op.create_index("ix_library_reminder_logs_staff_id", "library_reminder_logs", ["staff_id"])
        op.create_index("ix_library_reminder_logs_status", "library_reminder_logs", ["status"])
        op.create_index("ix_library_reminder_logs_sent_on", "library_reminder_logs", ["sent_on"])

    issue_cols = {c["name"] for c in inspector.get_columns("library_issues")}
    with op.batch_alter_table("library_issues", schema=None) as batch_op:
        if "borrower_type" not in issue_cols:
            batch_op.add_column(sa.Column("borrower_type", sa.String(), nullable=False, server_default="Student"))
        if "staff_id" not in issue_cols:
            batch_op.add_column(sa.Column(
                "staff_id", sa.Integer(),
                sa.ForeignKey("teachers.id", ondelete="CASCADE", name="fk_library_issues_staff_id_teachers"),
                nullable=True,
            ))
        if "copy_id" not in issue_cols:
            batch_op.add_column(sa.Column(
                "copy_id", sa.Integer(),
                sa.ForeignKey("library_book_copies.id", ondelete="SET NULL", name="fk_library_issues_copy_id_copies"),
                nullable=True,
            ))
        if "renewal_count" not in issue_cols:
            batch_op.add_column(sa.Column("renewal_count", sa.Integer(), nullable=False, server_default="0"))
        if "fine_paid" not in issue_cols:
            batch_op.add_column(sa.Column("fine_paid", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "reservation_id" not in issue_cols:
            batch_op.add_column(sa.Column(
                "reservation_id", sa.Integer(),
                sa.ForeignKey("library_reservations.id", ondelete="SET NULL", name="fk_library_issues_reservation_id_reservations"),
                nullable=True,
            ))
        # A staff-only issue has no student -- the column can no longer be
        # mandatory now that borrowers include teachers.
        batch_op.alter_column("student_id", existing_type=sa.Integer(), nullable=True)

    issue_indexes = {ix["name"] for ix in inspector.get_indexes("library_issues")}
    if "ix_library_issues_staff_id" not in issue_indexes:
        op.create_index("ix_library_issues_staff_id", "library_issues", ["staff_id"])
    if "ix_library_issues_copy_id" not in issue_indexes:
        op.create_index("ix_library_issues_copy_id", "library_issues", ["copy_id"])
    if "ix_library_issues_reservation_id" not in issue_indexes:
        op.create_index("ix_library_issues_reservation_id", "library_issues", ["reservation_id"])
    if "ix_library_issues_borrower_type" not in issue_indexes:
        op.create_index("ix_library_issues_borrower_type", "library_issues", ["borrower_type"])


def downgrade() -> None:
    # Indexes were added outside the batch block, so they must be dropped
    # outside it too -- otherwise batch mode's table-rebuild tries to
    # recreate them against columns this same downgrade is removing.
    op.drop_index("ix_library_issues_borrower_type", table_name="library_issues")
    op.drop_index("ix_library_issues_reservation_id", table_name="library_issues")
    op.drop_index("ix_library_issues_copy_id", table_name="library_issues")
    op.drop_index("ix_library_issues_staff_id", table_name="library_issues")

    with op.batch_alter_table("library_issues", schema=None) as batch_op:
        batch_op.alter_column("student_id", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_column("reservation_id")
        batch_op.drop_column("fine_paid")
        batch_op.drop_column("renewal_count")
        batch_op.drop_column("copy_id")
        batch_op.drop_column("staff_id")
        batch_op.drop_column("borrower_type")

    op.drop_table("library_reminder_logs")
    op.drop_table("library_reminder_rules")
    op.drop_table("library_renewals")
    op.drop_table("library_reservations")
    op.drop_table("library_book_copies")
    op.drop_table("library_settings")
