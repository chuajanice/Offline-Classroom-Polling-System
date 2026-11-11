"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/post-json";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setPending(true);
    setFailed(false);
    const result = await postJson("/api/auth/logout", {});
    if (!result.ok) {
      // Do not pretend the session ended when the server did not confirm it.
      setFailed(true);
      setPending(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {failed && (
        <span role="alert" className="text-sm text-destructive">
          Could not log out. Try again.
        </span>
      )}
      <Button variant="outline" size="sm" onClick={logout} disabled={pending}>
        {pending ? "Logging out…" : "Log out"}
      </Button>
    </div>
  );
}
