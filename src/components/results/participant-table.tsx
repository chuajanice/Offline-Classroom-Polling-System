"use client";

// Participant rows with the instructor's actions: authorise the single retake, release access.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { requestJson } from "@/lib/request-json";
import type { ParticipantResultDto } from "@/services/results.service";

export function ParticipantTable({
  activityId,
  participants,
}: {
  activityId: number;
  participants: ParticipantResultDto[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [releasing, setReleasing] = useState<ParticipantResultDto | null>(null);

  async function act(p: ParticipantResultDto, url: string, success: string) {
    setBusyId(p.participantId);
    const result = await requestJson("POST", url);
    setBusyId(null);
    setReleasing(null);
    if (!result.ok) {
      toast({ variant: "error", title: "That did not work", description: result.error.message });
      return;
    }
    toast({ title: success, description: p.displayName });
    router.refresh();
  }

  if (participants.length === 0) {
    return <p className="text-sm text-muted-foreground">No students have joined yet. Share the session code.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Joined</th>
              <th className="py-2 pr-4 font-medium">Attempts</th>
              <th className="py-2 pr-4 font-medium">Retake</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.participantId} className="border-b last:border-0 align-top">
                <td className="py-3 pr-4 font-medium">
                  {p.displayName}
                  {p.accessReleasedAt && <Badge variant="outline" className="ml-2">Access released</Badge>}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(p.joinedAt)}</td>
                <td className="py-3 pr-4">
                  {p.attempts.length === 0 ? (
                    <span className="text-muted-foreground">Not submitted</span>
                  ) : (
                    <ul className="space-y-1">
                      {p.attempts.map((a) => (
                        <li key={a.attemptNumber} className="tabular-nums">
                          Attempt {a.attemptNumber}: {a.score}/{a.maxScore} ({a.percentage}%)
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {p.retake.status === "none" && <span className="text-muted-foreground">—</span>}
                  {p.retake.status === "authorized" && <Badge variant="default">Authorised, not used</Badge>}
                  {p.retake.status === "used" && <Badge variant="outline">Used</Badge>}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {p.canAuthorizeRetake && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId !== null}
                        onClick={() =>
                          act(p, `/api/activities/${activityId}/participants/${p.participantId}/retake`, "Retake authorised")
                        }
                      >
                        Authorise retake
                      </Button>
                    )}
                    {p.canReleaseAccess && (
                      <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => setReleasing(p)}>
                        Release access
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={releasing !== null}
        onOpenChange={(o) => !o && setReleasing(null)}
        title={`Release access for ${releasing?.displayName ?? ""}?`}
        description="Their current browser stops working straight away. They can rejoin with the same name to continue, and their earlier submissions are kept. Only do this for the student who asked."
        confirmLabel="Release access"
        pending={busyId !== null}
        onConfirm={() =>
          releasing &&
          act(releasing, `/api/activities/${activityId}/participants/${releasing.participantId}/release-access`, "Access released")
        }
      />
    </>
  );
}
