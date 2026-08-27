import { useQuery } from "@tanstack/react-query";

import { 
  Activity, CheckCircle2, Clock, XCircle, Play, FileText, AlertTriangle,
  Brain, Target, Workflow, Eye, ShieldCheck, GitBranch, Cpu, Zap, 
  BookOpen, Search, Database, Code, BarChart3,
  Layers, FileSearch, Lightbulb, User, Gauge, Bug, MessageCircle,
  TrendingUp, Settings, Clock3, HelpCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";


import { cn } from "@/lib/utils";
import { fetchAnalytics, fetchWorkflowOverview, type AnalyticsData, type WorkflowOverview } from "@/lib/aggregate-api";
import { STAGE_TO_AGENT } from "@workspace/pipeline-config";

interface AgentBlueprint {
  label: string;
  phase: string;
  icon: typeof Brain;
  color: string;
  desc: string;
  details: string[];
  inputs: string[];
  outputs: string[];
}

const AGENT_BLUEPRINTS: Record<string, AgentBlueprint> = {
  discovery: {
    label: "Discovery Agent",
    phase: "Discovery",
    icon: Search,
    color: "text-blue-500",
    desc: "Analyzes the initial idea and extracts domain context.",
    details: [
      "Identifies the problem domain and target users",
      "Extracts key business objectives and constraints",
      "Maps the competitive landscape and market positioning",
      "Defines scope boundaries and exclusion criteria",
    ],
    inputs: ["Raw user idea / pitch", "Project context"],
    outputs: ["Problem statement", "Domain map", "Scope document"],
  },
  research: {
    label: "Research Agent",
    phase: "Research",
    icon: FileSearch,
    color: "text-indigo-500",
    desc: "Conducts deep domain and technical research.",
    details: [
      "Researches industry standards and best practices",
      "Analyzes technical feasibility of proposed solutions",
      "Gathers competitive intelligence and market data",
      "Reviews existing similar systems for patterns",
    ],
    inputs: ["Problem statement", "Domain map"],
    outputs: ["Research report", "Technical landscape", "Feasibility assessment"],
  },
  "business-analysis": {
    label: "Business Analyst",
    phase: "Analysis",
    icon: BarChart3,
    color: "text-purple-500",
    desc: "Breaks down business requirements and stakeholder needs.",
    details: [
      "Identifies all stakeholders and their interests",
      "Defines business rules and process flows",
      "Quantifies ROI targets and success metrics",
      "Creates business process diagrams",
    ],
    inputs: ["Research report", "Stakeholder input"],
    outputs: ["Business requirements doc", "Process flows", "Success metrics"],
  },
  "product-analysis": {
    label: "Product Manager",
    phase: "Product Analysis",
    icon: Target,
    color: "text-pink-500",
    desc: "Defines feature sets, user stories, and product direction.",
    details: [
      "Prioritizes features using MoSCoW framework",
      "Writes user stories with acceptance criteria",
      "Creates product roadmap and release plan",
      "Defines MVP scope and iteration phases",
    ],
    inputs: ["Business requirements", "User research"],
    outputs: ["Feature list", "User stories", "Product roadmap"],
  },
  "requirements-engineering": {
    label: "Requirements Agent",
    phase: "Requirements",
    icon: BookOpen,
    color: "text-emerald-500",
    desc: "Formalizes all requirements into structured specifications.",
    details: [
      "Translates business needs into functional requirements",
      "Defines non-functional requirements (performance, scalability)",
      "Creates requirement traceability matrix",
      "Assigns requirement IDs and priority levels",
    ],
    inputs: ["Feature list", "User stories", "Business rules"],
    outputs: ["FR document", "NFR document", "Traceability matrix"],
  },
  "ux-design": {
    label: "UX Agent",
    phase: "UX Design",
    icon: Eye,
    color: "text-cyan-500",
    desc: "Designs user experience, flows, and interaction patterns.",
    details: [
      "Creates user personas and journey maps",
      "Designs information architecture and navigation",
      "Generates wireframes and UI component specs",
      "Defines accessibility and responsive design rules",
    ],
    inputs: ["User stories", "Requirements document"],
    outputs: ["Wireframes", "UI specs", "Accessibility guidelines"],
  },
  "data-architecture": {
    label: "Data Architect",
    phase: "Data Architecture",
    icon: Database,
    color: "text-orange-500",
    desc: "Models data entities, relationships, and persistence strategy.",
    details: [
      "Designs entity-relationship diagrams",
      "Defines data models and schemas",
      "Plans data migration and storage strategy",
      "Sets up caching and data flow patterns",
    ],
    inputs: ["Requirements document", "Entity definitions"],
    outputs: ["ER diagrams", "Data schemas", "Storage plan"],
  },
  "ai-architecture": {
    label: "AI Architect",
    phase: "AI Architecture",
    icon: Brain,
    color: "text-violet-500",
    desc: "Designs AI/ML components and inference pipelines.",
    details: [
      "Selects AI models and frameworks for each use case",
      "Designs training and inference pipelines",
      "Plans model evaluation and A/B testing strategy",
      "Defines AI ethics and bias mitigation rules",
    ],
    inputs: ["Requirements", "AI opportunity analysis"],
    outputs: ["AI architecture doc", "Model selection", "Pipeline design"],
  },
  "solution-architecture": {
    label: "Solution Architect",
    phase: "Solution Architecture",
    icon: Layers,
    color: "text-rose-500",
    desc: "Creates the overall system architecture and tech stack.",
    details: [
      "Designs system architecture and component boundaries",
      "Selects technology stack and framework choices",
      "Defines API contracts and integration patterns",
      "Plans deployment, scaling, and infrastructure",
    ],
    inputs: ["All architecture docs", "Requirements"],
    outputs: ["System architecture", "Tech stack spec", "API contracts"],
  },
  "security-review": {
    label: "Security Agent",
    phase: "Security Review",
    icon: ShieldCheck,
    color: "text-amber-500",
    desc: "Performs threat modeling and security compliance checks.",
    details: [
      "Conducts threat modeling and risk assessment",
      "Reviews authentication and authorization patterns",
      "Checks for OWASP Top 10 vulnerabilities",
      "Defines security policies and compliance rules",
    ],
    inputs: ["System architecture", "API contracts"],
    outputs: ["Security report", "Threat model", "Compliance checklist"],
  },
  "qa-planning": {
    label: "QA Agent",
    phase: "QA Planning",
    icon: Bug,
    color: "text-red-500",
    desc: "Defines test strategies, scenarios, and quality gates.",
    details: [
      "Creates comprehensive test strategy and plan",
      "Defines acceptance criteria for each requirement",
      "Plans unit, integration, and E2E test coverage",
      "Sets up performance and load testing scenarios",
    ],
    inputs: ["Requirements", "User stories", "System architecture"],
    outputs: ["Test plan", "Test scenarios", "Quality gates"],
  },
  estimation: {
    label: "Estimation Agent",
    phase: "Estimation",
    icon: Gauge,
    color: "text-teal-500",
    desc: "Provides effort estimates, timelines, and resource planning.",
    details: [
      "Estimates story points for each user story",
      "Creates sprint and release timeline projections",
      "Identifies critical path and dependencies",
      "Plans team composition and resource allocation",
    ],
    inputs: ["User stories", "Architecture", "Test plan"],
    outputs: ["Effort estimates", "Project timeline", "Resource plan"],
  },
  validation: {
    label: "Critic Agent",
    phase: "Validation",
    icon: MessageCircle,
    color: "text-yellow-600",
    desc: "Reviews all outputs for consistency and completeness.",
    details: [
      "Validates requirements against business objectives",
      "Checks cross-document consistency",
      "Identifies gaps, conflicts, and ambiguities",
      "Scores overall quality and completeness",
    ],
    inputs: ["All agent outputs", "Original requirements"],
    outputs: ["Validation report", "Quality score", "Issue list"],
  },
  compilation: {
    label: "Compiler Agent",
    phase: "Compilation",
    icon: Settings,
    color: "text-emerald-600",
    desc: "Compiles everything into the final requirements document.",
    details: [
      "Merges all agent outputs into unified structure",
      "Formats document with sections, diagrams, tables",
      "Generates cross-references and hyperlinks",
      "Produces final PDF/MD export",
    ],
    inputs: ["All validated outputs", "Validation report"],
    outputs: ["Final requirements document", "Executive summary"],
  },
};

const AGENT_ORDER = Object.values(STAGE_TO_AGENT).filter((key) => key in AGENT_BLUEPRINTS);

export default function AiWorkflowPage() {
  const { data, isLoading } = useQuery<WorkflowOverview>({
    queryKey: ["aggregate", "workflow"],
    queryFn: fetchWorkflowOverview,
  });
  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["aggregate", "analytics"],
    queryFn: fetchAnalytics,
  });

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">AI Workflow</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Detailed pipeline blueprint, agent capabilities, and pipeline statistics
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
              label="Total Agents" 
              value={String(AGENT_ORDER.length)} 
              icon={<Cpu className="h-4 w-4" />}
            />
            <StatCard 
              label="Total Runs" 
              value={String(data?.agentRunHistory.length ?? 0)} 
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard 
              label="Successful" 
              value={String(data?.agentRunHistory.filter(r => r.status === "COMPLETED").length ?? 0)} 
              icon={<CheckCircle2 className="h-4 w-4" />}
              className="text-success"
            />
            <StatCard 
              label="Failed" 
              value={String(data?.agentRunHistory.filter(r => r.status === "FAILED").length ?? 0)} 
              icon={<XCircle className="h-4 w-4" />}
              className="text-destructive"
            />
          </div>

          {/* Detailed Blueprint */}
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4">Pipeline Blueprint — {AGENT_ORDER.length} Agents</h2>
            <div className="space-y-4">
              {AGENT_ORDER.map((key, idx) => {
                const agent = AGENT_BLUEPRINTS[key];
                const Icon = agent.icon;
                const stats = analytics?.pipelineStats?.[key.replace(/-/g, "_").toUpperCase()];
                return (
                  <Card key={key} className="rounded-2xl border-border shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex flex-col lg:flex-row">
                        {/* Header */}
                        <div className="lg:w-80 shrink-0 bg-card-alt p-5 border-b lg:border-b-0 lg:border-r border-border/50">
                          <div className="flex items-start gap-3">
                            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card border border-border/50", agent.color)}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-muted-foreground/70">Step {idx + 1}</span>
                                <Badge variant="outline" className="text-[10px]">{agent.phase}</Badge>
                              </div>
                              <h3 className="text-base font-bold text-foreground mt-1">{agent.label}</h3>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{agent.desc}</p>
                          
                          {/* Stats */}
                          {stats && (
                            <div className="flex gap-4 mt-3 pt-3 border-t border-border/50">
                              <span className="flex items-center gap-1 text-xs text-success">
                                <CheckCircle2 className="h-3 w-3" /> {stats.completed} completed
                              </span>
                              {stats.failed > 0 && (
                                <span className="flex items-center gap-1 text-xs text-destructive">
                                  <XCircle className="h-3 w-3" /> {stats.failed} failed
                                </span>
                              )}
                              {stats.running > 0 && (
                                <span className="flex items-center gap-1 text-xs text-primary">
                                  <Play className="h-3 w-3" /> {stats.running} running
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 p-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* What it does */}
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Responsibilities</h4>
                              <ul className="space-y-1.5">
                                {agent.details.map((detail, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                                    {detail}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Inputs & Outputs */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Inputs</h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {agent.inputs.map((input, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg">
                                      <Zap className="h-3 w-3" /> {input}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Outputs</h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {agent.outputs.map((output, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-success/10 text-success px-2 py-1 rounded-lg">
                                      <FileText className="h-3 w-3" /> {output}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, className }: { label: string; value: string; icon: React.ReactNode; className?: string }) {
  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40", className ?? "text-muted-foreground")}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
