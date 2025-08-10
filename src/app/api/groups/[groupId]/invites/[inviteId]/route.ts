import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
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
  const invites = await prisma.invite.findMany({
    where: { groupId: params.groupId },
  });
  return NextResponse.json(invites);
}

export async function POST(
  req: Request,
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
  const { usesLeft, expiresAt } = await req.json();
  const token = crypto.randomUUID();
  const invite = await prisma.invite.create({
    data: {
      groupId: params.groupId,
      token,
      usesLeft,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: me!.id,
    },
  });
  return NextResponse.json({ ...invite, url: `/join?token=${token}` });
}
