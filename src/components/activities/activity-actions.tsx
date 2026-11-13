"use client";

// Instructor controls for one activity. The buttons offered depend on its state:
// draft (edit, publish, open, delete), open (close, archive), closed (archive),
// archived (restore). Destructive or irreversible-looking steps ask first.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { requestJson } from "@/lib/request-json";
import { CTA_CLASSES } from "@/lib/ui-classes";

type Busy = "publish" | "unpublish" | "delete" | "open" | "close" | "archive" | "restore" | null;

export function ActivityActions({
  activityId,
  status,
  isPublished,
  isArchived,
  classroomArchived,
  participantCount,
}: {
  activityId: number;
  status: "DRAFT" | "OPEN" | "CLOSED";
  isPublished: boolean;
  isArchived: boolean;
  classroomArchived: boolean;
  participantCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState<null | "open" | "close" | "archive" | "delete">(null);

  async function run(action: Exclude<Busy, null>, method: "POST" | "DELETE", url: string, success: string) {
    setBusy(action);
    const result = await requestJson(method, url);
    setBusy(null);
    setConfirm(null);
    if (!result.ok) {
      toast({ variant: "error", title: "That did not work", description: result.error.message });
      return;
    }
    toast({ title: success });
    if (action === "delete") {
      router.replace("/activities");
    }
    router.refresh();
  }

  const base = `/api/activities/${activityId}`;
  const isBusy = busy !== null;

  if (isArchived) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button className={CTA_CLASSES} disabled={isBusy} onClick={() => run("restore", "POST", `${base}/restore`, "Activity restored")}>
          {busy === "restore" ? "Restoring…" : "Restore activity"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && (
        <>
          <Link href={`/activities/${activityId}/edit`} className={buttonVariants({ variant: "outline" })}>
            Edit
          </Link>
          {isPublished ? (
            <Button variant="outline" disabled={isBusy} onClick={() => run("unpublish", "POST", `${base}/unpublish`, "Activity is a draft again")}>
              {busy === "unpublish" ? "Working…" : "Unpublish"}
            </Button>
          ) : (
            <Button variant="outline" disabled={isBusy} onClick={() => run("publish", "POST", `${base}/publish`, "Activity published")}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          )}
          <Button
            className={CTA_CLASSES}
            disabled={isBusy || !isPublished || classroomArchived}
            title={
              classroomArchived
                ? "Restore the classroom before opening its activities."
                : !isPublished
                  ? "Publish the activity before opening it."
                  : undefined
            }
            onClick={() => setConfirm("open")}
          >
            Open session
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={isBusy || participantCount > 0}
            title={participantCount > 0 ? "Activities with student records must be archived instead." : undefined}
            onClick={() => setConfirm("delete")}
          >
            Delete
          </Button>
        </>
      )}

      {status === "OPEN" && (
        <>
          <Link href={`/activities/${activityId}/results`} className={buttonVariants({ variant: "outline" })}>
            Participants &amp; results
          </Link>
          <Button variant="outline" disabled={isBusy} onClick={() => setConfirm("close")}>
            Close session
          </Button>
          <Button variant="ghost" disabled={isBusy} onClick={() => setConfirm("archive")}>
            Archive
          </Button>
        </>
      )}

      {status === "CLOSED" && (
        <>
          <Link href={`/activities/${activityId}/results`} className={buttonVariants({ className: CTA_CLASSES })}>
            Participants &amp; results
          </Link>
          <Button variant="ghost" disabled={isBusy} onClick={() => setConfirm("archive")}>
            Archive
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirm === "open"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Open this session?"
        description="Students will receive a session code and can join until you close the session or its closing time passes. The questions and choices can no longer be changed."
        confirmLabel="Open session"
        pending={busy === "open"}
        onConfirm={() => run("open", "POST", `${base}/open`, "Session is open")}
      />
      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close this session?"
        description="Students can no longer join or submit answers. Results are kept."
        confirmLabel="Close session"
        pending={busy === "close"}
        onConfirm={() => run("close", "POST", `${base}/close`, "Session closed")}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this activity?"
        description={
          status === "OPEN"
            ? "The session is open, so it will be closed first. Questions, schedules, participants and results are kept. You can restore the activity later."
            : "Questions, schedules, participants and results are kept. You can restore the activity later."
        }
        confirmLabel="Archive activity"
        pending={busy === "archive"}
        onConfirm={() => run("archive", "POST", `${base}/archive`, "Activity archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this draft?"
        description="The draft and its questions and choices will be permanently removed. This cannot be undone."
        confirmLabel="Delete draft"
        pending={busy === "delete"}
        onConfirm={() => run("delete", "DELETE", base, "Draft deleted")}
      />
    </div>
  );
}
