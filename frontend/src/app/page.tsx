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
          Allocate resources across pressure points. Commit your moves with cryptographic hashes.
          Reveal simultaneously. Outsmart, outplay, outlast.
        </p>
      </div>

      {/* Mode selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
        {/* 1v1 Mode */}
        <div className="border border-[#ffd700]/30 rounded-lg p-6 bg-[#12121a] space-y-4">
          <div className="text-lg font-bold text-[#ffd700] tracking-wider">1v1 MODE</div>
          <p className="text-xs text-[#6a6a7a]">
            One player controls attack + defense. Shared budget. Fast rounds.
          </p>
          <div className="flex gap-3">
            <Link
              href="/match-1v1/create"
              className="flex-1 text-center px-4 py-2 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors text-sm"
            >
              CREATE
            </Link>
            <Link
              href="/match-1v1/join"
              className="flex-1 text-center px-4 py-2 bg-[#12121a] border border-[#2a2a3a] rounded hover:border-[#ffd700] hover:text-[#ffd700] transition-colors text-sm"
            >
              JOIN
            </Link>
          </div>
        </div>

        {/* 2v2 Mode */}
        <div className="border border-[#00d4ff]/30 rounded-lg p-6 bg-[#12121a] space-y-4">
          <div className="text-lg font-bold text-[#00d4ff] tracking-wider">2v2 MODE</div>
          <p className="text-xs text-[#6a6a7a]">
            Two teams of two. Human + AI. One attacks, one defends.
          </p>
          <div className="flex gap-3">
            <Link
              href="/match/create"
              className="flex-1 text-center px-4 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors text-sm"
            >
              CREATE
            </Link>
            <Link
              href="/match/join"
              className="flex-1 text-center px-4 py-2 bg-[#12121a] border border-[#2a2a3a] rounded hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors text-sm"
            >
              JOIN
            </Link>
          </div>
        </div>
      </div>

      <Link
        href="/how-to-play"
        className="text-xs text-[#6a6a7a] hover:text-[#00d4ff] transition-colors tracking-wider"
      >
        HOW TO PLAY
      </Link>

      <div className="text-[#2a2a3a] text-xs tracking-[0.5em] mt-4">
        ▪ COMMIT ▪ REVEAL ▪ CONQUER ▪
      </div>
    </div>
  );
}
