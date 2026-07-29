import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Shield, Bell, Globe, Database, RefreshCw, Save, CreditCard, Users, Sliders, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fetchPipelineDefaults, savePipelineDefaults } from "@/lib/aggregate-api";

const TABS = [
  { id: "llm", label: "LLM Providers", icon: Globe },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "team", label: "Team", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "integrations", label: "Integrations", icon: Database },
];

const LLM_PROVIDERS = [
  { name: "OpenAI", models: ["GPT-4o", "GPT-4o-mini", "GPT-4-turbo", "GPT-3.5-turbo"], keySet: true, status: "active" },
  { name: "Anthropic", models: ["Claude 3.5 Sonnet", "Claude 3 Haiku", "Claude 3 Opus"], keySet: false, status: "inactive" },
  { name: "Groq", models: ["Llama 3-70B", "Llama 3-8B", "Mixtral 8x7B"], keySet: false, status: "inactive" },
  { name: "Google", models: ["Gemini 1.5 Pro", "Gemini 1.5 Flash"], keySet: false, status: "inactive" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("preferences");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          LLM providers, team preferences, and platform configuration
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-card text-muted-foreground border border-border hover:bg-muted/30",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "preferences" && <PipelineDefaults />}
      {activeTab === "llm" && <LlmProviders />}
      {activeTab === "team" && <PlaceholderTab icon={Users} title="Team Management" desc="Invite team members to collaborate on projects. Role-based access and permissions coming soon." />}
      {activeTab === "notifications" && <PlaceholderTab icon={Bell} title="Notification Preferences" desc="Configure email and in-app notifications for pipeline events, validation issues, and completed documents." />}
      {activeTab === "billing" && <PlaceholderTab icon={CreditCard} title="Billing & Usage" desc="View your token usage, subscription plan, and manage billing information." />}
      {activeTab === "integrations" && <Integrations />}
    </div>
  );
}

function PipelineDefaults() {
  const queryClient = useQueryClient();
  const { data: defaults, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["settings", "pipeline"],
    queryFn: fetchPipelineDefaults,
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);


  useEffect(() => {
    if (defaults) {
      setValues(defaults);
      setHasChanges(false);
    }
  }, [defaults]);

  const updateValue = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: savePipelineDefaults,
    onSuccess: (saved) => {
      setValues(saved);
      setHasChanges(false);
      queryClient.setQueryData(["settings", "pipeline"], saved);
      toast({ title: "Saved", description: "Pipeline defaults updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Card key={i} className="rounded-2xl border-border shadow-sm animate-pulse">
            <CardContent className="p-6"><div className="h-32 bg-muted/40 rounded-xl" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure default behavior for new projects and quality gate thresholds.
        </p>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="rounded-xl bg-primary hover:bg-primary-hover gap-2"
        >
          {saveMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border border-warning/20 rounded-xl text-sm text-warning">
          <span className="h-2 w-2 rounded-full bg-warning/100" />
          You have unsaved changes
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Pipeline Defaults</CardTitle>
            </div>
            <CardDescription>Default behavior for new projects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleSetting
              label="Auto-resume on failure"
              description="Automatically retry failed pipeline stages"
              checked={values.autoResumeOnFailure === "true"}
              onChange={(v) => updateValue("autoResumeOnFailure", v ? "true" : "false")}
            />
            <ToggleSetting
              label="Parallel agent execution"
              description="Run independent agents in parallel when possible"
              checked={values.parallelAgentExecution === "true"}
              onChange={(v) => updateValue("parallelAgentExecution", v ? "true" : "false")}
            />
            <ToggleSetting
              label="Generate diagrams"
              description="Include mermaid diagrams in documents"
              checked={values.generateDiagrams === "true"}
              onChange={(v) => updateValue("generateDiagrams", v ? "true" : "false")}
            />
            <ToggleSetting
              label="Export PDF on completion"
              description="Auto-generate PDF when document is finalized"
              checked={values.exportPdfOnCompletion === "true"}
              onChange={(v) => updateValue("exportPdfOnCompletion", v ? "true" : "false")}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-info" />
              <CardTitle className="text-sm">Validation Thresholds</CardTitle>
            </div>
            <CardDescription>Quality gate configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RangeSetting
              label="Minimum Confidence Score"
              value={Number(values.minConfidenceScore ?? 70)}
              unit="%"
              onChange={(v) => updateValue("minConfidenceScore", String(v))}
            />
            <RangeSetting
              label="Max Critical Issues"
              value={Number(values.maxCriticalIssues ?? 0)}
              unit="issues"
              onChange={(v) => updateValue("maxCriticalIssues", String(v))}
              max={20}
            />
            <RangeSetting
              label="Max Open Questions"
              value={Number(values.maxOpenQuestions ?? 5)}
              unit="questions"
              onChange={(v) => updateValue("maxOpenQuestions", String(v))}
              max={30}
            />
            <RangeSetting
              label="Minimum Requirement Coverage"
              value={Number(values.minRequirementCoverage ?? 80)}
              unit="%"
              onChange={(v) => updateValue("minRequirementCoverage", String(v))}
            />
          </CardContent>
        </Card>
      
    </div>
    </div>
  );
}

function ToggleSetting({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
          checked ? "bg-primary" : "bg-muted/50",
        )}
      >
        <span className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-card shadow ring-0 transition-transform",
          checked && "translate-x-5",
        )} />
      </button>
    </div>
  );
}

function RangeSetting({ label, value, unit, onChange, max = 100 }: {
  label: string; value: number; unit: string; onChange: (v: number) => void; max?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-sm font-bold text-foreground">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function LlmProviders() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure which LLM providers and models power the AI agents. At least one provider must be active.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {LLM_PROVIDERS.map((provider) => (
          <Card key={provider.name} className="rounded-2xl border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{provider.name}</CardTitle>
                <Badge
                  variant={provider.status === "active" ? "success" : "secondary"}
                  className="text-[10px]"
                >
                  {provider.status === "active" ? "Connected" : "Not Configured"}
                </Badge>
              </div>
              <CardDescription>Available models: {provider.models.join(", ")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default Model</label>
                <select className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" defaultValue={provider.models[0]}>
                  {provider.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="flex-1 rounded-xl border border-border px-3 py-2 text-sm"
                    placeholder={provider.keySet ? "••••••••••••••••" : "Enter API key..."}
                    disabled={provider.keySet}
                  />
                  <Button variant="outline" className="rounded-xl shrink-0" size="sm">
                    {provider.keySet ? "Update" : "Save"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Integrations() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        { name: "Slack", desc: "Get pipeline notifications and share documents", status: "coming" },
        { name: "Jira", desc: "Sync requirements to Jira issues automatically", status: "coming" },
        { name: "Notion", desc: "Export documents and knowledge to Notion", status: "coming" },
        { name: "GitHub", desc: "Create PRs with requirements as markdown files", status: "coming" },
      ].map((int) => (
        <Card key={int.name} className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{int.name}</CardTitle>
              <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
            </div>
            <CardDescription>{int.desc}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function PlaceholderTab({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardContent className="p-12 text-center">
        <Icon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">{desc}</p>
        <Button className="rounded-xl" variant="outline" disabled>Configure</Button>
      </CardContent>
    </Card>
  );
}
