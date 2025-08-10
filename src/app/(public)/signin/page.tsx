// src/app/(public)/signin/page.tsx
import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SignIn({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string };
}) {
  const session = await auth();
  const target = searchParams?.callbackUrl || "/groups";
  if (session?.user) redirect(target);

  async function doGoogle() {
    "use server";
    await signIn("google", { redirectTo: target });
  }

  async function doEmail(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "");
    await signIn("email", { email, redirectTo: target });
  }

  return (
    <div className="space-y-6 max-w-sm">
      <form action={doGoogle}>
        <button className="w-full rounded bg-black px-4 py-2 text-white dnd-btn">
          Войти через Google
        </button>
      </form>

      <div className="text-center text-sm text-gray-500">или по email</div>

      <form action={doEmail} className="space-y-3">
        <input
          name="email"
          type="email"
          required
          className="w-full border px-3 py-2 rounded"
          placeholder="you@example.com"
        />
        <button className="w-full rounded border px-4 py-2 dnd-btn">
          Отправить ссылку
        </button>
      </form>
    </div>
  );
}
