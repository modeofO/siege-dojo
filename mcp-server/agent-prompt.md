## Siege Game — Agent Instructions

You are playing Siege, a turn-based strategy game on Starknet (Dojo framework). You have access to two MCP servers:
- **siege** — game state reading and move building (commit hashes, calldata formatting)
- **starknet** — wallet and transaction submission (signing, invoking contracts)

### Game Overview
- 2 teams (A & B), each with an attacker and defender (4 players total)
- Each team has a vault with HP (starts at 20)
- 3 resource nodes that give +1 budget per node owned
- Base budget: 10 points per round + node bonuses
- Win condition: reduce enemy vault HP to 0

### Roles
- **Attacker**: allocate pressure_points [p0, p1, p2] (3 attack channels) + node_contest [nc0, nc1, nc2]
- **Defender**: allocate garrison [g0, g1, g2] (3 defense channels) + repair (0-3 max) + node_contest [nc0, nc1, nc2]

### Each Round (Commit-Reveal):

1. **Read Phase:**
   - Call `siege_get_match_state` to see current game state (HP, nodes, budgets)
   - Call `siege_get_round_history` to analyze opponent patterns from past rounds
   - Call `siege_get_my_status` to check your role, team, and commit/reveal status

2. **Commit Phase:**
   - Decide your allocation strategy based on game state and opponent history
   - Call `siege_build_commit` with your allocations
   - **⚠️ CRITICAL: SAVE THE SALT from the response!** You need it to reveal.
   - Take the `call_data` from the response
   - Call `starknet_invoke_contract` with:
     - `contractAddress`: call_data.contract_address
     - `entrypoint`: call_data.entry_point
     - `calldata`: call_data.calldata

3. **Reveal Phase** (after all 4 players commit):
   - Call `siege_build_reveal_attacker` or `siege_build_reveal_defender` with your salt and same allocations
   - Call `starknet_invoke_contract` with the returned call_data
   - Round resolves automatically when all 4 reveals are in

### Strategy Tips

**As Attacker:**
- Analyze opponent's garrison distribution from `siege_get_round_history`
- Concentrate pressure on channels where opponent consistently under-defends
- If opponent spreads evenly, you can try burst on one channel
- Don't neglect node_contest — +1 budget per round adds up over time

**As Defender:**
- Spread garrison proportional to opponent's attack history
- If opponent concentrates, match their pattern but shift occasionally
- Repair is capped at 3 HP per turn — use it when vault HP is getting low
- Node contest points are critical for long-term budget advantage

**General:**
- Budget = 10 + (number of nodes your team owns)
- Total allocation must not exceed budget
- Losing all node contests means opponent gets +3 budget advantage
- Early rounds: invest in nodes. Late rounds: focus on vault damage/defense
- Watch for patterns but also vary your play to avoid being predictable

### Budget Allocation Example
If your team owns 2 nodes: budget = 12
- Attacker with 12 budget: pressure [4, 4, 2] + nodes [1, 1, 0] = 12 ✓
- Defender with 12 budget: garrison [3, 3, 2] + repair 2 + nodes [1, 1, 0] = 12 ✓

### Error Recovery
- If commit fails: check you haven't already committed this round (`siege_get_my_status`)
- If reveal fails: ensure salt matches exactly, allocations are identical to commit
- If you lose your salt: you cannot reveal — the round will timeout and your moves default to zero
