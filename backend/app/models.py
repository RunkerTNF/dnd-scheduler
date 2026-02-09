from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    emailVerified: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    isGM: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    passwordHash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")
    groupsOwned: Mapped[list["Group"]] = relationship(back_populates="owner", foreign_keys="Group.ownerId")


class Group(Base):
    __tablename__ = "Group"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    ownerId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(35), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    owner: Mapped[User] = relationship(back_populates="groupsOwned")
    memberships: Mapped[list["Membership"]] = relationship(back_populates="group", cascade="all, delete-orphan")
    invites: Mapped[list["Invite"]] = relationship(back_populates="group", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship(back_populates="group", cascade="all, delete-orphan")
    availabilities: Mapped[list["Availability"]] = relationship(back_populates="group", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "Membership"

    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), primary_key=True)
    groupId: Mapped[str] = mapped_column(String, ForeignKey("Group.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String, default="player", nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="memberships")
    group: Mapped[Group] = relationship(back_populates="memberships")


class Invite(Base):
    __tablename__ = "Invite"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    groupId: Mapped[str] = mapped_column(String, ForeignKey("Group.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    usesLeft: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expiresAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    createdBy: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    group: Mapped[Group] = relationship(back_populates="invites")


class Event(Base):
    __tablename__ = "Event"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    groupId: Mapped[str] = mapped_column(String, ForeignKey("Group.id", ondelete="CASCADE"), nullable=False)
    scheduledAt: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    durationMinutes: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdBy: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    group: Mapped[Group] = relationship(back_populates="events")


class Availability(Base):
    __tablename__ = "Availability"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    groupId: Mapped[str] = mapped_column(String, ForeignKey("Group.id", ondelete="CASCADE"), nullable=False)
    startDateTime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    endDateTime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    user: Mapped[User] = relationship()
    group: Mapped[Group] = relationship(back_populates="availabilities")


class BlacklistedToken(Base):
    __tablename__ = "BlacklistedToken"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tokenHash: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    expiresAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)