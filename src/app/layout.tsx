import "./globals.css";
import { auth, signIn, signOut } from "@/lib/auth";
import Link from "next/link";

export const metadata = { title: "DnD Scheduler" };

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="ru">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IM+Fell+English&family=IM+Fell+English+SC&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 dnd-theme">
        <header className="border-b bg-white ">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold">
              DnD Scheduler
            </Link>
            <nav className="flex items-center gap-3">
              {session?.user ? (
                <>
                  <Link href="/groups" className="text-sm">
                    Мои группы
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await signOut();
                    }}
                  >
                    <button className="text-sm">Выйти</button>
                  </form>
                </>
              ) : (
                <form
                  action={async () => {
                    "use server";
                    await signIn("google");
                  }}
                >
                  <button className="text-sm">Войти через Google</button>
                </form>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
