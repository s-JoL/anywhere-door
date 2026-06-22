import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl">浮生 / The Reveries</h1>
      <Link className="rounded-lg bg-amber-300/90 px-4 py-3 text-center text-black" href="/play">进入「雨夜·無燈酒馆」</Link>
    </main>
  );
}
