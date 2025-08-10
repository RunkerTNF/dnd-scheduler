import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createEvents } from "ics";

const Payload = z.object({
  scheduledAtUTC: z.string(),
  durationMinutes: z.number().min(15),
  title: z.string(),
  notes: z.string().optional(),
});

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
  const events = await prisma.event.findMany({
    where: { groupId: params.groupId },
  });
  return NextResponse.json(events);
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
  const body = await req.json();
  const parsed = Payload.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const scheduledAt = new Date(parsed.data.scheduledAtUTC);
  const e = await prisma.event.create({
    data: {
      groupId: params.groupId,
      scheduledAt,
      durationMinutes: parsed.data.durationMinutes,
      title: parsed.data.title,
      notes: parsed.data.notes,
      createdBy: me!.id,
    },
  });

  const dt = new Date(e.scheduledAt);
  const comp = {
    start: [
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
      dt.getUTCHours(),
      dt.getUTCMinutes(),
    ],
    duration: { minutes: e.durationMinutes },
    title: e.title,
    description: e.notes ?? "",
    location: "Online / Discord",
    url: `https://your.app/groups/${params.groupId}`,
    organizer: { name: me?.name ?? "GM", email: me?.email ?? "" },
  } as const;
  const { error, value } = createEvents([comp]);
  if (error) return NextResponse.json({ error: "ics_failed" }, { status: 500 });
  return NextResponse.json({ event: e, ics: value });
}
