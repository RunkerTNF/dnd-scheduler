"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function JoinPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "posting" | "error" | "unauth">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const token = sp.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Не передан token в URL.");
      return;
    }
    const run = async () => {
      setStatus("posting");
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.status === 401) {
        setStatus("unauth");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus("error");
        setMessage(err?.error || "Не удалось принять приглашение.");
        return;
      }
      const data = await res.json();
      // ожидаем { ok: true, groupId: ... }
      if (data?.groupId) router.replace(`/groups/${data.groupId}`);
      else {
        setStatus("error");
        setMessage("Ответ без groupId. Проверь сервер.");
      }
    };
    run();
  }, [sp, router]);

  if (status === "posting") {
    return <p>Присоединяем к группе…</p>;
  }

  if (status === "unauth") {
    return (
      <div className="space-y-3">
        <p>Нужно войти, чтобы присоединиться к группе.</p>
        <button
          className="rounded bg-black px-4 py-2 text-white"
          onClick={() => signIn()}
        >
          Войти
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-red-600">Ошибка: {message}</p>
        <p className="text-sm text-gray-600">
          Ссылка могла истечь или быть неверной. Попроси ГМа выдать новую.
        </p>
      </div>
    );
  }

  return null;
}
