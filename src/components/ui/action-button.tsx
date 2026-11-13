"use client";

// A button that POSTs to an API route, reports the result as a toast, and refreshes the page.
// Used for simple state changes (restore, unpublish) that need no extra fields.
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestJson } from "@/lib/request-json";

export function ActionButton({
  url,
  successTitle,
  children,
  ...buttonProps
}: {
  url: string;
  successTitle: string;
  children: React.ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick">) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const result = await requestJson("POST", url);
    setBusy(false);
    if (!result.ok) {
      toast({ variant: "error", title: "That did not work", description: result.error.message });
      return;
    }
    toast({ title: successTitle });
    router.refresh();
  }

  return (
    <Button {...buttonProps} onClick={run} disabled={busy || buttonProps.disabled}>
      {busy ? "Working…" : children}
    </Button>
  );
}
