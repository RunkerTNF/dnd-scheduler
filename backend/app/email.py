from __future__ import annotations

import resend

from app.config import Settings

FROM_ADDRESS = "DnD Scheduler <noreply@registering.runker.ru>"


def _render(*, heading: str, intro: str, button_text: str, button_url: str, footer: str) -> str:
    """Общий каркас письма: карточка с заголовком, текстом, кнопкой и подписью."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
    </head>
    <body style="font-family: sans-serif; background: #f9f9f9; padding: 32px;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <h2 style="margin-top: 0; color: #1a1a1a;">{heading}</h2>
        <p style="color: #444;">{intro}</p>
        <a href="{button_url}"
           style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
          {button_text}
        </a>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">
          {footer}
        </p>
      </div>
    </body>
    </html>
    """


def _send(*, to_email: str, subject: str, html: str, settings: Settings) -> None:
    resend.api_key = settings.resend_api_key

    resend.Emails.send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": subject,
        "html": html,
    })


def send_verification_email(to_email: str, token: str, settings: Settings) -> None:
    html = _render(
        heading="Подтвердите ваш email",
        intro="Для завершения регистрации нажмите кнопку ниже. Ссылка действительна 24 часа.",
        button_text="Подтвердить email",
        button_url=f"{settings.frontend_url}/verify-email?token={token}",
        footer="Если вы не регистрировались — просто проигнорируйте это письмо.",
    )
    _send(
        to_email=to_email,
        subject="Подтвердите ваш email — DnD Scheduler",
        html=html,
        settings=settings,
    )


def send_password_reset_email(to_email: str, token: str, settings: Settings) -> None:
    html = _render(
        heading="Сброс пароля",
        intro="Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действительна 1 час.",
        button_text="Задать новый пароль",
        button_url=f"{settings.frontend_url}/reset-password?token={token}",
        footer=(
            "Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо, "
            "пароль останется прежним."
        ),
    )
    _send(
        to_email=to_email,
        subject="Сброс пароля — DnD Scheduler",
        html=html,
        settings=settings,
    )


def send_password_setup_email(to_email: str, token: str, settings: Settings) -> None:
    """Разовое письмо тем, кто заходил через Google: у них нет пароля."""
    html = _render(
        heading="Вход через Google отключён",
        intro=(
            "Раньше вы заходили в DnD Scheduler через Google. Этот способ входа отключён, "
            "поэтому для вашего аккаунта нужно задать пароль — нажмите кнопку ниже. "
            "Ссылка действительна 7 дней. После этого можно входить по email с паролем "
            "или через Яндекс ID."
        ),
        button_text="Установить пароль",
        button_url=f"{settings.frontend_url}/reset-password?token={token}",
        footer=(
            "Если ссылка перестала работать, откройте страницу входа и нажмите "
            "«Забыли пароль?» — придёт новое письмо."
        ),
    )
    _send(
        to_email=to_email,
        subject="Установите пароль для входа — DnD Scheduler",
        html=html,
        settings=settings,
    )
