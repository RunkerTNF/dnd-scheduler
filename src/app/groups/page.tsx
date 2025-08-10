import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { unstable_noStore as noStore, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function Groups() {
  const session = await auth();
  if (!session?.user?.email) return <p>Нужно войти.</p>;

  // гарантируем наличие пользователя
  const me = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name ?? "" },
  });

  // выключаем кэш для этой страницы
  noStore();

  const groups = await prisma.group.findMany({
    where: { memberships: { some: { userId: me.id } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  async function createGroup(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "Новая группа");

    await prisma.group.create({
      data: {
        name,
        ownerId: me.id,
        memberships: { create: { userId: me.id, role: "gm" } },
      },
    });

    // обновляем список и шлём пользователя обратно на страницу (SSR refetch)
    revalidatePath("/groups");
    redirect("/groups");
  }

  return (
    <div className="space-y-6">
      {me.isGM ? (
        <form className="flex gap-2" action={createGroup}>
          <input
            name="name"
            placeholder="Название группы"
            className="dnd-input w-64"
          />
          <button className="dnd-btn">Создать</button>
        </form>
      ) : (
        <div className="dnd-card p-3 text-sm text-gray-700">
          Только ГМ может создавать группы. Попроси ГМа выдать права или
          пригласить по инвайт-ссылке.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <Link
            key={group.id}
            href={`/groups/${group.id}`}
            className="dnd-group-card block hover:translate-y-[-1px]"
          >
            <h3 className="dnd-group-card__title">
              {group.name || "Безымянная группа"}
            </h3>
            <p className="dnd-group-card__meta">Нажми, чтобы открыть</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
