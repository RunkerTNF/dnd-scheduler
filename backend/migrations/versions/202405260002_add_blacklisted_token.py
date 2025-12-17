"""Add BlacklistedToken table for token logout functionality"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202405260002"
down_revision = "202405260001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "BlacklistedToken",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("tokenHash", sa.String(), nullable=False, unique=True),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_BlacklistedToken_tokenHash", "BlacklistedToken", ["tokenHash"])
    op.create_index("ix_BlacklistedToken_expiresAt", "BlacklistedToken", ["expiresAt"])


def downgrade() -> None:
    op.drop_index("ix_BlacklistedToken_expiresAt", table_name="BlacklistedToken")
    op.drop_index("ix_BlacklistedToken_tokenHash", table_name="BlacklistedToken")
    op.drop_table("BlacklistedToken")

