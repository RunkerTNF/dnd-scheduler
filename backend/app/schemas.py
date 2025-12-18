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
