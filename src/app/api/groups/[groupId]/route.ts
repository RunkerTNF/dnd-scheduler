import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ensureMember(userEmail: string, groupId: string) {
  const me = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!me) return null;
  const m = await prisma.membership.findUnique({
    where: { userId_groupId: { userId: me.id, groupId } },
  });
  return m ? me : null;
}

export async function GET(
  _: Request,
  { params }: { params: { groupId: string } }
) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ok = await ensureMember(session.user.email, params.groupId);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const group = await prisma.group.findUnique({
    where: { id: params.groupId },
    include: {
      memberships: { include: { user: true } },
      invites: true,
      events: true,
    },
  });
  return NextResponse.json(group);
}

export async function DELETE(
  _: Request,
  { params }: { params: { groupId: string } }
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
  await prisma.group.delete({ where: { id: params.groupId } });
  return NextResponse.json({ ok: true });
}
