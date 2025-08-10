import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { clampDuration } from "@/lib/time";

const Slot = z.object({ start: z.string(), end: z.string(), tz: z.string() });

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
  const m = await prisma.membership.findUnique({
    where: { userId_groupId: { userId: me!.id, groupId: params.groupId } },
  });
  if (!m) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const av = await prisma.availability.findMany({
    where: { groupId: params.groupId },
  });
  return NextResponse.json(av);
}

export async function POST(
  req: Request,
  { params }: { params: { groupId: string } }
) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = Slot.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  const m = await prisma.membership.findUnique({
    where: { userId_groupId: { userId: me!.id, groupId: params.groupId } },
  });
  if (!m) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const start = new Date(body.start);
  const end = clampDuration(start, new Date(body.end));
  const dateUTC = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const slot = await prisma.availability.create({
    data: {
      userId: me!.id,
      groupId: params.groupId,
      date: dateUTC,
      startTime: start,
      endTime: end,
      tz: body.tz,
    },
  });
  return NextResponse.json(slot);
}

export async function DELETE(
  req: Request,
  { params }: { params: { groupId: string } }
) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  const { id } = await req.json();
  const slot = await prisma.availability.findUnique({ where: { id } });

  if (!slot) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // проверяем членство и роль
  const m = await prisma.membership.findUnique({
    where: { userId_groupId: { userId: me!.id, groupId: params.groupId } },
  });
  const isGM = !!m && (m.role === "gm" || me?.isGM);

  // доступ только владельцу слота или ГМу
  if (slot.userId !== me?.id && !isGM) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.availability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
