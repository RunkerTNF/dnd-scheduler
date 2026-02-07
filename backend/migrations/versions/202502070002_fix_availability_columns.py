"""Fix Availability table columns to match model"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202502070002"
down_revision = "202502070001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clear old data (columns are incompatible)
    op.execute('DELETE FROM "Availability"')

    # Drop old columns
    op.drop_column("Availability", "date")
    op.drop_column("Availability", "startTime")
    op.drop_column("Availability", "endTime")
    op.drop_column("Availability", "tz")

    # Add new columns
    op.add_column("Availability", sa.Column("startDateTime", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    op.add_column("Availability", sa.Column("endDateTime", sa.DateTime(), nullable=False, server_default=sa.text("now() + interval '1 hour'")))
    op.add_column("Availability", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("Availability", sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")))

    # Remove server defaults (they were just for the migration)
    op.alter_column("Availability", "startDateTime", server_default=None)
    op.alter_column("Availability", "endDateTime", server_default=None)

    # Add check constraint
    op.create_check_constraint(
        "check_availability_end_after_start",
        "Availability",
        '"endDateTime" > "startDateTime"',
    )

    # Create index
    op.create_index(
        "ix_availability_group_start",
        "Availability",
        ["groupId", "startDateTime"],
    )


def downgrade() -> None:
    op.drop_index("ix_availability_group_start", table_name="Availability")
    op.drop_constraint("check_availability_end_after_start", "Availability")
    op.drop_column("Availability", "updatedAt")
    op.drop_column("Availability", "notes")
    op.drop_column("Availability", "endDateTime")
    op.drop_column("Availability", "startDateTime")
    op.add_column("Availability", sa.Column("date", sa.DateTime(), nullable=True))
    op.add_column("Availability", sa.Column("startTime", sa.DateTime(), nullable=True))
    op.add_column("Availability", sa.Column("endTime", sa.DateTime(), nullable=True))
    op.add_column("Availability", sa.Column("tz", sa.Text(), nullable=True))
