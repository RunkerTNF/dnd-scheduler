import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SignUp({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string };
}) {
  const target = searchParams?.callbackUrl || "/groups";
  const session = await auth();
  if (session?.user) redirect(target);

  async function register(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "")
      .toLowerCase()
      .trim();
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (!email || !password || password.length < 8 || password !== confirm) {
      // В реале: вернуть ошибку через cookies/redirect. Тут просто кидать можно.
      throw new Error("Некорректные данные: проверь email и пароль.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing && existing.passwordHash) {
      throw new Error("Пользователь с таким email уже зарегистрирован.");
    }

    const hash = await bcrypt.hash(password, 12);

    if (existing && !existing.passwordHash) {
      // был OAuth-только — добавим пароль
      await prisma.user.update({
        where: { email },
        data: { name: existing.name ?? (name || null), passwordHash: hash },
      });
    } else if (!existing) {
      await prisma.user.create({
        data: { email, name: name || null, passwordHash: hash },
      });
    }

    // сразу логиним пользователя через Credentials
    await signIn("credentials", { email, password, redirectTo: target });
  }

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Регистрация</h1>
      <form action={register} className="space-y-3">
        <input
          className="dnd-input w-full"
          name="name"
          placeholder="Имя (необязательно)"
        />
        <input
          className="dnd-input w-full"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
        />
        <input
          className="dnd-input w-full"
          name="password"
          type="password"
          placeholder="Пароль (мин. 8)"
          required
        />
        <input
          className="dnd-input w-full"
          name="confirm"
          type="password"
          placeholder="Повторите пароль"
          required
        />
        <button className="dnd-btn w-full" type="submit">
          Создать аккаунт
        </button>
      </form>
      <div className="text-sm">
        Уже есть аккаунт?{" "}
        <a
          href={`/signin?callbackUrl=${encodeURIComponent(target)}`}
          className="dnd-link"
        >
          Войти
        </a>
      </div>
    </div>
  );
}
