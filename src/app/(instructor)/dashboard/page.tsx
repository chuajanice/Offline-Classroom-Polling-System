import Link from "next/link";
import { ChevronRight, ClipboardList, FilePenLine, Plus, School, Send } from "lucide-react";
import { ActivityRow } from "@/components/dashboard/activity-row";
import { ClassroomCard } from "@/components/dashboard/classroom-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireInstructor } from "@/lib/session";
import { CTA_CLASSES } from "@/lib/ui-classes";
import { getDashboardStats } from "@/services/activity.service";
import { listClassrooms } from "@/services/classroom.service";

export const metadata = { title: "Dashboard" };

// Every number and row comes from the database for this instructor. No placeholder data.
export default async function DashboardPage() {
  const instructor = await requireInstructor();
  const [stats, classrooms] = await Promise.all([
    getDashboardStats(instructor.id),
    listClassrooms(instructor.id),
  ]);

  const tiles = [
    { label: "Classrooms", value: stats.classrooms, icon: School },
    { label: "Activities", value: stats.activities, icon: ClipboardList },
    { label: "Drafts", value: stats.drafts, icon: FilePenLine },
    { label: "Published", value: stats.published, icon: Send },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${instructor.fullName}`}
        description={instructor.email}
        actions={
          <>
            <Link href="/classrooms" className={buttonVariants({ variant: "outline" })}>
              Manage classrooms
            </Link>
            <Link href="/activities/new" className={buttonVariants({ className: CTA_CLASSES })}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              New activity
            </Link>
          </>
        }
      />

      <section aria-label="Statistics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatCard key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} />
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section aria-labelledby="recent-heading" className="min-w-0 lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="recent-heading">Recent activities</CardTitle>
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
                <ul className="space-y-1">
                  {stats.recent.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="classrooms-heading" className="min-w-0 lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="classrooms-heading">Classrooms</CardTitle>
              <CardDescription>Select a classroom to see its activities.</CardDescription>
              <CardAction>
                <Link
                  href="/classrooms"
                  className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  View all
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {classrooms.length === 0 ? (
                <div className="flex flex-col items-start gap-3 py-4">
                  <p className="text-sm text-muted-foreground">No classrooms yet.</p>
                  <Link href="/classrooms" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Create a classroom
                  </Link>
                </div>
              ) : (
                <div className="grid gap-3">
                  {classrooms.slice(0, 6).map((classroom) => (
                    <ClassroomCard key={classroom.id} classroom={classroom} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
