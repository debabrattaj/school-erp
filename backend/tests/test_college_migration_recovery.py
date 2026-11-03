"""Reproduce Passenger creating tables before Alembic upgrades the release."""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


@pytest.mark.parametrize("existing", ["all", "partial", "none"])
def test_college_migrations_preserve_existing_tables(tmp_path, existing):
    from app.database import Base
    from app import models

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'recovery.db'}")
    Base.metadata.create_all(engine)
    tables = ["experiential_log_entries", "placement_offers", "placement_recruiters", "semester_results", "experiential_learning", "academic_milestones"]
    with engine.begin() as connection:
        if existing == "none":
            for name in tables:
                Base.metadata.tables[name].drop(connection)
        elif existing == "partial":
            for name in tables[:3]:
                Base.metadata.tables[name].drop(connection)
        connection.execute(models.Student.__table__.insert().values(id=1, admission_no="KEEP-1", first_name="Existing student"))
        if existing != "none":
            connection.execute(models.ExperientialLearning.__table__.insert().values(
                id=1, student_id=1, experience_type="Internship", title="Keep this record",
            ))
        operations = Operations(MigrationContext.configure(connection))
        filenames = [
            "f9b0c1d2e3f4_add_college_academic_fields.py",
            "fa0b1c2d3e4f_add_college_outcomes.py",
            "fb0c1d2e3f4a_add_experiential_logbook.py",
            "fd2e3f4a5b6c_add_academic_milestones.py",
        ]
        for filename in filenames:
            path = Path(__file__).parents[1] / "alembic/versions" / filename
            spec = importlib.util.spec_from_file_location(filename, path)
            migration = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(migration)
            migration.op = operations
            migration.upgrade()
            migration.upgrade()
        assert set(tables) <= set(sa.inspect(connection).get_table_names())
        if existing != "none":
            assert connection.execute(sa.text("SELECT title FROM experiential_learning WHERE id=1")).scalar() == "Keep this record"
        assert len(sa.inspect(connection).get_indexes("experiential_learning")) >= 4
    engine.dispose()
