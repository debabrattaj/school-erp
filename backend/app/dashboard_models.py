"""Model(s) backing the custom dashboard builder.

Kept in its own module (rather than models.py) and imported from the dashboard
route, which loads before ``Base.metadata.create_all`` in main.py — so the table
is auto-created on startup for every tenant DB, no manual migration needed.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text

from app.database import Base


class DashboardLayout(Base):
    """A user's custom dashboard: the JSON list of widget configs. One row per
    user so their layout follows them across devices."""

    __tablename__ = "dashboard_layouts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    widgets = Column(Text, nullable=True)  # JSON array of widget configs
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
