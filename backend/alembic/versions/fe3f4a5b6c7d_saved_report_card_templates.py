"""School-owned editable report card templates."""
from alembic import op
import sqlalchemy as sa

revision = "fe3f4a5b6c7d"
down_revision = "fd2e3f4a5b6c"
branch_labels = None
depends_on = None


def upgrade():
    if "report_card_templates" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table("report_card_templates",
                        sa.Column("id", sa.Integer(), primary_key=True),
                        sa.Column("name", sa.String(100), nullable=False, unique=True),
                        sa.Column("configuration", sa.Text(), nullable=False),
                        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))


def downgrade():
    op.drop_table("report_card_templates")
