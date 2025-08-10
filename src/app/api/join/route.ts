import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const me = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name ?? "" },
  });

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.invite.findUnique({ where: { token } });
    if (!inv) return { error: "invalid" as const };

    if (inv.expiresAt && inv.expiresAt < new Date()) {
      return { error: "expired" as const };
    }

    // Вставляем членство идемпотентно
    await tx.membership.createMany({
      data: [{ userId: me.id, groupId: inv.groupId, role: "player" }],
      skipDuplicates: true,
    });

    // Если лимит использований есть — декрементим, но только если > 0
    if (inv.usesLeft !== null && inv.usesLeft !== undefined) {
      const updated = await tx.invite.updateMany({
        where: { id: inv.id, usesLeft: { gt: 0 } },
        data: { usesLeft: { decrement: 1 } },
      });
      if (updated.count === 0) {
        // Лимит уже исчерпан кем-то другим
        return { error: "no_uses" as const };
      }
    }

    return { ok: true as const, groupId: inv.groupId };
  });

  if ("error" in result) {
    const code =
      result.error === "invalid"
        ? 400
        : result.error === "expired"
        ? 400
        : result.error === "no_uses"
        ? 400
        : 400;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  return NextResponse.json(result);
}
