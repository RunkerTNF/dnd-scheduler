from __future__ import annotations

import resend

from app.config import Settings


def send_verification_email(to_email: str, token: str, settings: Settings) -> None:
    resend.api_key = settings.resend_api_key

    verify_url = f"{settings.frontend_url}/verify-email?token={token}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
    </head>
    <body style="font-family: sans-serif; background: #f9f9f9; padding: 32px;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <h2 style="margin-top: 0; color: #1a1a1a;">Подтвердите ваш email</h2>
        <p style="color: #444;">Для завершения регистрации нажмите кнопку ниже. Ссылка действительна 24 часа.</p>
        <a href="{verify_url}"
           style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Подтвердить email
        </a>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">
          Если вы не регистрировались — просто проигнорируйте это письмо.
        </p>
      </div>
    </body>
    </html>
    """

    resend.Emails.send({
        "from": "DnD Scheduler <noreply@runker.ru>",
        "to": [to_email],
        "subject": "Подтвердите ваш email — DnD Scheduler",
        "html": html_body,
    })
