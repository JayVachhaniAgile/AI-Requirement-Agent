import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import "./TreePipelineView.css";
import type { DashboardStep } from "@/lib/dashboard-types";
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Bot,
  CircleDot,
} from "lucide-react";

// Canvas Node Dimensions — sized for text-lg titles + status without clipping
const NODE_WIDTH = 320;
const NODE_HEIGHT = 104;
const PROJECT_NODE_WIDTH = 340;
const PROJECT_NODE_HEIGHT = 112;

/** Clearance between hub edge and nearest agent column/row. */
const HUB_GAP = 140;
/** Horizontal pitch between agent columns (left edges). */
const COL = 380;
/** Vertical pitch between agent rows — must clear node height + link clearance. */
const ROW = 200;

const HUB_HALF_W = PROJECT_NODE_WIDTH / 2;
const HUB_HALF_H = PROJECT_NODE_HEIGHT / 2;

/** Column left-edge X (hub centered at origin). */
const LX1 = -(HUB_HALF_W + HUB_GAP + NODE_WIDTH);
const LX2 = LX1 - COL;
const RX1 = HUB_HALF_W + HUB_GAP;
const RX2 = RX1 + COL;
const RX3 = RX2 + COL;

/** Row top-edge Y. */
const UY1 = -(HUB_HALF_H + HUB_GAP + NODE_HEIGHT);
const UY2 = UY1 - ROW;
const UY3 = UY2 - ROW;
const DY1 = HUB_HALF_H + HUB_GAP;
const DY2 = DY1 + ROW;
const DY3 = DY2 + ROW;

interface AgentTheme {
  id: string;
  stepNum: string;
  label: string;
  stage: string;
  agentKey: string;
  gradient: string;
  lineColor: string;
  icon: string;
  position: { x: number; y: number };
  sourceId?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Orthogonal tree layout: hub → 4 roots, then parent→child only.
 * No crossing diagonals; spacing keeps nodes and links clear.
 */
const AGENT_THEMES: Record<string, AgentTheme> = {
  // --- PHASE 1: DISCOVERY & STRATEGY (Top-Left) ---
  discovery: {
    id: "discovery",
    stepNum: "01",
    label: "Discovery Agent",
    stage: "DISCOVERY",
    agentKey: "discovery",
    gradient: "from-[#3b82f6] to-[#1d4ed8]",
    lineColor: "#3b82f6",
    icon: "/agentBackgrounds/Discovery.png",
    position: { x: LX1, y: UY1 },
    sourceHandle: "left-top",
    targetHandle: "right",
  },
  research: {
    id: "research",
    stepNum: "02",
    label: "Research Agent",
    stage: "RESEARCH",
    agentKey: "research",
    gradient: "from-[#2563eb] to-[#1e40af]",
    lineColor: "#2563eb",
    icon: "/agentBackgrounds/Research.png",
    position: { x: LX2, y: UY1 },
    sourceId: "discovery",
    sourceHandle: "left",
    targetHandle: "right",
  },
  ba: {
    id: "ba",
    stepNum: "03",
    label: "Business Analyst",
    stage: "BUSINESS_ANALYSIS",
    agentKey: "business-analysis",
    gradient: "from-[#059669] to-[#047857]",
    lineColor: "#059669",
    icon: "/agentBackgrounds/BusinessAnalyst.png",
    position: { x: LX1, y: UY2 },
    sourceId: "discovery",
    sourceHandle: "top",
    targetHandle: "bottom",
  },
  pm: {
    id: "pm",
    stepNum: "04",
    label: "Product Manager",
    stage: "PRODUCT_ANALYSIS",
    agentKey: "product-analysis",
    gradient: "from-[#ea580c] to-[#c2410c]",
    lineColor: "#ea580c",
    icon: "/agentBackgrounds/ProductManager.png",
    position: { x: LX2, y: UY2 },
    sourceId: "ba",
    sourceHandle: "left",
    targetHandle: "right",
  },

  // --- PHASE 2: REQUIREMENTS & ARCHITECTURE (Top-Right) ---
  req: {
    id: "req",
    stepNum: "05",
    label: "Requirements Agent",
    stage: "REQUIREMENTS_ENGINEERING",
    agentKey: "requirements-engineering",
    gradient: "from-[#0284c7] to-[#0369a1]",
    lineColor: "#0284c7",
    icon: "/agentBackgrounds/RequirementAgent.png",
    position: { x: RX1, y: UY1 },
    sourceHandle: "right-top",
    targetHandle: "left",
  },
  ux: {
    id: "ux",
    stepNum: "06",
    label: "UX Agent",
    stage: "UX_DESIGN",
    agentKey: "ux-design",
    gradient: "from-[#a855f7] to-[#7e22ce]",
    lineColor: "#a855f7",
    icon: "/agentBackgrounds/UXAgent.png",
    position: { x: RX2, y: UY1 },
    sourceId: "req",
    sourceHandle: "right",
    targetHandle: "left",
  },
  "user-stories": {
    id: "user-stories",
    stepNum: "09",
    label: "User Stories",
    stage: "USER_STORIES_GENERATION",
    agentKey: "user-stories",
    gradient: "from-[#f59e0b] to-[#d97706]",
    lineColor: "#f59e0b",
    icon: "/agentBackgrounds/UserStrories.png",
    position: { x: RX3, y: UY1 },
    sourceId: "ux",
    sourceHandle: "right",
    targetHandle: "left",
  },
  data: {
    id: "data",
    stepNum: "07",
    label: "Data Architect",
    stage: "DATA_ARCHITECTURE",
    agentKey: "data-architecture",
    gradient: "from-[#7c3aed] to-[#5b21b6]",
    lineColor: "#7c3aed",
    icon: "/agentBackgrounds/DataArchitect.png",
    position: { x: RX1, y: UY2 },
    sourceId: "req",
    sourceHandle: "top",
    targetHandle: "bottom",
  },
  ai: {
    id: "ai",
    stepNum: "08",
    label: "AI Architect",
    stage: "AI_ARCHITECTURE",
    agentKey: "ai-architecture",
    gradient: "from-[#0f766e] to-[#115e59]",
    lineColor: "#0f766e",
    icon: "/agentBackgrounds/AIArchitect.png",
    position: { x: RX2, y: UY2 },
    sourceId: "data",
    sourceHandle: "right",
    targetHandle: "left",
  },
  "db-design": {
    id: "db-design",
    stepNum: "11",
    label: "DB Design",
    stage: "DB_DESIGN_GENERATION",
    agentKey: "db-design",
    gradient: "from-[#0284c7] to-[#075985]",
    lineColor: "#0284c7",
    icon: "/agentBackgrounds/DatabaseDesign.png",
    position: { x: RX3, y: UY2 },
    sourceId: "ai",
    sourceHandle: "right",
    targetHandle: "left",
  },
  frd: {
    id: "frd",
    stepNum: "10",
    label: "FRD Generator",
    stage: "FRD_GENERATION",
    agentKey: "frd",
    gradient: "from-[#059669] to-[#047857]",
    lineColor: "#059669",
    icon: "/agentBackgrounds/FRD.png",
    position: { x: RX1, y: UY3 },
    sourceId: "data",
    sourceHandle: "top",
    targetHandle: "bottom",
  },
  "tech-arch": {
    id: "tech-arch",
    stepNum: "12",
    label: "Tech Architecture",
    stage: "TECH_ARCH_GENERATION",
    agentKey: "tech-arch",
    gradient: "from-[#4f46e5] to-[#3730a3]",
    lineColor: "#4f46e5",
    icon: "/agentBackgrounds/TechArchitect.png",
    position: { x: RX2, y: UY3 },
    sourceId: "frd",
    sourceHandle: "right",
    targetHandle: "left",
  },

  // --- PHASE 3: SOLUTION & SECURITY (Bottom-Right) ---
  solution: {
    id: "solution",
    stepNum: "13",
    label: "Solution Architect",
    stage: "SOLUTION_ARCHITECTURE",
    agentKey: "solution-architecture",
    gradient: "from-[#d97706] to-[#b45309]",
    lineColor: "#d97706",
    icon: "/agentBackgrounds/SolutionArchitect.png",
    position: { x: RX1, y: DY1 },
    sourceHandle: "right-bottom",
    targetHandle: "left",
  },
  security: {
    id: "security",
    stepNum: "14",
    label: "Security Agent",
    stage: "SECURITY_REVIEW",
    agentKey: "security-review",
    gradient: "from-[#dc2626] to-[#991b1b]",
    lineColor: "#dc2626",
    icon: "/agentBackgrounds/SecurityAgent.png",
    position: { x: RX2, y: DY1 },
    sourceId: "solution",
    sourceHandle: "right",
    targetHandle: "left",
  },
  sow: {
    id: "sow",
    stepNum: "17",
    label: "SOW Generator",
    stage: "SOW_GENERATION",
    agentKey: "sow",
    gradient: "from-[#f43f5e] to-[#be123c]",
    lineColor: "#f43f5e",
    icon: "/agentBackgrounds/SOW.png",
    position: { x: RX3, y: DY1 },
    sourceId: "security",
    sourceHandle: "right",
    targetHandle: "left",
  },
  qa: {
    id: "qa",
    stepNum: "15",
    label: "QA Agent",
    stage: "QA_PLANNING",
    agentKey: "qa-planning",
    gradient: "from-[#10b981] to-[#047857]",
    lineColor: "#10b981",
    icon: "/agentBackgrounds/QAAgent.png",
    position: { x: RX1, y: DY2 },
    sourceId: "solution",
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  estimation: {
    id: "estimation",
    stepNum: "16",
    label: "Estimation Agent",
    stage: "ESTIMATION",
    agentKey: "estimation",
    gradient: "from-[#c2410c] to-[#9a3412]",
    lineColor: "#c2410c",
    icon: "/agentBackgrounds/EstimationAgent.png",
    position: { x: RX2, y: DY2 },
    sourceId: "qa",
    sourceHandle: "right",
    targetHandle: "left",
  },
  "api-spec": {
    id: "api-spec",
    stepNum: "18",
    label: "API Specification",
    stage: "API_SPEC_GENERATION",
    agentKey: "api-spec",
    gradient: "from-[#06b6d4] to-[#0891b2]",
    lineColor: "#06b6d4",
    icon: "/agentBackgrounds/APISpecification.png",
    position: { x: RX3, y: DY2 },
    sourceId: "estimation",
    sourceHandle: "right",
    targetHandle: "left",
  },

  // --- PHASE 4: VALIDATION & COMPILATION (Bottom-Left) ---
  critic: {
    id: "critic",
    stepNum: "19",
    label: "Critic Agent",
    stage: "VALIDATION",
    agentKey: "validation",
    gradient: "from-[#6d28d9] to-[#4c1d95]",
    lineColor: "#6d28d9",
    icon: "/agentBackgrounds/ValidationAgent.png",
    position: { x: LX1, y: DY1 },
    sourceHandle: "left-bottom",
    targetHandle: "right",
  },
  debate: {
    id: "debate",
    stepNum: "20",
    label: "Debate Agent",
    stage: "DEBATE",
    agentKey: "debate",
    gradient: "from-[#8b5cf6] to-[#6d28d9]",
    lineColor: "#8b5cf6",
    icon: "/agentBackgrounds/ValidationAgent.png",
    position: { x: LX2, y: DY1 },
    sourceId: "critic",
    sourceHandle: "left",
    targetHandle: "right",
  },
  compiler: {
    id: "compiler",
    stepNum: "21",
    label: "Compiler Agent",
    stage: "COMPILATION",
    agentKey: "compilation",
    gradient: "from-[#0891b2] to-[#0e7490]",
    lineColor: "#0891b2",
    icon: "/agentBackgrounds/CompilationAgent.png",
    position: { x: LX1, y: DY2 },
    sourceId: "critic",
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  "build-prompt": {
    id: "build-prompt",
    stepNum: "22",
    label: "Build Prompt",
    stage: "BUILD_PROMPT_GENERATION",
    agentKey: "build-prompt",
    gradient: "from-[#0ea5e9] to-[#0369a1]",
    lineColor: "#0ea5e9",
    icon: "/agentBackgrounds/CompilationAgent.png",
    position: { x: LX2, y: DY2 },
    sourceId: "compiler",
    sourceHandle: "left",
    targetHandle: "right",
  },
  "gap-analysis": {
    id: "gap-analysis",
    stepNum: "23",
    label: "Gap Analysis",
    stage: "GAP_ANALYSIS",
    agentKey: "gap-analysis",
    gradient: "from-[#eab308] to-[#a16207]",
    lineColor: "#eab308",
    icon: "/agentBackgrounds/ValidationAgent.png",
    // Directly under Compiler — avoids cutting through Build Prompt
    position: { x: LX1, y: DY3 },
    sourceId: "compiler",
    sourceHandle: "bottom",
    targetHandle: "top",
  },
};

// Lookup mapping for themes
const AGENT_THEMES_BY_KEY: Record<string, AgentTheme> = {
  discovery: AGENT_THEMES.discovery,
  DISCOVERY: AGENT_THEMES.discovery,
  research: AGENT_THEMES.research,
  RESEARCH: AGENT_THEMES.research,
  "business-analysis": AGENT_THEMES.ba,
  ba: AGENT_THEMES.ba,
  BUSINESS_ANALYSIS: AGENT_THEMES.ba,
  "product-analysis": AGENT_THEMES.pm,
  pm: AGENT_THEMES.pm,
  PRODUCT_ANALYSIS: AGENT_THEMES.pm,
  "requirements-engineering": AGENT_THEMES.req,
  req: AGENT_THEMES.req,
  REQUIREMENTS_ENGINEERING: AGENT_THEMES.req,
  "ux-design": AGENT_THEMES.ux,
  ux: AGENT_THEMES.ux,
  UX_DESIGN: AGENT_THEMES.ux,
  "data-architecture": AGENT_THEMES.data,
  data: AGENT_THEMES.data,
  DATA_ARCHITECTURE: AGENT_THEMES.data,
  "ai-architecture": AGENT_THEMES.ai,
  ai: AGENT_THEMES.ai,
  AI_ARCHITECTURE: AGENT_THEMES.ai,
  "solution-architecture": AGENT_THEMES.solution,
  solution: AGENT_THEMES.solution,
  SOLUTION_ARCHITECTURE: AGENT_THEMES.solution,
  "security-review": AGENT_THEMES.security,
  security: AGENT_THEMES.security,
  SECURITY_REVIEW: AGENT_THEMES.security,
  "qa-planning": AGENT_THEMES.qa,
  qa: AGENT_THEMES.qa,
  QA_PLANNING: AGENT_THEMES.qa,
  estimation: AGENT_THEMES.estimation,
  ESTIMATION: AGENT_THEMES.estimation,
  validation: AGENT_THEMES.critic,
  critic: AGENT_THEMES.critic,
  VALIDATION: AGENT_THEMES.critic,
  debate: AGENT_THEMES.debate,
  DEBATE: AGENT_THEMES.debate,
  compilation: AGENT_THEMES.compiler,
  compiler: AGENT_THEMES.compiler,
  COMPILATION: AGENT_THEMES.compiler,
  frd: AGENT_THEMES.frd,
  FRD: AGENT_THEMES.frd,
  FRD_GENERATION: AGENT_THEMES.frd,
  "user-stories": AGENT_THEMES["user-stories"],
  USER_STORIES: AGENT_THEMES["user-stories"],
  USER_STORIES_GENERATION: AGENT_THEMES["user-stories"],
  "tech-arch": AGENT_THEMES["tech-arch"],
  TECH_ARCH: AGENT_THEMES["tech-arch"],
  TECH_ARCH_GENERATION: AGENT_THEMES["tech-arch"],
  "db-design": AGENT_THEMES["db-design"],
  DB_DESIGN: AGENT_THEMES["db-design"],
  DB_DESIGN_GENERATION: AGENT_THEMES["db-design"],
  "api-spec": AGENT_THEMES["api-spec"],
  API_SPEC: AGENT_THEMES["api-spec"],
  API_SPEC_GENERATION: AGENT_THEMES["api-spec"],
  sow: AGENT_THEMES.sow,
  SOW: AGENT_THEMES.sow,
  SOW_GENERATION: AGENT_THEMES.sow,
  "build-prompt": AGENT_THEMES["build-prompt"],
  BUILD_PROMPT: AGENT_THEMES["build-prompt"],
  BUILD_PROMPT_GENERATION: AGENT_THEMES["build-prompt"],
  "gap-analysis": AGENT_THEMES["gap-analysis"],
  GAP_ANALYSIS: AGENT_THEMES["gap-analysis"],
};

type PipelineNodeData = {
  kind: "project" | "agent";
  projectName?: string;
  status?: string;
  label?: string;
  stage?: string;
  agentKey?: string;
  canonicalCount?: number;
  isPipelineRunning?: boolean;
};

type ProjectFlowNode = Node<PipelineNodeData, "project">;
type AgentFlowNode = Node<PipelineNodeData, "agent">;
type PipelineNode = ProjectFlowNode | AgentFlowNode;

function getTreeLayout(
  projectName: string,
  steps: DashboardStep[],
  canonicalCounts: Record<string, number> | undefined,
  isPipelineRunning: boolean,
): { nodes: PipelineNode[]; edges: Edge[] } {
  const nodes: PipelineNode[] = [];
  const edges: Edge[] = [];

  // Center Core Orchestrator Node (origin = hub center)
  nodes.push({
    id: "project",
    type: "project",
    position: { x: -HUB_HALF_W, y: -HUB_HALF_H },
    data: {
      kind: "project",
      projectName,
      status: isPipelineRunning ? "RUNNING" : "IDLE",
      isPipelineRunning,
    },
    width: PROJECT_NODE_WIDTH,
    height: PROJECT_NODE_HEIGHT,
  });

  const stepByStage = new Map(steps.map((s) => [s.stage, s]));

  // Build all agent nodes and connecting edges
  Object.entries(AGENT_THEMES).forEach(([id, theme]) => {
    const step = stepByStage.get(theme.stage);
    // Never invent COMPLETED for missing steps — idle projects looked fully green.
    const status = step?.status ?? "QUEUED";
    const isProcessing = status === "RUNNING" || status === "IN_PROGRESS";
    const sourceId = theme.sourceId ?? "project";

    nodes.push({
      id,
      type: "agent",
      position: theme.position,
      data: {
        kind: "agent",
        label: theme.label,
        stage: theme.stage,
        agentKey: theme.agentKey,
        status,
        canonicalCount: canonicalCounts?.[theme.agentKey] ?? 0,
        isPipelineRunning,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });

    let strokeColor = theme.lineColor;
    let strokeWidth = 2;
    let strokeDasharray: string | undefined = undefined;
    let animated = false;

    if (isPipelineRunning) {
      strokeDasharray = "5 5";
      if (isProcessing) {
        strokeColor = "#f59e0b";
        strokeWidth = 3;
        strokeDasharray = "8 6";
        animated = true;
      } else {
        strokeWidth = 1.6;
      }
    }

    // Hub spokes use bezier (fan from distinct handles). Chains use smoothstep (no crossings).
    const fromHub = sourceId === "project";
    edges.push({
      id: `edge-${sourceId}-${id}`,
      source: sourceId,
      target: id,
      sourceHandle: theme.sourceHandle ?? "top",
      targetHandle: theme.targetHandle ?? "bottom",
      type: fromHub ? "default" : "smoothstep",
      animated,
      style: {
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray,
        opacity: isProcessing ? 1 : 0.8,
      },
      className: isProcessing ? "edge-animate" : undefined,
    });
  });

  return { nodes, edges };
}

// Center Project Node Component
function ProjectNodeComponent({ data }: NodeProps<ProjectFlowNode>) {
  const isRunning = data.isPipelineRunning;

  return (
    <div className="relative flex items-center justify-center">
      {/* Cardinal + offset handles so hub edges leave from distinct points */}
      <Handle type="target" position={Position.Top} id="top" className="opacity-0" />
      <Handle type="source" position={Position.Top} id="top" className="opacity-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="opacity-0" />
      <Handle type="target" position={Position.Left} id="left" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="left" className="opacity-0" />
      <Handle type="target" position={Position.Right} id="right" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="right" className="opacity-0" />
      <Handle
        type="source"
        position={Position.Left}
        id="left-top"
        className="opacity-0"
        style={{ top: "12%" }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-bottom"
        className="opacity-0"
        style={{ top: "88%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-top"
        className="opacity-0"
        style={{ top: "12%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-bottom"
        className="opacity-0"
        style={{ top: "88%" }}
      />

      {/* Radial aura glow when active */}
      {isRunning && (
        <div className="absolute -inset-5 rounded-3xl bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 opacity-60 blur-2xl animate-pulse" />
      )}

      <div
        className={cn(
          "relative flex items-center gap-3.5 overflow-visible rounded-2xl px-5 py-4 transition-all duration-500",
          isRunning
            ? "bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] border-2 border-white text-white shadow-[0_0_50px_rgba(139,92,246,0.6)]"
            : "bg-indigo-950/80 backdrop-blur-xl border border-indigo-400/40 text-white shadow-[0_12px_30px_rgba(99,102,241,0.3)]",
        )}
        style={{
          width: PROJECT_NODE_WIDTH,
          height: PROJECT_NODE_HEIGHT,
          fontFamily: "'Hanken Grotesk', sans-serif",
        }}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/40 border border-white/30 text-white shadow-inner">
          <Sparkles className={cn("h-6 w-6 text-white", isRunning && "animate-spin")} style={{ animationDuration: "6s" }} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <h3 className="truncate text-lg font-extrabold tracking-tight text-white leading-snug">
            Project Overview
          </h3>
          <p
            className={cn(
              "mt-1.5 line-clamp-2 text-sm leading-snug",
              isRunning
                ? "font-mono font-bold text-purple-100 tracking-wider"
                : "text-indigo-200/80 font-medium",
            )}
          >
            {isRunning
              ? "ACTIVE ORCHESTRATION"
              : (data.projectName ?? "AI Project Pipeline")}
          </p>
        </div>
      </div>
    </div>
  );
}

// Agent Node Component
function AgentNodeComponent({ data }: NodeProps<AgentFlowNode>) {
  const [imgError, setImgError] = useState(false);
  const isRunning = data.status === "RUNNING" || data.status === "IN_PROGRESS";
  const isDone = data.status === "COMPLETED";
  const isFailed = data.status === "FAILED";

  const key = data.agentKey ?? "discovery";
  const theme = AGENT_THEMES_BY_KEY[key] ?? AGENT_THEMES.discovery;

  return (
    <div className="relative flex items-center justify-center overflow-visible">
      <Handle type="target" position={Position.Top} id="top" className="opacity-0" />
      <Handle type="source" position={Position.Top} id="top" className="opacity-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="opacity-0" />
      <Handle type="target" position={Position.Left} id="left" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="left" className="opacity-0" />
      <Handle type="target" position={Position.Right} id="right" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="right" className="opacity-0" />

      <div
        className={cn(
          "relative flex items-center gap-3.5 overflow-visible rounded-xl px-5 py-4 text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-all duration-300 border border-white/25",
          `bg-gradient-to-r ${theme.gradient}`,
          isRunning && "ring-2 ring-[#f59e0b] shadow-[0_0_14px_rgba(245,158,11,0.65)] animate-pulse",
          isFailed && "ring-2 ring-red-400 shadow-[0_0_20px_rgba(239,68,68,0.7)]",
        )}
        style={{
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          boxSizing: "border-box",
          fontFamily: "'Hanken Grotesk', sans-serif",
        }}
      >
        {/* Left Circular Avatar Icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/35 border border-white/25 overflow-hidden shadow-inner">
          {theme.icon && !imgError ? (
            <img
              src={theme.icon}
              alt={data.label ?? ""}
              className="h-7 w-7 object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <Bot className="h-6 w-6 text-white" />
          )}
        </div>

        {/* Right Label & Status Badge */}
        <div className="min-w-0 flex-1 pr-8">
          <h4 className="truncate text-lg font-bold tracking-tight text-white leading-snug">
            {data.label ?? theme.label}
          </h4>
          <div className="mt-2.5 flex items-center gap-1.5">
            {isFailed ? (
              <span
                className="flex items-center gap-1.5 text-sm font-bold text-red-200 tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                ERROR <AlertTriangle className="h-4 w-4 text-red-300 inline" />
              </span>
            ) : isRunning ? (
              <span
                className="flex items-center gap-1.5 text-sm font-bold text-amber-200 tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                PROCESSING <span className="h-2.5 w-2.5 rounded-full bg-amber-300 animate-ping inline-block" />
              </span>
            ) : isDone ? (
              <span
                className="flex items-center gap-1.5 text-sm font-bold text-emerald-200 tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                COMPLETED <CheckCircle2 className="h-4 w-4 text-emerald-300 inline" />
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 text-sm font-medium text-white/80 tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                QUEUED <CircleDot className="h-3.5 w-3.5 text-white/60 inline" />
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Step Number Badge */}
        <div
          className="absolute top-3 right-3 z-10 rounded-md bg-black/45 px-2 py-1 text-sm font-bold text-white/85 backdrop-blur-sm border border-white/15"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          #{theme.stepNum}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  project: ProjectNodeComponent,
  agent: AgentNodeComponent,
};

/** Keeps the full graph inside the visible React Flow viewport. */
function FitGraphInView({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();

  useEffect(() => {
    if (!ready || nodeCount === 0) return;

    const run = () => {
      void fitView({
        padding: 0.12,
        includeHiddenNodes: false,
        minZoom: 0.04,
        maxZoom: 0.95,
        duration: 0,
      });
    };

    const raf = requestAnimationFrame(run);
    const t = window.setTimeout(run, 80);
    window.addEventListener("resize", run);

    const host = document.querySelector(".react-flow")?.parentElement;
    let observer: ResizeObserver | undefined;
    if (host) {
      observer = new ResizeObserver(() => run());
      observer.observe(host);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("resize", run);
      observer?.disconnect();
    };
  }, [ready, nodeCount, fitView]);

  return null;
}

interface TreePipelineViewProps {
  projectName?: string;
  projectId: string;
  steps: DashboardStep[];
  projectStatus: string;
  canonicalCounts?: Record<string, number>;
  /** Called when an agent node is clicked (passes agentKey). */
  onAgentClick?: (agentKey: string) => void;
}

function TreePipelineViewInner({
  projectName = "Healthcare Platform",
  projectId,
  steps,
  projectStatus,
  canonicalCounts,
  onAgentClick,
}: TreePipelineViewProps) {
  const isPipelineRunning =
    [
      "DISCOVERING",
      "RESEARCHING",
      "ANALYSING",
      "GENERATING_REQUIREMENTS",
      "DESIGNING",
      "ARCHITECTING",
      "SECURITY_REVIEW",
      "QA_ANALYSIS",
      "ESTIMATING",
      "VALIDATING",
      "COMPILING",
      "GAP_ANALYSIS_REVIEW",
      "RUNNING",
      "IN_PROGRESS",
    ].includes(projectStatus) ||
    steps.some((s) => s.status === "RUNNING" || s.status === "IN_PROGRESS");

  const { nodes, edges } = useMemo(
    () => getTreeLayout(projectName, steps, canonicalCounts, isPipelineRunning),
    [projectName, steps, canonicalCounts, isPipelineRunning],
  );

  return (
    <div
      className="relative w-full max-w-full overflow-hidden rounded-2xl border border-slate-800 shadow-2xl"
      style={{
        // Stay inside the browser window (account for page chrome + side panel)
        height: "min(70vh, 780px)",
        minHeight: 480,
        backgroundColor: "#080e1e",
      }}
    >
      {/* Floating Phase Header Badges */}
      <div className="pointer-events-none absolute top-3 left-4 z-10 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md border border-slate-700/80 shadow-lg">
        <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
        PHASE 1: DISCOVERY & STRATEGY
      </div>
      <div className="pointer-events-none absolute top-3 right-4 z-10 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md border border-slate-700/80 shadow-lg">
        <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
        PHASE 2: REQUIREMENTS & ARCHITECTURE
      </div>
      <div className="pointer-events-none absolute bottom-3 right-4 z-10 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md border border-slate-700/80 shadow-lg">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        PHASE 3: SOLUTION & SECURITY
      </div>
      <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md border border-slate-700/80 shadow-lg">
        <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
        PHASE 4: VALIDATION & COMPILATION
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes as any}
        fitView
        fitViewOptions={{
          padding: 0.12,
          includeHiddenNodes: false,
          minZoom: 0.04,
          maxZoom: 0.95,
        }}
        minZoom={0.04}
        maxZoom={1.5}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag={true}
        preventScrolling={true}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node) => {
          if (node.type === "agent" && onAgentClick) {
            const data = node.data as { agentKey?: string };
            if (data.agentKey) onAgentClick(data.agentKey);
          }
        }}
      >
        <FitGraphInView nodeCount={nodes.length} />
        <Background
          variant={BackgroundVariant.Lines}
          gap={40}
          size={1}
          color="rgba(255, 255, 255, 0.08)"
        />
      </ReactFlow>
    </div>
  );
}

export function TreePipelineView({
  projectName,
  projectId,
  steps,
  projectStatus,
  canonicalCounts,
  onAgentClick,
}: TreePipelineViewProps) {
  return (
    <ReactFlowProvider>
      <TreePipelineViewInner
        projectName={projectName}
        projectId={projectId}
        steps={steps}
        projectStatus={projectStatus}
        canonicalCounts={canonicalCounts}
        onAgentClick={onAgentClick}
      />
    </ReactFlowProvider>
  );
}
