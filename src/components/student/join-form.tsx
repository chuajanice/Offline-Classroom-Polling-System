"use client";

// Student join: a full name and the session code. No account, no password.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { requestJson } from "@/lib/request-json";
import { CTA_CLASSES } from "@/lib/ui-classes";

export function JoinForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);
    const result = await requestJson("POST", "/api/student/join", { fullName, sessionCode });
    if (!result.ok) {
      setPending(false);
      setErrors(result.error.fields);
      setFormError(result.error.message);
      return;
    }
    const data = result.data as { redirectTo: string };
    toast({ title: "You have joined", description: "Your activity is ready." });
    router.push(data.redirectTo);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Join an activity</CardTitle>
        <CardDescription>Enter your full name and the session code your instructor shows you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-5">
          {formError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="sessionCode">Session code</Label>
            <Input
              id="sessionCode"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              inputMode="text"
              className="h-12 text-center font-mono text-lg tracking-widest uppercase"
              placeholder="ABCD-2345"
              aria-invalid={Boolean(errors.sessionCode)}
            />
            <p className="text-xs text-muted-foreground">Hyphens and spaces are optional.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              maxLength={200}
              className="h-12"
              placeholder="e.g. Maria Santos"
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
            />
            {errors.fullName && (
              <p id="fullName-error" className="text-sm text-destructive">{errors.fullName}</p>
            )}
          </div>
          <Button type="submit" className={`${CTA_CLASSES} h-12 w-full text-base`} disabled={pending}>
            {pending ? "Joining…" : "Join"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
