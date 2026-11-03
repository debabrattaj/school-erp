"""Add academic project and practical milestones."""
from alembic import op
import sqlalchemy as sa

revision = "fd2e3f4a5b6c"
down_revision = "fc1d2e3f4a5b"
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("academic_milestones"):
        return
    op.create_table(
        "academic_milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("academic_activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("feedback", sa.Text()),
        sa.Column("evidence_url", sa.String(2000)),
        sa.Column("reviewed_by", sa.String(200)),
        sa.Column("reviewed_at", sa.DateTime()),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.UniqueConstraint("activity_id", "title", name="uq_activity_milestone_title"),
    )


def downgrade():
    op.drop_table("academic_milestones")
