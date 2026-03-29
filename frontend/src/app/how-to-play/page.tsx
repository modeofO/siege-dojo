import Link from "next/link";

export default function HowToPlayPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 space-y-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-wider text-[#00d4ff]">HOW TO PLAY</h1>
        <p className="text-sm text-[#6a6a7a]">
          Siege is an asymmetric strategy game where two teams battle to destroy each other&apos;s vaults.
        </p>
      </div>

      {/* Overview */}
      <Section title="THE BASICS">
        <ul className="space-y-2 text-sm text-[#a0a0b0]">
          <li><Bullet color="cyan" /> Two teams of two: each team has an <Strong>Attacker</Strong> and a <Strong>Defender</Strong></li>
          <li><Bullet color="cyan" /> Each team protects a <Strong>Vault</Strong> with 100 HP</li>
          <li><Bullet color="cyan" /> The game lasts up to <Strong>10 rounds</Strong></li>
          <li><Bullet color="cyan" /> First team to destroy the enemy vault wins. If neither vault falls, highest HP wins</li>
          <li><Bullet color="cyan" /> Every move is secret until all players commit, then revealed simultaneously</li>
        </ul>
      </Section>

      {/* Roles */}
      <Section title="ROLES">
        <div className="grid md:grid-cols-2 gap-6">
          <RoleCard
            title="ATTACKER"
            color="red"
            description="Your job is to breach the enemy vault."
            slots={[
              { name: "East Gate", desc: "Pressure point 1 on the enemy vault" },
              { name: "West Gate", desc: "Pressure point 2 on the enemy vault" },
              { name: "Underground", desc: "Pressure point 3 on the enemy vault" },
              { name: "Node 1-3", desc: "Contest resource nodes for bonus budget" },
            ]}
          />
          <RoleCard
            title="DEFENDER"
            color="blue"
            description="Your job is to protect your team's vault."
            slots={[
              { name: "East Gate", desc: "Guard against pressure point 1" },
              { name: "West Gate", desc: "Guard against pressure point 2" },
              { name: "Underground", desc: "Guard against pressure point 3" },
              { name: "Repair", desc: "Heal your vault (up to 3 HP, capped at 100)" },
              { name: "Node 1-3", desc: "Contest resource nodes for bonus budget" },
            ]}
          />
        </div>
      </Section>

      {/* Combat */}
      <Section title="COMBAT">
        <div className="space-y-4 text-sm text-[#a0a0b0]">
          <p>
            Each gate is resolved independently. The attacker&apos;s power at a gate is compared against the defender&apos;s guard at the <Strong>same gate</Strong>.
          </p>
          <div className="bg-[#12121a] border border-[#2a2a3a] rounded p-4 font-mono text-xs space-y-1">
            <div className="text-[#6a6a7a]">{"// For each of the 3 gates:"}</div>
            <div>damage += max(0, <span className="text-[#ff3344]">attack_power</span> - <span className="text-[#00d4ff]">guard_power</span>)</div>
            <div className="mt-2 text-[#6a6a7a]">{"// Example: Attacker [5, 3, 2] vs Defender [3, 3, 4]"}</div>
            <div>East Gate: max(0, 5-3) = <span className="text-[#ffd700]">2</span></div>
            <div>West Gate: max(0, 3-3) = <span className="text-[#ffd700]">0</span></div>
            <div>Underground: max(0, 2-4) = <span className="text-[#ffd700]">0</span></div>
            <div>Total damage = <span className="text-[#ffd700]">2 HP</span></div>
          </div>
          <p>
            Damage is applied <Strong>after</Strong> repair. The defender&apos;s repair heals the vault first (capped at 3 HP per round, max 100 HP), then damage is subtracted.
          </p>
        </div>
      </Section>

      {/* Nodes */}
      <Section title="RESOURCE NODES">
        <div className="space-y-4 text-sm text-[#a0a0b0]">
          <p>
            There are <Strong>3 resource nodes</Strong> on the battlefield. Controlling a node gives your team <Strong>+1 budget per round</Strong> (base budget is 10).
          </p>
          <p>
            Both players on a team contribute to node contests. Your attacker&apos;s node points and your defender&apos;s node points are <Strong>added together</Strong>, then compared against the enemy team&apos;s combined total for each node.
          </p>
          <div className="bg-[#12121a] border border-[#2a2a3a] rounded p-4 font-mono text-xs space-y-1">
            <div className="text-[#6a6a7a]">{"// For each node:"}</div>
            <div>team_total = <span className="text-[#ff3344]">attacker_node</span> + <span className="text-[#00d4ff]">defender_node</span></div>
            <div className="mt-1">{"if team_a_total > team_b_total → Team A controls"}</div>
            <div>{"if team_b_total > team_a_total → Team B controls"}</div>
            <div>{"if tied → no change"}</div>
          </div>
          <p>
            Nodes are a strategic tradeoff: spending budget on nodes means less for attack or defense, but controlling all 3 gives you <Strong>13 budget vs their 10</Strong>.
          </p>
        </div>
      </Section>

      {/* Turn Flow */}
      <Section title="TURN FLOW">
        <div className="space-y-3">
          {[
            { step: "1", label: "COMMIT", desc: "All 4 players secretly allocate their budget and submit a cryptographic hash of their moves. No one can see anyone else's allocation." },
            { step: "2", label: "REVEAL", desc: "Once all 4 commits are in, players reveal their actual moves. The hash ensures no one changed their mind after seeing others." },
            { step: "3", label: "RESOLVE", desc: "The contract calculates damage, applies repairs, resolves node contests, and advances to the next round." },
          ].map((phase) => (
            <div key={phase.step} className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full border border-[#00d4ff]/40 flex items-center justify-center text-[#00d4ff] text-sm font-bold shrink-0">
                {phase.step}
              </div>
              <div>
                <div className="text-sm font-bold text-[#e0e0e8] tracking-wider">{phase.label}</div>
                <div className="text-xs text-[#6a6a7a] mt-0.5">{phase.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Budget */}
      <Section title="BUDGET">
        <div className="space-y-3 text-sm text-[#a0a0b0]">
          <p>
            Each team starts with <Strong>10 budget per round</Strong>. Both the attacker and defender on a team share the same budget pool.
          </p>
          <p>
            For every resource node your team controls, you get <Strong>+1 bonus budget</Strong>. With all 3 nodes, your team has 13 to spend.
          </p>
          <p>
            You must allocate <Strong>exactly</Strong> your full budget each round — no saving, no overspending.
          </p>
        </div>
      </Section>

      {/* Win Conditions */}
      <Section title="WIN CONDITIONS">
        <ul className="space-y-2 text-sm text-[#a0a0b0]">
          <li><Bullet color="red" /> <Strong>Vault destroyed</Strong> — If a vault hits 0 HP, that team loses immediately</li>
          <li><Bullet color="gold" /> <Strong>Round 10</Strong> — If both vaults survive, the team with more HP wins</li>
          <li><Bullet color="gray" /> <Strong>Draw</Strong> — If both vaults have equal HP after round 10</li>
        </ul>
      </Section>

      {/* Strategy Tips */}
      <Section title="STRATEGY TIPS">
        <ul className="space-y-2 text-sm text-[#a0a0b0]">
          <li><Bullet color="cyan" /> <Strong>Concentrate attacks</Strong> — Spreading evenly across all gates is easy to defend. Stack one gate heavily to punch through</li>
          <li><Bullet color="cyan" /> <Strong>Read your opponent</Strong> — If they always stack East Gate, guard it. If they spread thin, do the same and invest in nodes</li>
          <li><Bullet color="cyan" /> <Strong>Nodes compound</Strong> — Early node control snowballs into a budget advantage over many rounds</li>
          <li><Bullet color="cyan" /> <Strong>Repair wisely</Strong> — Repair is capped at 3 and can&apos;t exceed 100 HP. Don&apos;t waste points repairing at full health</li>
          <li><Bullet color="cyan" /> <Strong>Coordinate with your teammate</Strong> — Your node contest points are combined. Split responsibility between attack/defense and node control</li>
        </ul>
      </Section>

      <div className="flex gap-6 pt-4">
        <Link
          href="/match/create"
          className="px-8 py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm"
        >
          CREATE MATCH
        </Link>
        <Link
          href="/"
          className="px-8 py-3 bg-[#12121a] border border-[#2a2a3a] rounded hover:border-[#6a6a7a] transition-colors tracking-wider text-sm text-[#6a6a7a]"
        >
          BACK HOME
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold tracking-[0.2em] text-[#e0e0e8] border-b border-[#2a2a3a] pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="text-[#e0e0e8] font-medium">{children}</span>;
}

function Bullet({ color }: { color: "cyan" | "red" | "gold" | "gray" | "blue" }) {
  const colors = {
    cyan: "bg-[#00d4ff]",
    red: "bg-[#ff3344]",
    gold: "bg-[#ffd700]",
    gray: "bg-[#6a6a7a]",
    blue: "bg-[#00d4ff]",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[color]} mr-2`} />;
}

function RoleCard({
  title,
  color,
  description,
  slots,
}: {
  title: string;
  color: "red" | "blue";
  description: string;
  slots: { name: string; desc: string }[];
}) {
  const borderColor = color === "red" ? "border-[#ff3344]/40" : "border-[#00d4ff]/40";
  const titleColor = color === "red" ? "text-[#ff3344]" : "text-[#00d4ff]";

  return (
    <div className={`border ${borderColor} rounded-lg p-4 bg-[#12121a] space-y-3`}>
      <h3 className={`text-sm font-bold tracking-wider ${titleColor}`}>{title}</h3>
      <p className="text-xs text-[#6a6a7a]">{description}</p>
      <div className="space-y-1.5">
        {slots.map((slot) => (
          <div key={slot.name} className="flex gap-2 text-xs">
            <span className="text-[#e0e0e8] font-medium w-24 shrink-0">{slot.name}</span>
            <span className="text-[#6a6a7a]">{slot.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
