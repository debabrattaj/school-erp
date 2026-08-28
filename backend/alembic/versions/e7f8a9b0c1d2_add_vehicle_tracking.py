"""add vehicle tracking tables and transport_stops coordinates

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-08-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # transport_stops gains coordinates. Nullable: a school that has not
    # geocoded its stops keeps working, with arrivals recorded by hand.
    if "transport_stops" in tables:
        columns = {c["name"] for c in inspector.get_columns("transport_stops")}
        with op.batch_alter_table("transport_stops") as batch:
            if "latitude" not in columns:
                batch.add_column(sa.Column("latitude", sa.Float(), nullable=True))
            if "longitude" not in columns:
                batch.add_column(sa.Column("longitude", sa.Float(), nullable=True))

    if "tracker_devices" not in tables:
        op.create_table(
            "tracker_devices",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("device_uid", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("vendor", sa.String(), nullable=True),
            sa.Column("model", sa.String(), nullable=True),
            sa.Column("vehicle_id", sa.Integer(), nullable=True),
            sa.Column("auth_token_hash", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["vehicle_id"], ["transport_vehicles.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("device_uid", name="uq_tracker_device_uid"),
        )
        op.create_index("ix_tracker_devices_device_uid", "tracker_devices", ["device_uid"])
        op.create_index("ix_tracker_devices_vehicle_id", "tracker_devices", ["vehicle_id"])

    if "vehicle_trips" not in tables:
        op.create_table(
            "vehicle_trips",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vehicle_id", sa.Integer(), nullable=False),
            sa.Column("route_id", sa.Integer(), nullable=True),
            sa.Column("trip_date", sa.Date(), nullable=False),
            sa.Column("direction", sa.String(), nullable=False, server_default="Pickup"),
            sa.Column("status", sa.String(), nullable=False, server_default="Scheduled"),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("ended_at", sa.DateTime(), nullable=True),
            sa.Column("driver_name", sa.String(), nullable=True),
            sa.Column("driver_phone", sa.String(), nullable=True),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["vehicle_id"], ["transport_vehicles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["route_id"], ["transport_routes.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("vehicle_id", "trip_date", "direction", name="uq_vehicle_trip_run"),
        )
        op.create_index("ix_vehicle_trips_vehicle_id", "vehicle_trips", ["vehicle_id"])
        op.create_index("ix_vehicle_trips_route_id", "vehicle_trips", ["route_id"])
        op.create_index("ix_vehicle_trips_trip_date", "vehicle_trips", ["trip_date"])
        op.create_index("ix_vehicle_trips_direction", "vehicle_trips", ["direction"])
        op.create_index("ix_vehicle_trips_status", "vehicle_trips", ["status"])

    if "vehicle_locations" not in tables:
        op.create_table(
            "vehicle_locations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vehicle_id", sa.Integer(), nullable=False),
            sa.Column("device_id", sa.Integer(), nullable=True),
            sa.Column("trip_id", sa.Integer(), nullable=True),
            sa.Column("recorded_at", sa.DateTime(), nullable=False),
            sa.Column("received_at", sa.DateTime(), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("speed_kmph", sa.Float(), nullable=True),
            sa.Column("heading", sa.Float(), nullable=True),
            sa.Column("accuracy_m", sa.Float(), nullable=True),
            sa.ForeignKeyConstraint(["vehicle_id"], ["transport_vehicles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["device_id"], ["tracker_devices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["trip_id"], ["vehicle_trips.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("vehicle_id", "recorded_at", name="uq_vehicle_location_fix"),
        )
        op.create_index("ix_vehicle_locations_vehicle_id", "vehicle_locations", ["vehicle_id"])
        op.create_index("ix_vehicle_locations_device_id", "vehicle_locations", ["device_id"])
        op.create_index("ix_vehicle_locations_trip_id", "vehicle_locations", ["trip_id"])
        op.create_index("ix_vehicle_locations_recorded_at", "vehicle_locations", ["recorded_at"])

    if "trip_stop_events" not in tables:
        op.create_table(
            "trip_stop_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("trip_id", sa.Integer(), nullable=False),
            sa.Column("stop_id", sa.Integer(), nullable=False),
            sa.Column("arrived_at", sa.DateTime(), nullable=True),
            sa.Column("departed_at", sa.DateTime(), nullable=True),
            sa.Column("detected_by", sa.String(), nullable=False, server_default="geofence"),
            sa.Column("scheduled_time", sa.String(), nullable=True),
            sa.Column("delay_minutes", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["trip_id"], ["vehicle_trips.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["stop_id"], ["transport_stops.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("trip_id", "stop_id", name="uq_trip_stop_event"),
        )
        op.create_index("ix_trip_stop_events_trip_id", "trip_stop_events", ["trip_id"])
        op.create_index("ix_trip_stop_events_stop_id", "trip_stop_events", ["stop_id"])

    if "transport_alerts" not in tables:
        op.create_table(
            "transport_alerts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vehicle_id", sa.Integer(), nullable=False),
            sa.Column("trip_id", sa.Integer(), nullable=True),
            sa.Column("alert_type", sa.String(), nullable=False),
            sa.Column("severity", sa.String(), nullable=False, server_default="Warning"),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("acknowledged_by", sa.String(), nullable=True),
            sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["vehicle_id"], ["transport_vehicles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["trip_id"], ["vehicle_trips.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_transport_alerts_vehicle_id", "transport_alerts", ["vehicle_id"])
        op.create_index("ix_transport_alerts_trip_id", "transport_alerts", ["trip_id"])
        op.create_index("ix_transport_alerts_alert_type", "transport_alerts", ["alert_type"])
        op.create_index("ix_transport_alerts_occurred_at", "transport_alerts", ["occurred_at"])

    if "tracking_config" not in tables:
        op.create_table(
            "tracking_config",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("geofence_radius_m", sa.Integer(), nullable=False, server_default="150"),
            sa.Column("over_speed_kmph", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("stale_after_minutes", sa.Integer(), nullable=False, server_default="10"),
            sa.Column("retain_locations_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Children before parents: locations and events point at trips.
    for table in (
        "tracking_config", "transport_alerts", "trip_stop_events",
        "vehicle_locations", "vehicle_trips", "tracker_devices",
    ):
        if table in tables:
            op.drop_table(table)

    if "transport_stops" in tables:
        columns = {c["name"] for c in inspector.get_columns("transport_stops")}
        with op.batch_alter_table("transport_stops") as batch:
            if "longitude" in columns:
                batch.drop_column("longitude")
            if "latitude" in columns:
                batch.drop_column("latitude")
