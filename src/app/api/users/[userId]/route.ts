// src/app/api/users/[userId]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const includeGroups = url.searchParams
    .get("include")
    ?.split(",")
    .includes("groups");

  // только сам пользователь или глобальный ГМ
  const isSelf = me.id === params.userId;
  if (!isSelf && !me.isGM) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      isGM: true,
      createdAt: true,
      updatedAt: true,
      ...(includeGroups
        ? {
            memberships: {
              select: {
                groupId: true,
                role: true,
                group: { select: { id: true, name: true, ownerId: true } },
              },
            },
          }
        : {}),
    },
  });

  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
