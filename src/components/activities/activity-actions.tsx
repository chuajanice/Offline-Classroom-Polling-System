"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { requestJson } from "@/lib/request-json";
import { CTA_CLASSES } from "@/lib/ui-classes";

export function ActivityActions({
  activityId,
  isPublished,
  participantCount,
}: {
  activityId: number;
  isPublished: boolean;
  participantCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"publish" | "unpublish" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function publish() {
    setBusy("publish");
    const result = await requestJson("POST", `/api/activities/${activityId}/publish`);
    setBusy(null);
    if (!result.ok) {
      toast({ variant: "error", title: "Not published yet", description: result.error.message });
      return;
    }
    toast({ title: "Activity published", description: "Student participation is not open yet." });
    router.refresh();
  }

  async function unpublish() {
    setBusy("unpublish");
    const result = await requestJson("POST", `/api/activities/${activityId}/unpublish`);
    setBusy(null);
    if (!result.ok) {
      toast({ variant: "error", title: "Could not unpublish", description: result.error.message });
      return;
    }
    toast({ title: "Activity is a draft again" });
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    const result = await requestJson("DELETE", `/api/activities/${activityId}`);
    setBusy(null);
    if (!result.ok) {
      toast({ variant: "error", title: "Could not delete the activity", description: result.error.message });
      setConfirmDelete(false);
      return;
    }
    toast({ title: "Activity deleted" });
    router.replace("/activities");
    router.refresh();
  }

  const hasStudentRecords = participantCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/activities/${activityId}/edit`} className={buttonVariants({ variant: "outline" })}>
        Edit
      </Link>
      {isPublished ? (
        <Button variant="outline" onClick={unpublish} disabled={busy !== null}>
          {busy === "unpublish" ? "Working…" : "Unpublish"}
        </Button>
      ) : (
        <Button className={CTA_CLASSES} onClick={publish} disabled={busy !== null}>
          {busy === "publish" ? "Publishing…" : "Publish"}
        </Button>
      )}
      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => setConfirmDelete(true)}
        disabled={busy !== null || hasStudentRecords}
        title={hasStudentRecords ? "Activities with student records cannot be deleted." : undefined}
      >
        Delete
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this activity?"
        description="The activity and all its questions and choices will be permanently removed. This cannot be undone."
        confirmLabel="Delete activity"
        pending={busy === "delete"}
        onConfirm={remove}
      />
    </div>
  );
}
