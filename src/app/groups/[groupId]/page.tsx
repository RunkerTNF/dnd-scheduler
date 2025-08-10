"use client";
import { useEffect, useMemo, useState } from "react";
import { Calendar, momentLocalizer, SlotInfo, Views } from "react-big-calendar";
import moment from "moment-timezone";
import "react-big-calendar/lib/css/react-big-calendar.css";
import Link from "next/link";
import { useRouter } from "next/navigation";

const localizer = momentLocalizer(moment);

type Av = {
  id: string;
  userId: string;
  groupId: string;
  startTime: string;
  endTime: string;
  tz: string;
};
type Member = { id: string; name: string | null; email?: string };
type Invite = {
  id: string;
  token: string;
  usesLeft: number | null;
  expiresAt: string | null;
};

type GroupDetails = {
  id: string;
  name: string;
  memberships: { user: { id: string; name: string | null } }[];
  invites: Invite[];
};

export default function GroupPage({ params }: { params: { groupId: string } }) {
  const [access, setAccess] = useState<"unknown" | "ok" | "forbidden">(
    "unknown"
  );
  const [av, setAv] = useState<Av[]>([]);
  const [tz, setTz] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myId, setMyId] = useState<string | null>(null); // нужен для UI-подсветки/проверок
  const [groupName, setGroupName] = useState<string>("");
  const router = useRouter();

  // Контролируем календарь (исправляет неработающие кнопки вида/навигации)
  const [view, setView] = useState<"month" | "week" | "day" | "agenda">("week");
  const [date, setDate] = useState<Date>(new Date());
  const [canManage, setCanManage] = useState<boolean>(false);

  const PALETTE = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
  ];

  function hashToIndex(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % PALETTE.length;
  }

  function colorForUser(userId?: string) {
    if (!userId) return "#7f7f7f";
    return PALETTE[hashToIndex(userId)];
  }

  useEffect(() => {
    moment.tz.setDefault(tz);
  }, [tz]);

  useEffect(() => {
    // детали группы: участники + инвайты
    fetch(`/api/groups/${params.groupId}`)
      .then((r) => r.json())
      .then((g: GroupDetails) => {
        setMembers(
          g.memberships?.map((m) => ({ id: m.user.id, name: m.user.name })) ??
            []
        );
        setInvites(g.invites ?? []);
        setGroupName(g.name);
      });

    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s?.user?.id) return;
        setMyId(s.user.id);
        return fetch(`/api/users/${s.user.id}`);
      })
      .then((res) => res?.ok && res.json())
      .then((user) => {
        if (user) setCanManage(user.isGM);
      });

    // доступности
    fetch(`/api/groups/${params.groupId}/availability`)
      .then((r) => r.json())
      .then(setAv);
  }, [params.groupId]);

  // события для календаря: кладём id и userId в resource, чтобы потом удалять
  const events = useMemo(
    () =>
      Array.isArray(av)
        ? av.map((a) => ({
            start: new Date(a.startTime),
            end: new Date(a.endTime),
            title: members.find((m) => m.id === a.userId)?.name || "Игрок",
            resource: { id: a.id, userId: a.userId },
          }))
        : [],
    [av, members]
  );

  const onSelectSlot = async (slot: SlotInfo) => {
    const payload = {
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      tz,
    };
    const r = await fetch(`/api/groups/${params.groupId}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const data = await r.json();
      setAv((prev) => [...prev, data]);
    }
  };

  // Удаление интервала: по клику на событие
  const onSelectEvent = async (event: any) => {
    const slotId: string | undefined = event?.resource?.id;
    const ownerId: string | undefined = event?.resource?.userId;
    if (!slotId) return;

    // Мягкая проверка на клиенте (реальные права проверит сервер)
    const isMine = myId && ownerId && myId === ownerId;
    const ok = confirm(
      isMine
        ? "Удалить свой интервал?"
        : "Удалить интервал игрока? (нужно право ГМа)"
    );
    if (!ok) return;

    const r = await fetch(`/api/groups/${params.groupId}/availability`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId }),
    });
    if (r.ok) {
      setAv((prev) => prev.filter((x) => x.id !== slotId));
    } else if (r.status === 403) {
      alert("Недостаточно прав для удаления этого интервала.");
    } else {
      alert("Не удалось удалить интервал.");
    }
  };

  async function createInvite() {
    const usesLeftRaw = prompt("Сколько использований? Пусто = бесконечно", "");
    const usesLeft = usesLeftRaw ? Number(usesLeftRaw) : null;
    const expiresRaw = prompt(
      "Срок действия (ISO), напр. 2030-01-01T00:00:00Z. Пусто = без срока",
      ""
    );
    const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

    const r = await fetch(`/api/groups/${params.groupId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usesLeft, expiresAt }),
    });
    if (!r.ok) {
      alert("Не удалось создать инвайт (нужны права ГМа)");
      return;
    }
    const inv = await r.json();
    setInvites((prev) => [inv, ...prev]);
    const url = `${location.origin}${inv.url}`;
    await navigator.clipboard.writeText(url);
    alert("Ссылка скопирована: " + url);
  }

  async function deleteInvite(inviteId: string) {
    const r = await fetch(`/api/invites/${inviteId}`, { method: "DELETE" });
    if (r.ok) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } else if (r.status === 403) {
      alert("Удалять инвайты может только владелец группы или ГМ.");
    } else {
      alert("Не удалось удалить инвайт.");
    }
  }

  function fullInviteUrl(inv: Invite & { url?: string }) {
    return `${location.origin}/join?token=${inv.token}`;
  }

  const deleteGroup = async () => {
    if (!confirm("Удалить группу?")) return;
    const res = await fetch(`/api/groups/${params.groupId}`, {
      method: "DELETE",
    });
    if (res.ok) router.push("/groups");
  };

  async function kickUser(userId: string) {
    if (!confirm("Исключить игрока из группы?")) return;
    const r = await fetch(`/api/groups/${params.groupId}/members/${userId}`, {
      method: "DELETE",
    });
    if (r.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      // и чистим его слоты из календаря
      setAv((prev) => prev.filter((a) => a.userId !== userId));
    } else if (r.status === 403) {
      alert("Недостаточно прав.");
    } else if (r.status === 400) {
      const j = await r.json().catch(() => ({}));
      alert(
        j?.error === "cannot_kick_owner"
          ? "Нельзя кикать владельца группы."
          : "Не удалось исключить пользователя."
      );
    } else {
      alert("Не удалось исключить пользователя.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Верхняя панель: назад, TZ, инвайт, назначить/удалить игру */}
      <div className="flex items-center justify-between mb-2">
        <Link href="/groups" className="text-sm text-gray-600 hover:underline">
          ← Назад к списку групп
        </Link>
        <h1 className="text-lg font-bold">{groupName || "Группа"}</h1>
        <div className="flex items-center gap-3">
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
              Авто
            </option>
            <option value="Europe/Moscow">Europe/Moscow</option>
            <option value="UTC">UTC</option>
          </select>

          {canManage && (
            <button
              onClick={createInvite}
              className="rounded border px-3 py-1.5 dnd-btn"
            >
              Создать инвайт
            </button>
          )}

          {canManage && (
            <button
              onClick={async () => {
                const title =
                  prompt("Название события", "DnD Session") || "DnD Session";
                const startISO =
                  prompt("Начало (ISO UTC)", new Date().toISOString()) ||
                  new Date().toISOString();
                const duration = Number(
                  prompt("Длительность (мин)", "180") || "180"
                );
                const r = await fetch(`/api/groups/${params.groupId}/events`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    scheduledAtUTC: startISO,
                    durationMinutes: duration,
                    title,
                  }),
                });
                const d = await r.json();
                if (d?.ics) {
                  const blob = new Blob([d.ics], { type: "text/calendar" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "session.ics";
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              className="rounded bg-black px-3 py-1.5 text-white dnd-btn"
            >
              Назначить игру (.ics)
            </button>
          )}
          {canManage && (
            <button
              onClick={deleteGroup}
              className="rounded bg-red-600 text-white px-3 py-1.5 dnd-btn"
            >
              Удалить группу
            </button>
          )}
        </div>
      </div>

      {/* 2-колоночный лэйаут: слева календарь, справа игроки + инвайты */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Calendar
            localizer={localizer}
            events={events}
            selectable
            onSelectSlot={onSelectSlot}
            onSelectEvent={onSelectEvent}
            step={15}
            timeslots={2}
            view={view}
            onView={(v) => setView(v as any)}
            views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
            date={date}
            onNavigate={(d) => setDate(d)}
            defaultView="month"
            style={{ height: 640 }}
            eventPropGetter={(event) => {
              const uid = event?.resource?.userId as string | undefined;
              const mine = myId && uid === myId;
              const bg = colorForUser(uid);
              return {
                style: {
                  backgroundColor: bg,
                  borderColor: bg,
                  opacity: mine ? 1 : 0.9,
                },
              };
            }}
          />
          <p className="text-sm text-gray-500 mt-2">
            Кликни и потяни по календарю, чтобы добавить своё окно доступности.
            Клик по существующему интервалу — удаление (Можно удалить только
            свой интервал).
          </p>
        </div>

        <aside className="space-y-6">
          <section className="rounded border p-3">
            <h3 className="font-semibold mb-2">Игроки</h3>
            <ul className="text-sm space-y-1">
              {members.length ? (
                members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: colorForUser(m.id) }}
                    />
                    <span>{m.name || "Игрок"}</span>
                    {canManage && m.id !== myId && (
                      <button
                        className="dnd-btn dnd-btn--danger"
                        onClick={() => kickUser(m.id)}
                      >
                        Исключить
                      </button>
                    )}
                  </li>
                ))
              ) : (
                <li className="text-gray-500">
                  Пока пусто. Создай инвайт и отправь ссылку.
                </li>
              )}
            </ul>
          </section>

          <section className="rounded border p-3">
            <h3 className="font-semibold mb-2">Инвайты</h3>
            <div className="space-y-2">
              {invites.length ? (
                invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="text-sm flex items-center justify-between gap-2"
                  >
                    <code className="truncate flex-1">
                      {fullInviteUrl(inv)}
                    </code>
                    <button
                      className="border rounded px-2 py-1 dnd-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(fullInviteUrl(inv));
                        alert("Скопировано");
                      }}
                    >
                      Копировать
                    </button>
                    {canManage && (
                      <button
                        className="border rounded px-2 py-1 text-red-600 dnd-btn"
                        onClick={() => {
                          if (confirm("Удалить этот инвайт?"))
                            deleteInvite(inv.id);
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Инвайтов пока нет.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
