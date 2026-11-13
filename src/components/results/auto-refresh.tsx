"use client";

// Re-runs the server component on an interval so the instructor sees live participation.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ intervalSeconds }: { intervalSeconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [router, intervalSeconds]);
  return null;
}
