"""add admission crm fields (assigned_to_user_id, possible_duplicate_of_id)

New tables (AdmissionStageHistory, AdmissionStageTaskTemplate,
AdmissionTask) self-create via Base.metadata.create_all and need no
migration here -- only the two new columns on the existing
admission_inquiries table do.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-08-21 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "admission_inquiries" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("admission_inquiries")}

    if "assigned_to_user_id" not in cols:
        with op.batch_alter_table("admission_inquiries", schema=None) as batch_op:
            batch_op.add_column(sa.Column("assigned_to_user_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_admission_inquiries_assigned_to_user_id",
                "users", ["assigned_to_user_id"], ["id"], ondelete="SET NULL",
            )
        op.create_index(
            "ix_admission_inquiries_assigned_to_user_id", "admission_inquiries", ["assigned_to_user_id"]
        )

    if "possible_duplicate_of_id" not in cols:
        with op.batch_alter_table("admission_inquiries", schema=None) as batch_op:
            batch_op.add_column(sa.Column("possible_duplicate_of_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_admission_inquiries_possible_duplicate_of_id",
                "admission_inquiries", ["possible_duplicate_of_id"], ["id"], ondelete="SET NULL",
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "admission_inquiries" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("admission_inquiries")}

    if "possible_duplicate_of_id" in cols:
        with op.batch_alter_table("admission_inquiries", schema=None) as batch_op:
            batch_op.drop_constraint("fk_admission_inquiries_possible_duplicate_of_id", type_="foreignkey")
            batch_op.drop_column("possible_duplicate_of_id")

    if "assigned_to_user_id" in cols:
        op.drop_index("ix_admission_inquiries_assigned_to_user_id", table_name="admission_inquiries")
        with op.batch_alter_table("admission_inquiries", schema=None) as batch_op:
            batch_op.drop_constraint("fk_admission_inquiries_assigned_to_user_id", type_="foreignkey")
            batch_op.drop_column("assigned_to_user_id")
