import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-12">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-bold tracking-[0.3em] text-[#00d4ff]">
          SIEGE
        </h1>
        <p className="text-xl text-[#6a6a7a] tracking-wider">
          Trust Your AI
        </p>
      </div>

      {/* Explanation */}
      <div className="max-w-lg text-center text-sm text-[#6a6a7a] leading-relaxed space-y-3">
        <p>
          Two teams. Each team is a human + an AI agent. One attacks, one defends.
          Your opponent doesn&apos;t know who&apos;s who.
        </p>
        <p>
          Allocate resources across pressure points. Commit your moves with cryptographic hashes.
          Reveal simultaneously. Outsmart, outplay, outlast.
        </p>
      </div>

      {/* CTAs */}
      <div className="flex gap-6">
        <Link
          href="/match/create"
          className="px-8 py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm"
        >
          CREATE MATCH
        </Link>
        <Link
          href="/match/join"
          className="px-8 py-3 bg-[#12121a] border border-[#2a2a3a] rounded hover:border-[#ffd700] hover:text-[#ffd700] transition-colors tracking-wider text-sm"
        >
          OPEN MATCH
        </Link>
      </div>

      <Link
        href="/how-to-play"
        className="text-xs text-[#6a6a7a] hover:text-[#00d4ff] transition-colors tracking-wider"
      >
        HOW TO PLAY
      </Link>

      {/* Decorative */}
      <div className="text-[#2a2a3a] text-xs tracking-[0.5em] mt-4">
        ▪ COMMIT ▪ REVEAL ▪ CONQUER ▪
      </div>
    </div>
  );
}
