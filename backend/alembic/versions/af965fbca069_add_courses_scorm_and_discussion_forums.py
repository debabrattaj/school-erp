"""add courses, scorm packages and discussion forums

Revision ID: af965fbca069
Revises: e8f9a0b1c2d3
Create Date: 2026-09-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'af965fbca069'
down_revision: Union[str, None] = 'e8f9a0b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Ordered so a table is created after everything it points at.
NEW_TABLES = [
    "scorm_packages",
    "scorm_attempts",
    "courses",
    "course_sections",
    "course_sessions",
    "course_lessons",
    "course_enrollments",
    "course_lesson_progress",
    "course_session_attendance",
    "course_feedback",
    "course_notes",
    "discussion_topics",
    "discussion_posts",
]


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "scorm_packages" not in tables:
        op.create_table('scorm_packages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('academic_year', sa.String(), nullable=True),
        sa.Column('class_name', sa.String(), nullable=False),
        sa.Column('section', sa.String(), nullable=True),
        sa.Column('subject', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('scorm_version', sa.String(), nullable=False),
        sa.Column('manifest_identifier', sa.String(), nullable=True),
        sa.Column('launch_url', sa.String(), nullable=False),
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('package_bytes', sa.Integer(), nullable=True),
        sa.Column('mastery_score', sa.Float(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('available_from', sa.Date(), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('teacher_id', sa.Integer(), nullable=True),
        sa.Column('teacher_name_snapshot', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['teacher_id'], ['teachers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('scorm_packages', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_scorm_packages_academic_year'), ['academic_year'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_available_from'), ['available_from'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_class_name'), ['class_name'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_section'), ['section'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_status'), ['status'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_storage_key'), ['storage_key'], unique=True)
            batch_op.create_index(batch_op.f('ix_scorm_packages_subject'), ['subject'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_packages_teacher_id'), ['teacher_id'], unique=False)

    if "scorm_attempts" not in tables:
        op.create_table('scorm_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('student_name_snapshot', sa.String(), nullable=True),
        sa.Column('lesson_status', sa.String(), nullable=False),
        sa.Column('score_raw', sa.Float(), nullable=True),
        sa.Column('score_min', sa.Float(), nullable=True),
        sa.Column('score_max', sa.Float(), nullable=True),
        sa.Column('lesson_location', sa.String(), nullable=True),
        sa.Column('suspend_data', sa.Text(), nullable=True),
        sa.Column('total_time_seconds', sa.Integer(), nullable=False),
        sa.Column('session_count', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['package_id'], ['scorm_packages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('package_id', 'student_id', name='uq_scorm_attempt_package_student')
        )
        with op.batch_alter_table('scorm_attempts', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_scorm_attempts_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_attempts_last_accessed_at'), ['last_accessed_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_attempts_lesson_status'), ['lesson_status'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_attempts_package_id'), ['package_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_scorm_attempts_student_id'), ['student_id'], unique=False)

    if "courses" not in tables:
        op.create_table('courses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('cover_image_url', sa.String(), nullable=True),
        sa.Column('course_type', sa.String(), nullable=False),
        sa.Column('academic_year', sa.String(), nullable=True),
        sa.Column('class_name', sa.String(), nullable=True),
        sa.Column('section', sa.String(), nullable=True),
        sa.Column('subject', sa.String(), nullable=True),
        sa.Column('trainer_teacher_id', sa.Integer(), nullable=True),
        sa.Column('trainer_name_snapshot', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('available_from', sa.Date(), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('allow_self_enrollment', sa.Boolean(), nullable=False),
        sa.Column('auto_enroll_class', sa.Boolean(), nullable=False),
        sa.Column('prerequisite_course_id', sa.Integer(), nullable=True),
        sa.Column('enforce_lesson_order', sa.Boolean(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('is_mandatory', sa.Boolean(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['prerequisite_course_id'], ['courses.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['trainer_teacher_id'], ['teachers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('courses', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_courses_academic_year'), ['academic_year'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_available_from'), ['available_from'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_class_name'), ['class_name'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_code'), ['code'], unique=True)
            batch_op.create_index(batch_op.f('ix_courses_course_type'), ['course_type'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_prerequisite_course_id'), ['prerequisite_course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_section'), ['section'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_status'), ['status'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_subject'), ['subject'], unique=False)
            batch_op.create_index(batch_op.f('ix_courses_trainer_teacher_id'), ['trainer_teacher_id'], unique=False)

    if "course_sections" not in tables:
        op.create_table('course_sections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('sequence_no', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('course_sections', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_sections_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sections_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sections_sequence_no'), ['sequence_no'], unique=False)

    if "course_sessions" not in tables:
        op.create_table('course_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('mode', sa.String(), nullable=False),
        sa.Column('venue', sa.String(), nullable=True),
        sa.Column('meeting_url', sa.String(), nullable=True),
        sa.Column('batch_name', sa.String(), nullable=True),
        sa.Column('capacity', sa.Integer(), nullable=True),
        sa.Column('starts_at', sa.DateTime(), nullable=True),
        sa.Column('ends_at', sa.DateTime(), nullable=True),
        sa.Column('trainer_teacher_id', sa.Integer(), nullable=True),
        sa.Column('trainer_name_snapshot', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trainer_teacher_id'], ['teachers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('course_sessions', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_sessions_batch_name'), ['batch_name'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sessions_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sessions_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sessions_mode'), ['mode'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sessions_starts_at'), ['starts_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sessions_status'), ['status'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_sessions_trainer_teacher_id'), ['trainer_teacher_id'], unique=False)

    if "course_lessons" not in tables:
        op.create_table('course_lessons',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('section_id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('sequence_no', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('url', sa.String(), nullable=True),
        sa.Column('resource_id', sa.Integer(), nullable=True),
        sa.Column('scorm_package_id', sa.Integer(), nullable=True),
        sa.Column('online_test_id', sa.Integer(), nullable=True),
        sa.Column('assignment_id', sa.Integer(), nullable=True),
        sa.Column('session_id', sa.Integer(), nullable=True),
        sa.Column('completion_rule', sa.String(), nullable=False),
        sa.Column('is_required', sa.Boolean(), nullable=False),
        sa.Column('min_score', sa.Float(), nullable=True),
        sa.Column('estimated_minutes', sa.Integer(), nullable=True),
        sa.Column('prerequisite_lesson_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['online_test_id'], ['online_tests.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['prerequisite_lesson_id'], ['course_lessons.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resource_id'], ['learning_resources.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['scorm_package_id'], ['scorm_packages.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['course_sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('course_lessons', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_lessons_assignment_id'), ['assignment_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_completion_rule'), ['completion_rule'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_content_type'), ['content_type'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_online_test_id'), ['online_test_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_prerequisite_lesson_id'), ['prerequisite_lesson_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_resource_id'), ['resource_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_scorm_package_id'), ['scorm_package_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_section_id'), ['section_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_sequence_no'), ['sequence_no'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lessons_session_id'), ['session_id'], unique=False)

    if "course_enrollments" not in tables:
        op.create_table('course_enrollments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('student_name_snapshot', sa.String(), nullable=True),
        sa.Column('enrolled_via', sa.String(), nullable=False),
        sa.Column('enrolled_by', sa.String(), nullable=True),
        sa.Column('enrolled_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('progress_percent', sa.Float(), nullable=False),
        sa.Column('final_score', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('last_activity_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'student_id', name='uq_enrollment_course_student')
        )
        with op.batch_alter_table('course_enrollments', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_enrollments_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_enrollments_enrolled_at'), ['enrolled_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_enrollments_enrolled_via'), ['enrolled_via'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_enrollments_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_enrollments_last_activity_at'), ['last_activity_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_enrollments_status'), ['status'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_enrollments_student_id'), ['student_id'], unique=False)

    if "course_lesson_progress" not in tables:
        op.create_table('course_lesson_progress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('enrollment_id', sa.Integer(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('first_viewed_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['enrollment_id'], ['course_enrollments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lesson_id'], ['course_lessons.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('enrollment_id', 'lesson_id', name='uq_lesson_progress_enrollment_lesson')
        )
        with op.batch_alter_table('course_lesson_progress', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_lesson_progress_enrollment_id'), ['enrollment_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lesson_progress_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lesson_progress_lesson_id'), ['lesson_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_lesson_progress_status'), ['status'], unique=False)

    if "course_session_attendance" not in tables:
        op.create_table('course_session_attendance',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('enrollment_id', sa.Integer(), nullable=False),
        sa.Column('attended', sa.Boolean(), nullable=False),
        sa.Column('marked_by', sa.String(), nullable=True),
        sa.Column('marked_at', sa.DateTime(), nullable=True),
        sa.Column('remarks', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['enrollment_id'], ['course_enrollments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['course_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'enrollment_id', name='uq_session_attendance_enrollment')
        )
        with op.batch_alter_table('course_session_attendance', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_session_attendance_attended'), ['attended'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_session_attendance_enrollment_id'), ['enrollment_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_session_attendance_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_session_attendance_session_id'), ['session_id'], unique=False)

    if "course_feedback" not in tables:
        op.create_table('course_feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('student_name_snapshot', sa.String(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'student_id', name='uq_course_feedback_student')
        )
        with op.batch_alter_table('course_feedback', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_feedback_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_feedback_created_at'), ['created_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_feedback_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_feedback_student_id'), ['student_id'], unique=False)

    if "course_notes" not in tables:
        op.create_table('course_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=True),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lesson_id'], ['course_lessons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('course_notes', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_course_notes_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_notes_created_at'), ['created_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_notes_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_notes_lesson_id'), ['lesson_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_course_notes_student_id'), ['student_id'], unique=False)

    if "discussion_topics" not in tables:
        op.create_table('discussion_topics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('academic_year', sa.String(), nullable=True),
        sa.Column('class_name', sa.String(), nullable=True),
        sa.Column('section', sa.String(), nullable=True),
        sa.Column('subject', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('resource_id', sa.Integer(), nullable=True),
        sa.Column('course_id', sa.Integer(), nullable=True),
        sa.Column('lesson_id', sa.Integer(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_by_name', sa.String(), nullable=False),
        sa.Column('created_by_role', sa.String(), nullable=False),
        sa.Column('is_staff', sa.Boolean(), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False),
        sa.Column('is_locked', sa.Boolean(), nullable=False),
        sa.Column('post_count', sa.Integer(), nullable=False),
        sa.Column('last_post_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['lesson_id'], ['course_lessons.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resource_id'], ['learning_resources.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('discussion_topics', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_discussion_topics_academic_year'), ['academic_year'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_class_name'), ['class_name'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_course_id'), ['course_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_created_at'), ['created_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_created_by_user_id'), ['created_by_user_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_is_pinned'), ['is_pinned'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_last_post_at'), ['last_post_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_lesson_id'), ['lesson_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_resource_id'), ['resource_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_section'), ['section'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_topics_subject'), ['subject'], unique=False)

    if "discussion_posts" not in tables:
        op.create_table('discussion_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('topic_id', sa.Integer(), nullable=False),
        sa.Column('parent_post_id', sa.Integer(), nullable=True),
        sa.Column('author_user_id', sa.Integer(), nullable=True),
        sa.Column('author_name', sa.String(), nullable=False),
        sa.Column('author_role', sa.String(), nullable=False),
        sa.Column('is_staff', sa.Boolean(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_hidden', sa.Boolean(), nullable=False),
        sa.Column('hidden_by', sa.String(), nullable=True),
        sa.Column('hidden_at', sa.DateTime(), nullable=True),
        sa.Column('hidden_reason', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['parent_post_id'], ['discussion_posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['topic_id'], ['discussion_topics.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('discussion_posts', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_discussion_posts_author_user_id'), ['author_user_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_posts_created_at'), ['created_at'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_posts_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_posts_is_hidden'), ['is_hidden'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_posts_parent_post_id'), ['parent_post_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_discussion_posts_topic_id'), ['topic_id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    # Reverse order: children before the tables they reference.
    for table in reversed(NEW_TABLES):
        if table in tables:
            op.drop_table(table)
