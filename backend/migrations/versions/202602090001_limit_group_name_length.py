"""Limit Group name length to 35 characters"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202602090001"
down_revision = "202502070001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # First, truncate any existing group names longer than 35 characters
    op.execute(
        """
        UPDATE "Group"
        SET name = SUBSTRING(name FROM 1 FOR 35)
        WHERE LENGTH(name) > 35
        """
    )

    # Then change Group.name column type from String to String(35)
    op.alter_column(
        "Group",
        "name",
        type_=sa.String(35),
        existing_type=sa.String(),
        nullable=False,
    )


def downgrade() -> None:
    # Revert Group.name column back to unlimited String
    op.alter_column(
        "Group",
        "name",
        type_=sa.String(),
        existing_type=sa.String(35),
        nullable=False,
    )
