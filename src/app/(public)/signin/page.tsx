import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SignIn({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string };
}) {
  const target = searchParams?.callbackUrl || "/groups";
  const session = await auth();
  if (session?.user) redirect(target);

  async function doGoogle() {
    "use server";
    await signIn("google", { redirectTo: target });
  }

  async function doPassword(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    await signIn("credentials", { email, password, redirectTo: target });
  }

  return (
    <div className="max-w-sm space-y-6">
      <form action={doGoogle}>
        <button className="dnd-btn w-full">Войти через Google</button>
      </form>

      <div className="text-sm text-gray-600 text-center">или</div>

      <form action={doPassword} className="space-y-3">
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
          placeholder="Пароль"
          required
        />
        <button className="dnd-btn w-full" type="submit">
          Войти
        </button>
      </form>

      <div className="text-center text-sm">
        Нет аккаунта?{" "}
        <a
          href={`/signup?callbackUrl=${encodeURIComponent(target)}`}
          className="dnd-link"
        >
          Зарегистрироваться
        </a>
      </div>
    </div>
  );
}
