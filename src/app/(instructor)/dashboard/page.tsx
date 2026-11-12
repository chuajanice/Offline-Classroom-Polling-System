import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireInstructor } from "@/lib/session";
import { CTA_CLASSES } from "@/lib/ui-classes";
import { getDashboardStats } from "@/services/activity.service";

export const metadata = { title: "Dashboard" };

// Phase 3 dashboard: every number comes from the database for this instructor.
export default async function DashboardPage() {
  const instructor = await requireInstructor();
  const stats = await getDashboardStats(instructor.id);

  const tiles = [
    { label: "Classrooms", value: stats.classrooms },
    { label: "Activities", value: stats.activities },
    { label: "Drafts", value: stats.drafts },
    { label: "Published", value: stats.published },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {instructor.fullName}</h1>
          <p className="text-sm text-muted-foreground">{instructor.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/classrooms" className={buttonVariants({ variant: "outline" })}>
            Manage classrooms
          </Link>
          <Link href="/activities/new" className={buttonVariants({ className: CTA_CLASSES })}>
            New activity
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} size="sm">
            <CardHeader>
              <CardDescription>{tile.label}</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tabular-nums">{tile.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activities</CardTitle>
          <CardDescription>The five activities you changed most recently.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recent.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                No activities yet. Create a classroom, then build your first activity.
              </p>
              <Link href="/activities/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Create an activity
              </Link>
            </div>
          ) : (
            <ul className="divide-y">
              {stats.recent.map((activity) => (
                <li key={activity.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/activities/${activity.id}`} className="font-medium hover:underline">
                      {activity.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {activity.classroomName} · updated {formatDateTime(activity.updatedAt)}
                    </p>
                  </div>
                  <Badge variant={activity.isPublished ? "published" : "draft"}>
                    {activity.isPublished ? "Published" : "Draft"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
