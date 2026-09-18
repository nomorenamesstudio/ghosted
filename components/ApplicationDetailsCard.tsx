"use client";

import { ExternalLink } from "lucide-react";
import type { ApplicationDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * What the application holds, read-only. The editing form lives in a modal
 * (`EditApplicationModal`) — a card full of inputs made the page look like a
 * settings screen and hid the contact details behind fields you had to click
 * into to read.
 */
export function ApplicationDetailsCard({
  app,
  actions,
}: {
  app: ApplicationDetail;
  /** Kebab menu rendered in the header — edit, favourite, archive/reopen. */
  actions?: React.ReactNode;
}) {
  return (
    <Card className="bg-gradient-to-br from-card to-violet-100/40 dark:to-violet-950/40">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Details</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          <Row label="Status">
            <span className="capitalize">{app.status}</span>
          </Row>
          <Row label="Job posting">
            {app.url ? <Link href={app.url}>{app.url}</Link> : <Empty />}
          </Row>
          <Row label="Company website">
            {app.companyWebsite ? (
              <Link href={`https://${app.companyWebsite}`}>
                {app.companyWebsite}
              </Link>
            ) : (
              <Empty />
            )}
          </Row>
          <Row label="Contact">
            {app.contactName ? (
              <span>{app.contactName}</span>
            ) : (
              <Empty />
            )}
            {app.contactEmail && (
              <a
                href={`mailto:${app.contactEmail}`}
                className="block truncate text-primary hover:underline"
              >
                {app.contactEmail}
              </a>
            )}
            {app.contactPhone && (
              <a
                href={`tel:${app.contactPhone}`}
                className="block text-primary hover:underline"
              >
                {app.contactPhone}
              </a>
            )}
          </Row>
          <Row label="Notes">
            {app.notes ? (
              <span className="whitespace-pre-wrap">{app.notes}</span>
            ) : (
              <Empty />
            )}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Empty() {
  return (
    <span className="text-muted-foreground" aria-label="Not set">
      —
    </span>
  );
}

function Link({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex max-w-full items-center gap-1 text-primary hover:underline",
      )}
    >
      <span className="truncate">{children}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}
