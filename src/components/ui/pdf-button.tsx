"use client";

// A button that fetches a PDF, shows a pending label while it is built, and reports failures.
// For a preview the new tab is opened first, while the click is still a user gesture, so the
// browser does not block it.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CTA_CLASSES } from "@/lib/ui-classes";

export function PdfButton({
  href,
  label,
  busyLabel,
  mode,
  variant = "outline",
}: {
  href: string;
  label: string;
  busyLabel: string;
  mode: "preview" | "download";
  variant?: "outline" | "cta";
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const win = mode === "preview" ? window.open("", "_blank") : null;
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "The PDF could not be generated. Please try again.");
      }
      const url = URL.createObjectURL(await res.blob());
      if (mode === "preview" && win) {
        win.location.href = url;
      } else {
        win?.close();
        const filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "report.pdf";
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      win?.close();
      toast({
        variant: "error",
        title: "PDF not ready",
        description: error instanceof Error ? error.message : "The PDF could not be generated.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={variant === "cta" ? "default" : "outline"}
      className={variant === "cta" ? CTA_CLASSES : undefined}
      disabled={busy}
      onClick={run}
    >
      {busy ? busyLabel : label}
    </Button>
  );
}
