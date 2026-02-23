"""Add EmailVerificationToken table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202602240001"
down_revision = "202602090001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "EmailVerificationToken",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("userId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(), nullable=False, unique=True),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_EmailVerificationToken_token", "EmailVerificationToken", ["token"])


def downgrade() -> None:
    op.drop_index("ix_EmailVerificationToken_token", table_name="EmailVerificationToken")
    op.drop_table("EmailVerificationToken")
