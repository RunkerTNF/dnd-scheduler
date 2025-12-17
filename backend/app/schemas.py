from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class InviteSchema(BaseModel):
    id: str
    groupId: str
    token: str
    usesLeft: Optional[int]
    expiresAt: Optional[datetime]
    createdBy: Optional[str]
    createdAt: datetime

    model_config = {
        "from_attributes": True,
    }


class EventSchema(BaseModel):
    id: str
    groupId: str
    scheduledAt: datetime
    durationMinutes: int
    title: str
    notes: Optional[str]
    createdBy: Optional[str]
    createdAt: datetime

    model_config = {
        "from_attributes": True,
    }


class MembershipUserSchema(BaseModel):
    id: str
    email: str
    name: Optional[str]
    image: Optional[str]
    isGM: bool

    model_config = {
        "from_attributes": True,
    }


class MembershipSchema(BaseModel):
    userId: str
    groupId: str
    role: str
    createdAt: datetime
    user: MembershipUserSchema

    model_config = {
        "from_attributes": True,
    }


class GroupBaseSchema(BaseModel):
    id: str
    ownerId: str
    name: str
    description: Optional[str]
    createdAt: datetime

    model_config = {
        "from_attributes": True,
    }


class GroupDetailSchema(GroupBaseSchema):
    memberships: list[MembershipSchema]
    invites: list[InviteSchema]
    events: list[EventSchema]


class GroupCreateSchema(BaseModel):
    name: str
    description: Optional[str] = None


class JoinRequestSchema(BaseModel):
    token: str


class JoinResponseSchema(BaseModel):
    ok: bool
    groupId: str


class UserGroupMembershipSchema(BaseModel):
    groupId: str
    role: str
    group: GroupBaseSchema

    model_config = {
        "from_attributes": True,
    }


class UserSchema(BaseModel):
    id: str
    email: str
    name: Optional[str]
    image: Optional[str]
    isGM: bool
    createdAt: datetime
    updatedAt: datetime
    memberships: Optional[list[UserGroupMembershipSchema]] = Field(default=None)

    model_config = {
        "from_attributes": True,
    }
