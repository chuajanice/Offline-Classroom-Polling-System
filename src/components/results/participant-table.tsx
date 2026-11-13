"use client";

// Participant rows: name, submission status, attempt 1 and attempt 2 kept side by side,
// the current result, and the instructor's actions (authorise retake, release access).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { requestJson } from "@/lib/request-json";
import { SUBMISSION_STATUS_LABEL } from "@/lib/results-rules";
import type { ParticipantResultDto } from "@/services/results.service";
import type { AttemptResult } from "@/lib/results-rules";

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
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Attempt 1</th>
              <th className="py-2 pr-3 font-medium">Attempt 2</th>
              <th className="py-2 pr-3 font-medium">Current result</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const first = p.attempts.find((a) => a.attemptNumber === 1);
              const second = p.attempts.find((a) => a.attemptNumber === 2);
              return (
                <tr key={p.participantId} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-3 font-medium">
                    {p.displayName}
                    {p.accessReleasedAt && <Badge variant="outline" className="ml-2">Access released</Badge>}
                    <div className="text-xs font-normal text-muted-foreground">Joined {formatDateTime(p.joinedAt)}</div>
                  </td>
                  <td className="py-3 pr-3">{SUBMISSION_STATUS_LABEL[p.submissionStatus]}</td>
                  <td className="py-3 pr-3"><AttemptCell attempt={first} /></td>
                  <td className="py-3 pr-3"><AttemptCell attempt={second} /></td>
                  <td className="py-3 pr-3">
                    {p.currentResult ? (
                      <div className="tabular-nums">
                        <span className="font-semibold">{p.currentResult.percentage}%</span>
                        <span className="text-muted-foreground"> · attempt {p.currentResult.attemptNumber}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No result yet</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {p.canAuthorizeRetake && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId !== null}
                          onClick={() => act(p, `/api/activities/${activityId}/participants/${p.participantId}/retake`, "Retake authorised")}
                        >
                          Authorise retake
                        </Button>
                      )}
                      {p.retake.status === "used" && <Badge variant="outline">Retake used</Badge>}
                      {p.canReleaseAccess && (
                        <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => setReleasing(p)}>
                          Release access
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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

function AttemptCell({ attempt }: { attempt: AttemptResult | undefined }) {
  if (!attempt) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="tabular-nums">
      <div>
        {attempt.score} / {attempt.maxScore} <span className="text-muted-foreground">({attempt.percentage}%)</span>
      </div>
      <div className="text-xs text-muted-foreground">{formatDateTime(attempt.submittedAt)}</div>
    </div>
  );
}
