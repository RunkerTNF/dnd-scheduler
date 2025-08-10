import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Организуй свои сессии без боли</h1>
      <p className="text-gray-600">
        Игроки отмечают когда свободны. Ты видишь пересечения и назначаешь дату.
      </p>
      <Link
        href="/groups"
        className="inline-block rounded bg-black px-4 py-2 text-white dnd-btn"
      >
        Перейти к группам
      </Link>
    </div>
  );
}
