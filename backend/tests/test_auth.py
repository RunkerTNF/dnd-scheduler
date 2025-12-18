"""Tests for authentication endpoints."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.auth import verify_password


class TestRegister:
    """Tests for POST /auth/register."""

    def test_register_success(
        self, client: TestClient, db: Session, test_user_data: dict[str, Any]
    ):
        """Test successful user registration."""
        response = client.post("/auth/register", json=test_user_data)
        
        assert response.status_code == 201
        data = response.json()
        assert "accessToken" in data
        assert data["tokenType"] == "bearer"
        assert data["user"]["email"] == test_user_data["email"]
        assert data["user"]["name"] == test_user_data["name"]
        assert "id" in data["user"]
        
        # Verify user in database
        db_user = db.query(models.User).filter(
            models.User.id == data["user"]["id"]
        ).one_or_none()
        
        assert db_user is not None
        assert db_user.email == test_user_data["email"]
        assert db_user.name == test_user_data["name"]
        assert db_user.passwordHash is not None
        assert verify_password(test_user_data["password"], db_user.passwordHash)

    def test_register_duplicate_email(
        self, client: TestClient, db: Session, test_user_data: dict[str, Any]
    ):
        """Test registration with existing email fails."""
        # Register first user
        client.post("/auth/register", json=test_user_data)
        
        # Try to register with same email
        response = client.post("/auth/register", json=test_user_data)
        
        assert response.status_code == 400
        assert response.json()["detail"] == "email_exists"
        
        # Verify only one user exists in database
        users_count = db.query(models.User).filter(
            models.User.email == test_user_data["email"]
        ).count()
        assert users_count == 1

    def test_register_invalid_email(self, client: TestClient, db: Session):
        """Test registration with invalid email fails."""
        response = client.post(
            "/auth/register",
            json={
                "email": "not-an-email",
                "password": "testpassword123",
                "name": "Test",
            },
        )
        
        assert response.status_code == 422  # Validation error
        
        # Verify no user was created
        users_count = db.query(models.User).count()
        assert users_count == 0

    def test_register_short_password(self, client: TestClient, db: Session):
        """Test registration with short password fails."""
        response = client.post(
            "/auth/register",
            json={
                "email": "test@example.com",
                "password": "short",
                "name": "Test",
            },
        )
        
        assert response.status_code == 422  # Validation error
        
        # Verify no user was created
        users_count = db.query(models.User).count()
        assert users_count == 0

    def test_register_without_name(self, client: TestClient, db: Session):
        """Test registration without name succeeds (name is optional)."""
        response = client.post(
            "/auth/register",
            json={
                "email": "test@example.com",
                "password": "testpassword123",
            },
        )
        
        assert response.status_code == 201
        assert response.json()["user"]["name"] is None
        
        # Verify user in database
        db_user = db.query(models.User).filter(
            models.User.email == "test@example.com"
        ).one_or_none()
        
        assert db_user is not None
        assert db_user.name is None


class TestLogin:
    """Tests for POST /auth/login."""

    def test_login_success(
        self, client: TestClient, db: Session, registered_user: dict[str, Any]
    ):
        """Test successful login."""
        response = client.post(
            "/auth/login",
            json={
                "email": registered_user["email"],
                "password": registered_user["password"],
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert data["tokenType"] == "bearer"
        assert data["user"]["email"] == registered_user["email"]
        
        # Verify user data matches database
        db_user = db.query(models.User).filter(
            models.User.id == data["user"]["id"]
        ).one_or_none()
        
        assert db_user is not None
        assert db_user.email == data["user"]["email"]
        assert db_user.name == data["user"]["name"]

    def test_login_wrong_password(
        self, client: TestClient, registered_user: dict[str, Any]
    ):
        """Test login with wrong password fails."""
        response = client.post(
            "/auth/login",
            json={
                "email": registered_user["email"],
                "password": "wrongpassword",
            },
        )
        
        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_credentials"

    def test_login_nonexistent_user(self, client: TestClient, db: Session):
        """Test login with nonexistent email fails."""
        response = client.post(
            "/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "testpassword123",
            },
        )
        
        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_credentials"
        
        # Verify no user exists with this email
        db_user = db.query(models.User).filter(
            models.User.email == "nonexistent@example.com"
        ).one_or_none()
        assert db_user is None

    def test_login_invalid_email_format(self, client: TestClient):
        """Test login with invalid email format fails."""
        response = client.post(
            "/auth/login",
            json={
                "email": "not-an-email",
                "password": "testpassword123",
            },
        )
        
        assert response.status_code == 422


class TestOAuth2Token:
    """Tests for POST /auth/token (OAuth2 compatible, for Swagger UI)."""

    def test_token_success(
        self, client: TestClient, db: Session, registered_user: dict[str, Any]
    ):
        """Test successful OAuth2 token request."""
        response = client.post(
            "/auth/token",
            data={
                "username": registered_user["email"],
                "password": registered_user["password"],
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data  # OAuth2 uses snake_case
        assert data["token_type"] == "bearer"
        
        # Verify user exists in database
        db_user = db.query(models.User).filter(
            models.User.email == registered_user["email"]
        ).one_or_none()
        assert db_user is not None

    def test_token_wrong_password(
        self, client: TestClient, registered_user: dict[str, Any]
    ):
        """Test OAuth2 token request with wrong password fails."""
        response = client.post(
            "/auth/token",
            data={
                "username": registered_user["email"],
                "password": "wrongpassword",
            },
        )
        
        assert response.status_code == 401


class TestLogout:
    """Tests for POST /auth/logout."""

    def test_logout_success(
        self, client: TestClient, db: Session, registered_user: dict[str, Any]
    ):
        """Test successful logout."""
        headers = {"Authorization": f"Bearer {registered_user['accessToken']}"}
        
        # Verify no blacklisted tokens before logout
        blacklisted_count_before = db.query(models.BlacklistedToken).count()
        assert blacklisted_count_before == 0
        
        response = client.post("/auth/logout", headers=headers)
        
        assert response.status_code == 204
        
        # Verify token was added to blacklist
        blacklisted_count_after = db.query(models.BlacklistedToken).count()
        assert blacklisted_count_after == 1
        
        # Verify the blacklisted token has correct data
        from app.auth import get_token_hash
        token_hash = get_token_hash(registered_user["accessToken"])
        blacklisted_token = db.query(models.BlacklistedToken).filter(
            models.BlacklistedToken.tokenHash == token_hash
        ).one_or_none()
        
        assert blacklisted_token is not None
        assert blacklisted_token.expiresAt is not None

    def test_logout_invalidates_token(
        self, client: TestClient, db: Session, registered_user: dict[str, Any]
    ):
        """Test that token is invalidated after logout."""
        headers = {"Authorization": f"Bearer {registered_user['accessToken']}"}
        
        # Logout
        client.post("/auth/logout", headers=headers)
        
        # Try to use the same token
        response = client.get("/groups/", headers=headers)
        
        assert response.status_code == 401
        
        # Verify token is in blacklist
        from app.auth import get_token_hash
        token_hash = get_token_hash(registered_user["accessToken"])
        blacklisted = db.query(models.BlacklistedToken).filter(
            models.BlacklistedToken.tokenHash == token_hash
        ).one_or_none()
        assert blacklisted is not None

    def test_logout_without_token(self, client: TestClient, db: Session):
        """Test logout without token fails."""
        response = client.post("/auth/logout")
        
        assert response.status_code == 401
        
        # Verify no tokens were blacklisted
        blacklisted_count = db.query(models.BlacklistedToken).count()
        assert blacklisted_count == 0

    def test_logout_twice(
        self, client: TestClient, db: Session, registered_user: dict[str, Any]
    ):
        """Test logout twice with same token (idempotent)."""
        headers = {"Authorization": f"Bearer {registered_user['accessToken']}"}
        
        # First logout
        response1 = client.post("/auth/logout", headers=headers)
        assert response1.status_code == 204
        
        # Verify one blacklisted token
        blacklisted_count = db.query(models.BlacklistedToken).count()
        assert blacklisted_count == 1
        
        # Second logout with same token should fail (token already blacklisted)
        response2 = client.post("/auth/logout", headers=headers)
        assert response2.status_code == 401
        
        # Verify still only one blacklisted token (no duplicate)
        blacklisted_count_after = db.query(models.BlacklistedToken).count()
        assert blacklisted_count_after == 1


class TestProtectedEndpoints:
    """Tests for protected endpoints requiring authentication."""

    def test_access_protected_endpoint_with_token(
        self, client: TestClient, db: Session, auth_headers: dict[str, str]
    ):
        """Test accessing protected endpoint with valid token."""
        response = client.get("/groups/", headers=auth_headers)
        
        assert response.status_code == 200
        
        # Verify user exists and is not blacklisted
        users_count = db.query(models.User).count()
        assert users_count == 1

    def test_access_protected_endpoint_without_token(self, client: TestClient, db: Session):
        """Test accessing protected endpoint without token fails."""
        response = client.get("/groups/")
        
        assert response.status_code == 401

    def test_access_protected_endpoint_with_invalid_token(
        self, client: TestClient, db: Session
    ):
        """Test accessing protected endpoint with invalid token fails."""
        headers = {"Authorization": "Bearer invalid_token"}
        
        response = client.get("/groups/", headers=headers)
        
        assert response.status_code == 401
        
        # Verify no blacklist entry was created for invalid token
        blacklisted_count = db.query(models.BlacklistedToken).count()
        assert blacklisted_count == 0

    def test_access_protected_endpoint_with_malformed_header(self, client: TestClient):
        """Test accessing protected endpoint with malformed auth header fails."""
        headers = {"Authorization": "NotBearer token"}
        
        response = client.get("/groups/", headers=headers)
        
        assert response.status_code == 401


class TestTokenExpiration:
    """Tests for token expiration handling."""

    def test_expired_token_rejected(self, client: TestClient, db: Session):
        """Test that expired tokens are rejected."""
        from datetime import datetime, timedelta, timezone
        from jose import jwt
        from app.config import get_settings
        
        settings = get_settings()
        
        # Create an expired token
        expired_token = jwt.encode(
            {
                "userId": "fake-user-id",
                "email": "test@example.com",
                "exp": datetime.now(timezone.utc) - timedelta(hours=1),  # Expired 1 hour ago
            },
            settings.secret_key,
            algorithm=settings.algorithm,
        )
        
        headers = {"Authorization": f"Bearer {expired_token}"}
        response = client.get("/groups/", headers=headers)
        
        assert response.status_code == 401


class TestGoogleAuth:
    """Tests for Google OAuth authentication."""

    def test_google_auth_not_configured(self, client: TestClient, db: Session):
        """Test Google auth returns 503 when not configured."""
        response = client.post(
            "/auth/google",
            json={"idToken": "some_google_token"},
        )
        
        # Should return 503 if GOOGLE_CLIENT_ID is not set
        assert response.status_code == 503
        assert response.json()["detail"] == "google_auth_not_configured"
        
        # Verify no user was created
        users_count = db.query(models.User).count()
        assert users_count == 0

