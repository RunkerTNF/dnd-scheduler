import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  const groups = await prisma.group.findMany({
    where: { memberships: { some: { userId: me!.id } } },
  });
  return NextResponse.json(groups);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name ?? "" },
  });
  const { name, description } = await req.json();
  const group = await prisma.group.create({
    data: {
      name,
      description,
      ownerId: me.id,
      memberships: { create: { userId: me.id, role: "gm" } },
    },
  });
  revalidatePath("/groups");
  return NextResponse.json(group);
}
