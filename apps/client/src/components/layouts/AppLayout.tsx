import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Workflow,
  FileText,
  ShieldCheck,
  Files,
  BarChart3,
  Network,
  Settings,
  Search,
  Bell,
  Boxes,
} from "lucide-react";
import { useListProjects } from "@workspace/api-client-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-workflow", label: "AI Workflow", icon: Workflow },
  { href: "/validation", label: "Validation", icon: ShieldCheck },
  { href: "/documents", label: "Documents", icon: Files },
  { href: "/artifacts", label: "Artifacts", icon: Boxes },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/project-overview", label: "Project Overview", icon: Network },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function useBreadcrumbs(path: string) {
  return useMemo(() => {
    if (path.startsWith("/projects/") && path !== "/projects/new") {
      return [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Workspace", href: path },
      ];
    }
    if (path === "/projects/new") {
      return [
        { label: "Dashboard", href: "/dashboard" },
        { label: "New Project", href: path },
      ];
    }
    const nav = NAV.find((n) => n.href === path);
    return [{ label: nav?.label ?? "Home", href: path }];
  }, [path]);
}

export function AppLayout({
  children,
  projectName,
  projectStatus,
}: {
  children: React.ReactNode;
  projectName?: string;
  projectStatus?: string;
}) {
  const [location, setLocation] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data: projects } = useListProjects();
  const crumbs = useBreadcrumbs(location);

  const filtered = (Array.isArray(projects) ? projects : []).filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const displayCrumbs =
    projectName && location.startsWith("/projects/")
      ? [
          { label: "Dashboard", href: "/dashboard" },
          { label: projectName, href: location },
        ]
      : crumbs;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-border/80 bg-card">
        <div className="px-5 py-5">
          <img
            src="/logo.svg"
            alt="Crystallize"
            className="h-auto w-[200px]"
          />
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active =
              location === item.href ||
              (item.href === "/dashboard" && location.startsWith("/projects"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>



      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border/80 bg-card/90 px-6 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <Breadcrumb>
              <BreadcrumbList>
                {displayCrumbs.map((c, i) => (
                  <div key={c.href} className="contents">
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {i === displayCrumbs.length - 1 ? (
                        <BreadcrumbPage className="truncate font-semibold">
                          {c.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={c.href}>{c.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </div>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            {projectStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2.5 text-xs font-semibold",
                  projectStatus === "COMPLETED" && "border-success/20 bg-success/10 text-success/90",
                  projectStatus === "FAILED" && "border-destructive/20 bg-destructive/10 text-destructive",
                  !["COMPLETED", "FAILED", "CREATED", "CANCELLED"].includes(projectStatus) &&
                    "border-primary/20 bg-primary/10 text-primary",
                )}
              >
                {projectStatus.replace(/_/g, " ")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl"
              onClick={() => setSearchOpen(true)}
              aria-label="Search projects"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </Button>
            <ThemeToggle />
            <div className="ml-1 flex items-center gap-2 rounded-xl border border-border px-2 py-1">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                  JV
                </AvatarFallback>
              </Avatar>
              <div className="hidden leading-tight sm:block">
                <p className="text-xs font-semibold">Jay Vachhani</p>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search projects</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Type a project name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-xl"
          />
          <div className="max-h-64 space-y-1 overflow-auto">
            {filtered.slice(0, 12).map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/30"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery("");
                  setLocation(`/projects/${p.id}`);
                }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.status}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matches</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
