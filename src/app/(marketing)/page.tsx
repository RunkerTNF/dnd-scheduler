import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold dnd-header__title">
        Организуй свои сессии без боли
      </h1>
      <p className="text-black-600">
        Игроки отмечают когда свободны. Ты видишь пересечения и назначаешь дату.
      </p>
      <Link href="/groups" className="inline-block rounded px-4 py-2">
        Перейти к группам
      </Link>
    </div>
  );
}
