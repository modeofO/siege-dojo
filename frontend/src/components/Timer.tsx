"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  deadline: number; // unix timestamp in seconds
}

export function Timer({ deadline }: TimerProps) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, deadline - now));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining < 30;

  return (
    <span className={`font-bold tabular-nums ${isUrgent ? "text-[#ff3344] animate-pulse-red" : "text-[#ffd700]"}`}>
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}
