"""add school_settings.report_card_template

Revision ID: c7d8e9f0a1b2
Revises: 8ed076ae79bb
Create Date: 2026-08-27 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = '8ed076ae79bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "school_settings" in tables:
        columns = {col["name"] for col in inspector.get_columns("school_settings")}
        if "report_card_template" not in columns:
            op.add_column(
                "school_settings",
                sa.Column(
                    "report_card_template",
                    sa.String(),
                    nullable=False,
                    server_default="classic",
                ),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "school_settings" in tables:
        columns = {col["name"] for col in inspector.get_columns("school_settings")}
        if "report_card_template" in columns:
            op.drop_column("school_settings", "report_card_template")
