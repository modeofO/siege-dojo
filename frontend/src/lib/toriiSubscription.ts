// toriiSubscription.ts — WebSocket subscription to Torii for real-time updates
// Instead of polling every 4s, subscribe to entity changes and trigger refresh immediately

import { useEffect, useRef } from "react";
import { createClient, type Client } from "graphql-ws";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";

// Convert HTTP(S) URL to WS(S) URL
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws") + "/graphql";
}

const WS_URL = toWsUrl(TORII_URL);

/**
 * Hook that subscribes to Torii entity updates for a match.
 * Calls `onUpdate` whenever any entity changes, which should trigger
 * a refresh of the match state.
 *
 * Falls back gracefully if WebSocket connection fails — the existing
 * polling continues to work as backup.
 */
export function useToriiSubscription(
  matchId: string | null,
  onUpdate: () => void,
) {
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    if (!matchId) return;

    let disposed = false;

    try {
      const client = createClient({
        url: WS_URL,
        retryAttempts: 5,
        shouldRetry: () => !disposed,
        on: {
          connected: () => console.log("[torii-ws] connected"),
          closed: () => console.log("[torii-ws] closed"),
          error: (err) => console.warn("[torii-ws] error:", err),
        },
      });

      clientRef.current = client;

      // Subscribe to entity updates
      // We use eventEmitted which fires on any world event (MoveCommitted, MoveRevealed, RoundResolved, etc.)
      const unsubscribe = client.subscribe(
        {
          query: `subscription {
            eventEmitted {
              id
              keys
              transactionHash
            }
          }`,
        },
        {
          next: () => {
            // Any event in the world — trigger refresh
            // This is broad but simple. The polling hooks will re-fetch and update only if data changed.
            onUpdate();
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
        unsubscribe();
        client.dispose();
        clientRef.current = null;
      };
    } catch (err) {
      console.warn("[torii-ws] failed to connect, falling back to polling:", err);
      return;
    }
  }, [matchId, onUpdate]);
}
