import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { savePipelineDefaults } from "@/lib/aggregate-api";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const handleToggle = () => {
    const newTheme = isDark ? "light" : "dark";
    setTheme(newTheme);
    // Persist to backend so Settings page stays in sync
    savePipelineDefaults({ theme: newTheme }).catch(() => {
      // Silently fail — toggle still works locally
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("rounded-xl relative", className)}
      onClick={handleToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun className={cn("h-4 w-4 transition-all", isDark ? "rotate-90 scale-0" : "rotate-0 scale-100")} />
      <Moon className={cn("h-4 w-4 absolute transition-all", isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0")} />
    </Button>
  );
}
