"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Pencil, Plus, Archive, BookOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { ClassroomDto } from "@/lib/dto-types";
import { requestJson } from "@/lib/request-json";
import { CTA_CLASSES } from "@/lib/ui-classes";

export function ClassroomManager({ classrooms }: { classrooms: ClassroomDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClassroomDto | null>(null);
  const [archiving, setArchiving] = useState<ClassroomDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (!archiving) return;
    setBusy(true);
    const result = await requestJson("DELETE", `/api/classrooms/${archiving.id}`);
    setBusy(false);
    if (!result.ok) {
      toast({ variant: "error", title: "Could not archive the classroom", description: result.error.message });
      return;
    }
    setArchiving(null);
    toast({ title: "Classroom archived", description: "Its activities are kept." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Classrooms</h1>
          <p className="text-sm text-muted-foreground">Group your activities by class.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/classrooms/archived" className={buttonVariants({ variant: "outline" })}>Archived</Link>
        {!creating && (
          <Button className={CTA_CLASSES} onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            New classroom
          </Button>
        )}
        </div>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>New classroom</CardTitle>
          </CardHeader>
          <CardContent>
            <ClassroomForm
              onCancel={() => setCreating(false)}
              onDone={() => {
                setCreating(false);
                router.refresh();
              }}
            />
          </CardContent>
        </Card>
      )}

      {classrooms.length === 0 && !creating ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <BookOpen className="size-10 text-primary" aria-hidden="true" />
            <p className="font-medium">No classrooms yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create a classroom first. Activities are organised under classrooms.
            </p>
            <Button className={CTA_CLASSES} onClick={() => setCreating(true)}>
              Create your first classroom
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classrooms.map((classroom) => (
            <li key={classroom.id}>
              <Card className="h-full transition-shadow hover:shadow-[0_0_18px_-6px_rgba(249,115,22,0.5)]">
                <CardHeader>
                  <CardTitle className="text-base">{classroom.classroomName}</CardTitle>
                  <CardDescription>
                    {classroom.description ?? "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {classroom.activityCount} {classroom.activityCount === 1 ? "activity" : "activities"}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Link
                    href={`/activities?classroomId=${classroom.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    View activities
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(classroom)}>
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setArchiving(classroom)}>
                    <Archive data-icon="inline-start" aria-hidden="true" />
                    Archive
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">Edit classroom</DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted-foreground">
            Changes apply to all of this classroom&apos;s activities.
          </DialogDescription>
          {editing && (
            <ClassroomForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={`Archive “${archiving?.classroomName ?? ""}”?`}
        description="The classroom will be hidden from your list and can no longer receive new activities. Its existing activities are kept."
        confirmLabel="Archive classroom"
        pending={busy}
        onConfirm={archive}
      />
    </div>
  );
}

function ClassroomForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: ClassroomDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.classroomName ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    const body = { classroomName: name, description };
    const result = initial
      ? await requestJson("PATCH", `/api/classrooms/${initial.id}`, body)
      : await requestJson("POST", "/api/classrooms", body);
    setPending(false);

    if (!result.ok) {
      setErrors(result.error.fields);
      toast({ variant: "error", title: "Could not save the classroom", description: result.error.message });
      return;
    }
    toast({ title: initial ? "Classroom updated" : "Classroom created" });
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>Please correct the highlighted fields.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="classroomName">Classroom name</Label>
        <Input
          id="classroomName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          aria-invalid={Boolean(errors.classroomName)}
          aria-describedby={errors.classroomName ? "classroomName-error" : undefined}
          placeholder="e.g. BSIT 3A – Networking"
        />
        {errors.classroomName && (
          <p id="classroomName-error" className="text-sm text-destructive">{errors.classroomName}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={255}
          rows={2}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" className={CTA_CLASSES} disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create classroom"}
        </Button>
      </div>
    </form>
  );
}
