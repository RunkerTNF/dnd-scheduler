import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import {
  Key,
  ReactElement,
  JSXElementConstructor,
  ReactNode,
  ReactPortal,
  AwaitedReactNode,
} from "react";

type Group = {
  id: Key | null | undefined;
  name:
    | string
    | number
    | bigint
    | boolean
    | ReactElement<any, string | JSXElementConstructor<any>>
    | Iterable<ReactNode>
    | ReactPortal
    | Promise<AwaitedReactNode>
    | null
    | undefined;
};

export default async function Groups() {
  const session = await auth();
  if (!session?.user?.email) return <p>Нужно войти.</p>;
  const me = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name ?? "" },
  });
  noStore();
  const groups = await prisma.group.findMany({
    where: { memberships: { some: { userId: me.id } } },
  });

  return (
    <div className="space-y-6">
      {me.isGM ? (
        <form
          className="flex gap-2"
          action={async (formData) => {
            "use server";
            const name = String(formData.get("name") || "Новая группа");
            await prisma.group.create({
              data: {
                name,
                ownerId: me.id,
                memberships: { create: { userId: me.id, role: "gm" } },
              },
            });
          }}
        >
          <input
            name="name"
            placeholder="Название группы"
            className="border px-3 py-2 rounded w-64"
          />
          <button className="rounded bg-black px-4 py-2 text-white dnd-btn">
            Создать
          </button>
        </form>
      ) : (
        <div className="rounded border p-3 text-sm text-gray-600">
          Только ГМ может создавать группы. Попроси ГМа выдать права или
          пригласить по инвайт-ссылке.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group: Group) => (
          <Link
            key={group.id}
            href={`/groups/${group.id}`}
            className="rounded border p-4 hover:bg-gray-50 dnd-group-card"
          >
            <h3 className="font-semibold">{group.name}</h3>
            <p className="text-sm text-gray-600">Нажми, чтобы открыть</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
