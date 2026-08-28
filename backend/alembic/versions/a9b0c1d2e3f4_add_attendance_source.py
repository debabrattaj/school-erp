"""add attendance.source

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-08-19 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, None] = 'f8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "attendance" not in inspector.get_table_names():
        return

    columns = {c["name"] for c in inspector.get_columns("attendance")}
    if "source" in columns:
        return

    with op.batch_alter_table("attendance") as batch:
        batch.add_column(
            sa.Column("source", sa.String(), nullable=False, server_default="Manual")
        )
    op.create_index("ix_attendance_source", "attendance", ["source"])

    # Backfill from the old convention. Provenance used to live in the remarks
    # text, and derivation decided whether it could overwrite a row by testing
    # whether remarks started with "Biometric". Without this backfill every
    # existing derived row would read as Manual and the next derivation would
    # refuse to update any of them.
    # The colon matters. Derivation always wrote "Biometric: 08:12-15:40" or
    # "Biometric: no punch recorded", so 'Biometric: %' catches every machine
    # row while leaving a teacher's "Biometric device was down, marked by
    # hand" as Manual -- which is what it always should have been, and what
    # the old substring test got wrong.
    op.execute(
        "UPDATE attendance SET source = 'Biometric' "
        "WHERE remarks IS NOT NULL AND remarks LIKE 'Biometric: %'"
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "attendance" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("attendance")}
    if "source" not in columns:
        return

    indexes = {i["name"] for i in inspector.get_indexes("attendance")}
    if "ix_attendance_source" in indexes:
        op.drop_index("ix_attendance_source", table_name="attendance")
    with op.batch_alter_table("attendance") as batch:
        batch.drop_column("source")
