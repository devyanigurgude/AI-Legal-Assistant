"""add analysis jsonb column to contracts

Revision ID: 20260303_0002
Revises:
Create Date: 2026-03-03
"""

from alembic import op


revision = "20260303_0002"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.contracts
        ADD COLUMN IF NOT EXISTS analysis JSONB NOT NULL DEFAULT '{}'::jsonb;
        """
    )


def downgrade() -> None:
    # Non-destructive policy for production databases.
    pass
