// toriiSubscription.ts — WebSocket subscription to Torii for real-time updates
// Subscribes to events filtered by match ID and debounces rapid updates

import { useEffect, useRef, useCallback } from "react";
import { createClient, type Client } from "graphql-ws";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";

function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws") + "/graphql";
}

const WS_URL = toWsUrl(TORII_URL);
const DEBOUNCE_MS = 500;

/**
 * Hook that subscribes to Torii events filtered by match ID.
 * Debounces rapid events (e.g., multiple events from a single resolution)
 * into a single refresh call.
 *
 * Falls back gracefully if WebSocket fails — polling continues as backup.
 */
export function useToriiSubscription(
  matchId: string | null,
  onUpdate: () => void,
) {
  const clientRef = useRef<Client | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback ref to avoid re-subscribing on every render
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdateRef.current();
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!matchId) return;

    // Convert match ID to hex key for Torii event filtering
    // Torii event keys are felt252 hex strings
    const matchIdHex = "0x" + BigInt(matchId).toString(16);

    let disposed = false;

    try {
      const client = createClient({
        url: WS_URL,
        retryAttempts: Infinity,
        retryWait: (retries) => new Promise(r => setTimeout(r, Math.min(1000 * 2 ** retries, 30000))),
        shouldRetry: () => !disposed,
        on: {
          connected: () => console.log("[torii-ws] connected for match", matchId),
          closed: () => {
            if (!disposed) console.log("[torii-ws] closed, will reconnect...");
          },
          error: (err) => console.warn("[torii-ws] error:", err),
        },
      });

      clientRef.current = client;

      // Subscribe to events filtered by match ID key
      // All our events (MoveCommitted, MoveRevealed, RoundResolved, MatchFinished)
      // have match_id as #[key], so filtering by keys: [matchIdHex] scopes to this match
      const unsubscribe = client.subscribe(
        {
          query: `subscription($keys: [String!]) {
            eventEmitted(keys: $keys) {
              id
              keys
            }
          }`,
          variables: { keys: [matchIdHex] },
        },
        {
          next: () => {
            debouncedUpdate();
          },
          error: (err) => {
            console.warn("[torii-ws] subscription error:", err);
          },
          complete: () => {
            console.log("[torii-ws] subscription complete");
          },
        },
      );

      return () => {
        disposed = true;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        unsubscribe();
        client.dispose();
        clientRef.current = null;
      };
    } catch (err) {
      console.warn("[torii-ws] failed to connect, falling back to polling:", err);
      return;
    }
  }, [matchId, debouncedUpdate]);
}
