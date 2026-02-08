"""Add Availability table for player time tracking"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202502070001"
down_revision = "202405260002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create Availability table
    op.create_table(
        "Availability",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("userId", sa.String(), sa.ForeignKey(
            "User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("groupId", sa.String(), sa.ForeignKey(
            "Group.id", ondelete="CASCADE"), nullable=False),
        sa.Column("startDateTime", sa.DateTime(), nullable=False),
        sa.Column("endDateTime", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updatedAt", sa.DateTime(), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint('"endDateTime" > "startDateTime"',
                           name="check_availability_end_after_start")
    )

    # Create indexes for efficient querying
    op.create_index(
        "ix_availability_group_start",
        "Availability",
        ["groupId", "startDateTime"],
    )

    # Create unique composite index to prevent duplicate entries
    op.create_index(
        "ix_availability_user_group_start_unique",
        "Availability",
        ["userId", "groupId", "startDateTime"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_availability_user_group_start_unique",
                  table_name="Availability")
    op.drop_index("ix_availability_group_start", table_name="Availability")
    op.drop_table("Availability")
