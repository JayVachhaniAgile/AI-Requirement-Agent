import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center p-8 max-w-md w-full border-2 border-destructive bg-destructive/5 space-y-6">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
        <div>
          <h1 className="text-4xl font-bold uppercase tracking-widest text-destructive mb-2">404</h1>
          <h2 className="text-xl font-bold uppercase tracking-wide">Signal Lost</h2>
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          The requested coordinate does not exist in the platform registry.
        </p>
        <Link href="/projects" className="inline-block mt-4">
          <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
