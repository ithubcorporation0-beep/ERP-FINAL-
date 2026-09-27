import Link from "next/link";
import type { QuickActionId } from "@/config/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QUICK_ACTION_ICONS } from "./icons";

interface QuickAction {
  id: QuickActionId;
  label: string;
  href?: string;
  module: string;
}

/**
 * Shortcuts to create records. Only actions the user is allowed to perform are passed in (decided on the server);
 * an action whose screen does not exist yet is shown disabled instead of linking to nowhere.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Card className="min-w-0 shadow-xs">
      <CardHeader>
        <CardTitle>
          <h2>Quick actions</h2>
        </CardTitle>
        <CardDescription>Create common records in one click.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((action) => {
            const Icon = QUICK_ACTION_ICONS[action.id];
            return (
              <li key={action.id}>
                {action.href ? (
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href={action.href}>
                      <Icon aria-hidden="true" />
                      {action.label}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start py-2 text-left"
                    disabled
                    aria-describedby={`quick-action-${action.id}-note`}
                  >
                    <Icon aria-hidden="true" />
                    <span className="flex flex-col">
                      <span>{action.label}</span>
                      <span
                        id={`quick-action-${action.id}-note`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Coming with {action.module}
                      </span>
                    </span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
