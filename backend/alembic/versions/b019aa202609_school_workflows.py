"""Add school approval, publication and reconciliation workflows.

Revision ID: b019aa202609
Revises: af965fbca069
"""
from alembic import op
import sqlalchemy as sa
revision = "b019aa202609"
down_revision = "af965fbca069"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("transport_assignments", sa.Column("direction", sa.String(), nullable=False, server_default="Both"))
    op.add_column("attendance", sa.Column("period_no", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("marks", sa.Column("assessment_status", sa.String(), nullable=False, server_default="Scored"))
    op.add_column("admission_documents", sa.Column("review_status", sa.String(), nullable=False, server_default="Received"))
    op.add_column("admission_documents", sa.Column("reviewed_by", sa.String(), nullable=True))
    op.add_column("admission_documents", sa.Column("review_note", sa.Text(), nullable=True))
    op.create_table('record_revisions',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('entity', sa.String(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('before_json', sa.Text(), nullable=True),
        sa.Column('after_json', sa.Text(), nullable=True),
        sa.Column('actor', sa.String(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_record_revisions_entity', 'record_revisions', ['entity'])
    op.create_index('ix_record_revisions_entity_id', 'record_revisions', ['entity_id'])
    op.create_table('result_releases',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('exam_id', sa.Integer(), sa.ForeignKey('exams.id'), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('students.id'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('data_json', sa.Text(), nullable=False),
        sa.Column('source_hash', sa.String(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('published_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('exam_id', 'student_id', 'version', name='uq_result_release_version'),
    )
    op.create_index('ix_result_releases_exam_id', 'result_releases', ['exam_id'])
    op.create_index('ix_result_releases_student_id', 'result_releases', ['student_id'])
    op.create_table('payment_cases',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('fee_id', sa.Integer(), sa.ForeignKey('fees.id'), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('reference', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=False),
        sa.Column('target_fee_id', sa.Integer(), sa.ForeignKey('fees.id'), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('decided_by', sa.String(), nullable=True),
        sa.Column('decision_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('kind', 'reference', name='uq_payment_case_reference'),
    )
    op.create_index('ix_payment_cases_fee_id', 'payment_cases', ['fee_id'])
    op.create_index('ix_payment_cases_status', 'payment_cases', ['status'])
    op.create_table('settlement_entries',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('reference', sa.String(), nullable=False, unique=True),
        sa.Column('gross_amount', sa.Float(), nullable=False),
        sa.Column('charges', sa.Float(), nullable=False),
        sa.Column('net_amount', sa.Float(), nullable=False),
        sa.Column('settlement_date', sa.Date(), nullable=False),
        sa.Column('fee_id', sa.Integer(), sa.ForeignKey('fees.id'), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('imported_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_table('operational_snapshots',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('effective_from', sa.Date(), nullable=True),
        sa.Column('effective_until', sa.Date(), nullable=True),
        sa.Column('data_json', sa.Text(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('kind', 'scope', 'version', name='uq_operational_snapshot_version'),
    )
    op.create_index('ix_operational_snapshots_kind', 'operational_snapshots', ['kind'])
    op.create_index('ix_operational_snapshots_scope', 'operational_snapshots', ['scope'])
    op.create_table('attendance_registers',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('class_id', sa.Integer(), sa.ForeignKey('classes.id'), nullable=False),
        sa.Column('attendance_date', sa.Date(), nullable=False),
        sa.Column('period_no', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('submitted_by', sa.String(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('class_id', 'attendance_date', 'period_no', name='uq_attendance_register_slot'),
    )
    op.create_table('message_acknowledgements',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('message_id', sa.Integer(), sa.ForeignKey('communication_logs.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('message_id', 'user_id', name='uq_message_user_ack'),
    )


def downgrade():
    with op.batch_alter_table("transport_assignments") as batch:
        batch.drop_column("direction")
    op.drop_table('message_acknowledgements')
    op.drop_table('attendance_registers')
    op.drop_table('operational_snapshots')
    op.drop_table('settlement_entries')
    op.drop_table('payment_cases')
    op.drop_table('result_releases')
    op.drop_table('record_revisions')
    with op.batch_alter_table('admission_documents') as batch:
        batch.drop_column('review_note')
        batch.drop_column('reviewed_by')
        batch.drop_column('review_status')
    with op.batch_alter_table('marks') as batch:
        batch.drop_column('assessment_status')
    with op.batch_alter_table('attendance') as batch:
        batch.drop_column('period_no')
