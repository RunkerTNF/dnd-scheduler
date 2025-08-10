import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _: Request,
  { params }: { params: { groupId: string; userId: string } }
) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  const group = await prisma.group.findUnique({
    where: { id: params.groupId },
  });
  if (!group || group.ownerId !== me?.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.membership.delete({
    where: {
      userId_groupId: { userId: params.userId, groupId: params.groupId },
    },
  });
  return NextResponse.json({ ok: true });
}
