"""Add supervised academic projects and practical assessments."""
from alembic import op
import sqlalchemy as sa

revision = "fc1d2e3f4a5b"
down_revision = ("fb0c1d2e3f4a", "c2d3e4f5a6b7")
branch_labels = None
depends_on = None


def upgrade():
    # Startup can create new tables before the deployment runs Alembic.
    if sa.inspect(op.get_bind()).has_table("academic_activities"):
        return
    op.create_table(
        "academic_activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(30), nullable=False),
        sa.Column("semester", sa.String(50), nullable=False),
        sa.Column("activity_type", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("programme", sa.String(120), nullable=False),
        sa.Column("course_code", sa.String(50)),
        sa.Column("supervisor", sa.String(120), nullable=False),
        sa.Column("laboratory", sa.String(120)),
        sa.Column("due_date", sa.Date()),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float()),
        sa.Column("max_score", sa.Float(), nullable=False),
        sa.Column("objective", sa.Text()),
        sa.Column("feedback", sa.Text()),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("student_id", "academic_year", "semester", "activity_type", "title", name="uq_academic_activity_assignment"),
    )


def downgrade():
    op.drop_table("academic_activities")
