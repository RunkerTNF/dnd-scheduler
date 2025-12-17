"""Initial database schema for DnD Scheduler"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202405260001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "User",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("emailVerified", sa.DateTime(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("image", sa.String(), nullable=True),
        sa.Column("isGM", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("passwordHash", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "Group",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("ownerId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "Membership",
        sa.Column("userId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("groupId", sa.String(), sa.ForeignKey("Group.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default=sa.text("'player'")),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "Invite",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("groupId", sa.String(), sa.ForeignKey("Group.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("usesLeft", sa.Integer(), nullable=True),
        sa.Column("expiresAt", sa.DateTime(), nullable=True),
        sa.Column("createdBy", sa.String(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("token"),
    )

    op.create_table(
        "Event",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("groupId", sa.String(), sa.ForeignKey("Group.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheduledAt", sa.DateTime(), nullable=False),
        sa.Column("durationMinutes", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("createdBy", sa.String(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("Event")
    op.drop_table("Invite")
    op.drop_table("Membership")
    op.drop_table("Group")
    op.drop_table("User")
