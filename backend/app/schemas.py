from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, EmailStr


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


class InviteCreateSchema(BaseModel):
    expiresAt: Optional[datetime] = None
    usesLeft: Optional[int] = Field(default=None, ge=1)


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


class RegisterRequestSchema(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: Optional[str] = None


class LoginRequestSchema(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequestSchema(BaseModel):
    idToken: str = Field(min_length=1)


class TokenSchema(BaseModel):
    accessToken: str
    tokenType: str = "bearer"


class OAuth2TokenSchema(BaseModel):
    """OAuth2 compatible token response (for Swagger UI)."""
    access_token: str
    token_type: str = "bearer"


class AuthResponseSchema(TokenSchema):
    user: UserSchema


# Availability schemas
class AvailabilityCreateSchema(BaseModel):
    startDateTime: datetime
    endDateTime: datetime
    notes: Optional[str] = None


class AvailabilityUpdateSchema(BaseModel):
    startDateTime: Optional[datetime] = None
    endDateTime: Optional[datetime] = None
    notes: Optional[str] = None


class AvailabilitySchema(BaseModel):
    id: str
    userId: str
    groupId: str
    startDateTime: datetime
    endDateTime: datetime
    notes: Optional[str]
    createdAt: datetime
    updatedAt: datetime

    model_config = {
        "from_attributes": True,
    }


class AvailabilityWithUserSchema(AvailabilitySchema):
    user: MembershipUserSchema


# Event CRUD schemas
class EventCreateSchema(BaseModel):
    scheduledAt: datetime
    durationMinutes: int = Field(ge=30, le=720)
    title: str
    notes: Optional[str] = None


class EventUpdateSchema(BaseModel):
    scheduledAt: Optional[datetime] = None
    durationMinutes: Optional[int] = Field(default=None, ge=30, le=720)
    title: Optional[str] = None
    notes: Optional[str] = None


# Profile schemas
class ProfileUpdateSchema(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None


class ChangePasswordSchema(BaseModel):
    currentPassword: str
    newPassword: str = Field(min_length=8)
