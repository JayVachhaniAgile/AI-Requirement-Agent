import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        <Button
          className="mt-6 rounded-xl bg-primary hover:bg-primary-hover"
          onClick={() => setLocation("/projects")}
        >
          Go to Projects
        </Button>
      </div>
    </div>
  );
}
