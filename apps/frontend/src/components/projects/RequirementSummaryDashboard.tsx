import { useRef, useEffect } from "react";
import { motion, useInView, animate } from "framer-motion";
import {
  Activity,
  Users,
  BadgeCheck,
  TriangleAlert,
  FileWarning,
  ShieldCheck,
  ChevronRight,
  Clock,
  HelpCircle,
  Play,
  RefreshCw,
  Sparkles,
  Zap,
  Target,
  FileText,
  Brain,
  Database,
  Monitor,
  CircleCheck
} from "lucide-react";

interface DashboardData {
  percentComplete?: number;
  completedAgents?: number;
  totalAgents?: number;
  requirementCompleteness?: number;
  aiConfidence?: number;
  criticalIssueCount?: number;
  openQuestionCount?: number;
  etaSeconds?: number;
  updatedAt?: string;
  status?: string;
  currentStage?: string | null;
  requirementCount?: number;
  knowledgeItemCount?: number;
  hasDocument?: boolean;
  projectId?: string;
}

interface Props {
  dashboard?: DashboardData;
  projectId?: string;
  knowledge?: any[];
}

interface MetricConfig {
  key: string;
  title: string;
  accent: string;
  icon: React.ElementType;
  caption: string;
  type: "ring" | "count" | "sparkline" | "gauge";
}

const METRICS: MetricConfig[] = [
  { key: "progress", title: "Pipeline Progress", accent: "#06B6D4", icon: Activity, caption: "All agents executed successfully", type: "ring" },
  { key: "agents", title: "Agents Completed", accent: "#3B82F6", icon: Users, caption: "All agents have completed their tasks", type: "count" },
  { key: "quality", title: "Quality Score", accent: "#22C55E", icon: BadgeCheck, caption: "High quality requirements generated", type: "sparkline" },
  { key: "issues", title: "Critical Issues", accent: "#F59E0B", icon: TriangleAlert, caption: "Issues need your attention", type: "sparkline" },
  { key: "missing", title: "Missing Requirements", accent: "#A855F7", icon: FileWarning, caption: "Recommended to review", type: "sparkline" },
  { key: "confidence", title: "AI Confidence", accent: "#10B981", icon: ShieldCheck, caption: "High confidence in generated output", type: "gauge" },
];

function ProgressRing({ value, accent, size = 72, stroke = 10 }: { value: number; accent: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ref = useRef<SVGCircleElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (inView && ref.current) {
      const el = ref.current;
      el.style.strokeDasharray = '0 ' + circ;
      animate(0, Math.min(100, Math.max(0, value)), {
        duration: 1.2, ease: "easeOut",
        onUpdate(latest) {
          const visible = (latest / 100) * circ;
          el.style.strokeDasharray = visible + ' ' + circ;
       }
     });
   }
 }, [inView, value, circ]);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle ref={ref} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={'0 ' + circ} />
    </svg>
  );
}

function GaugeMeter({ value, accent = "#10B981", size = 72, stroke = 10 }: { value: number; accent?: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = Math.PI * r;
  const ref = useRef<SVGPathElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (inView && ref.current) {
      const el = ref.current;
      el.style.strokeDasharray = '0 ' + circ;
      animate(0, Math.min(100, Math.max(0, value)), {
        duration: 1.2, ease: "easeOut",
        onUpdate(latest) {
          const visible = (latest / 100) * circ;
          el.style.strokeDasharray = visible + ' ' + circ;
       }
     });
   }
 }, [inView, value, circ]);
  return (
    <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`}>
      <path d={`M 2 ${size / 2 + stroke / 2} A ${r} ${r} 0 0 1 ${size - 2} ${size / 2 + stroke / 2}`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} strokeLinecap="round" />
      <path ref={ref} d={`M 2 ${size / 2 + stroke / 2} A ${r} ${r} 0 0 1 ${size - 2} ${size / 2 + stroke / 2}`} fill="none" stroke={accent} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={'0 ' + circ} />
    </svg>
  );
}

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (inView && ref.current) {
      animate(0, Math.max(0, value), {
        duration: 1.2, ease: "easeOut",
        onUpdate(latest) { if (ref.current) ref.current.textContent = `${Math.round(latest)}${suffix}`; }
     });
   }
 }, [inView, value, suffix]);
  return <span ref={ref}>{value}{suffix}</span>;
}

function Sparkline({ value = 65, accent = "#22C55E", height = 32, width = 64 }: { value?: number; accent?: string; height?: number; width?: number }) {
  const pts = [10, 20, 15, 30, 22, 40, 35, value, 62, 50, 68, 45, 55].map((v, i) => ({ x: (i / 12) * width, y: height - (v / 100) * height }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const ref = useRef<SVGPathElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (inView && ref.current) {
      const len = ref.current.getTotalLength();
      ref.current.style.strokeDasharray = String(len);
      ref.current.style.strokeDashoffset = String(len);
      animate(len, 0, { duration: 1.5, ease: "easeOut", onUpdate(latest) { if (ref.current) ref.current.style.strokeDashoffset = String(latest); } });
   }
 }, [inView]);
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}><path ref={ref} d={d} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${accent}44)` }} /></svg>;
}

function MetricCard({ config, dashboard }: { config: MetricConfig; dashboard: DashboardData }) {
  const d = dashboard;
  const val = d?.percentComplete ?? 0;
  const agentsDone = d?.completedAgents ?? 0;
  const agentsTotal = d?.totalAgents ?? 0;
  const quality = d?.requirementCompleteness ?? 0;
  const issues = d?.criticalIssueCount ?? 0;
  const missing = d?.openQuestionCount ?? 0;
  const confidence = d?.aiConfidence ?? 0;

  const renderMetric = () => {
    switch (config.type) {
      case "ring":
        return (
          <div className="relative flex items-center justify-center">
            <ProgressRing value={val} accent={config.accent} size={90} stroke={10} />
            <span className="absolute text-lg font-bold text-white">{val}%</span>
          </div>
        );
      case "count":
        return (
          <div className="flex flex-col items-center justify-center gap-2.5">
            <div className="text-[36px] font-bold text-white leading-none tracking-tight">
              <CountUp value={agentsDone} /> <span className="text-white/40 text-2xl">/</span> <span className="text-white">{agentsTotal || 0}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/5">
              <motion.div className="h-full rounded-full" style={{ background: config.accent }} initial={{ width: 0 }} animate={{ width: `${agentsTotal > 0 ? (agentsDone / agentsTotal) * 100 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} />
            </div>
          </div>
        );
      case "sparkline":
        const sv = config.key === "quality" ? quality : config.key === "issues" ? issues : missing;
        return (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="text-[36px] font-bold text-white leading-none tracking-tight">{config.key === "quality" ? <><CountUp value={sv} suffix="%" /></> : <CountUp value={sv} />}</div>
            <Sparkline value={config.key === "quality" ? Math.max(10, quality) : config.key === "issues" ? Math.min(100, sv * 10) : Math.min(100, sv * 8)} accent={config.accent} />
          </div>
        );
      case "gauge":
        return (
          <div className="flex flex-col items-center justify-center gap-1">
            <GaugeMeter value={confidence} accent={config.accent} size={90} stroke={7} />
            <span className="text-base font-bold text-white">{confidence}%</span>
          </div>
        );
   }
 };

  const Icon = config.icon;
  const getStatusBadge = (key: string): { label: string; color: string } => {
    switch (key) {
      case "progress":
        if (val >= 100) return { label: "Completed", color: config.accent };
        if (val > 0) return { label: "In Progress", color: "#F59E0B" };
        return { label: "Pending", color: "#64748B" };
      case "agents":
        if (agentsDone > 0 && agentsDone >= agentsTotal) return { label: "Complete", color: config.accent };
        if (agentsDone > 0) return { label: "In Progress", color: "#F59E0B" };
        return { label: "Pending", color: "#64748B" };
      case "quality":
        if (quality >= 80) return { label: "High", color: config.accent };
        if (quality >= 50) return { label: "Medium", color: "#F59E0B" };
        return { label: "Low", color: "#EF4444" };
      case "issues":
        if (issues > 0) return { label: "Attention", color: config.accent };
        return { label: "None", color: config.accent };
      case "missing":
        if (missing > 0) return { label: "Review", color: config.accent };
        return { label: "None", color: config.accent };
      case "confidence":
        if (confidence >= 80) return { label: "High", color: config.accent };
        if (confidence >= 50) return { label: "Medium", color: "#F59E0B" };
        return { label: "Low", color: "#EF4444" };
      default:
        return { label: "", color: "#64748B" };
   }
 };
  const badge = getStatusBadge(config.key);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
      className="group relative flex flex-col rounded-2xl border p-[16px] h-[240px] overflow-hidden transition-all duration-300 hover:-translate-y-[3px]"
      style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ boxShadow: `0 0 24px ${config.accent}22`, border: `1px solid ${config.accent}33` }} />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: `${config.accent}1A` }}><Icon className="w-4 h-4" style={{ color: config.accent }} /></div>
          <span className="text-xs font-medium tracking-wide" style={{ color: "#94A3B8" }}>{config.title}</span>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: badge.color, opacity: badge.label === "Pending" || badge.label === "None" ? 0.5 : 0.8 }}>{badge.label}</span>
      </div>
      <div className="flex-1 flex items-center justify-center">{renderMetric()}</div>
      <p className="text-[11px] leading-snug mt-2 truncate" style={{ color: "#64748B" }}>{config.caption}</p>
    </motion.div>
  );
}

function DeliverableCard({ item }: { item: { key: string; label: string; value: string; sub: string; icon: React.ElementType; color: string } }) {
  const Icon = item.icon;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-[2px]"
      style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
      <div className="flex items-center gap-3">
        <div className="rounded-lg p-2.5 shrink-0" style={{ backgroundColor: `${item.color}1A` }}><Icon className="w-[18px] h-[18px]" style={{ color: item.color }} /></div>
        <div className="min-w-0">
          <div className="text-[28px] font-bold text-white leading-none">{item.value}</div>
          <div className="text-sm font-medium mt-1" style={{ color: "#CBD5E1" }}>{item.label}</div>
          <div className="text-xs mt-0.5" style={{ color: "#64748B" }}>{item.sub}</div>
        </div>
      </div>
    </motion.div>
  );
}

function NextStepCard({ step, onClick }: { step: { id: number; title: string; desc: string; icon: React.ElementType; color: string }; onClick?: () => void }) {
  const Icon = step.icon;
  return (
    <motion.button whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 300 }}
      onClick={onClick}
      className="group relative w-full rounded-2xl border p-4 transition-all duration-300 text-left flex items-center gap-4"
      style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
      <div className="rounded-lg p-2.5 shrink-0" style={{ backgroundColor: `${step.color}1A` }}><Icon className="w-[18px] h-[18px]" style={{ color: step.color }} /></div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white group-hover:text-white/90 transition-colors">{step.title}</div>
        <div className="text-xs mt-0.5" style={{ color: "#64748B" }}>{step.desc}</div>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 transition-all duration-300 group-hover:translate-x-1" style={{ color: "#475569" }} />
    </motion.button>
  );
}

function InfoRow({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ElementType; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
      <div className="rounded-lg p-2" style={{ backgroundColor: `${accent}1A` }}><Icon className="w-4 h-4" style={{ color: accent }} /></div>
      <div className="min-w-0">
        <div className="text-[11px]" style={{ color: "#64748B" }}>{label}</div>
        <div className="text-sm font-medium text-white truncate">{value}</div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ─── Shared component exports ────────────────────────────
function getNextSteps(dashboard?: DashboardData | null): Array<{ id: number; title: string; desc: string; icon: React.ElementType; color: string }> {
  const steps: Array<{ id: number; title: string; desc: string; icon: React.ElementType; color: string }> = [];
  const issues = dashboard?.criticalIssueCount ?? 0;
  const openQ = dashboard?.openQuestionCount ?? 0;
  const reqCount = dashboard?.requirementCount ?? 0;
  const hasDoc = dashboard?.hasDocument;
  const isComplete = dashboard?.status === "COMPLETED" || (dashboard?.percentComplete ?? 0) >= 100;
  const isFailed = dashboard?.status === "FAILED";
  const isPending = dashboard?.status === "CREATED" || dashboard?.status === "PENDING";
  const hasStarted = (dashboard?.percentComplete ?? 0) > 0;

  if (isPending || !hasStarted) {
    steps.push({ id: 1, title: "Start Pipeline", desc: "Begin the requirement generation process", icon: Play, color: "#3B82F6" });
  }
  if (isFailed) {
    steps.push({ id: 2, title: "Resume Pipeline", desc: "Retry from the last failed stage", icon: RefreshCw, color: "#F59E0B" });
  }
  if (reqCount > 0) {
    steps.push({ id: 3, title: "View Generated Requirements", desc: `${reqCount} requirement${reqCount > 1 ? 's' : ''} generated`, icon: FileText, color: "#06B6D4" });
  }
  if (issues > 0) {
    steps.push({ id: 4, title: "Review Critical Issues", desc: `${issues} issue${issues > 1 ? 's' : ''} need${issues === 1 ? 's' : ''} attention`, icon: TriangleAlert, color: "#F59E0B" });
  }
  if (openQ > 0) {
    steps.push({ id: 5, title: "Review Open Questions", desc: `${openQ} question${openQ > 1 ? 's' : ''} awaiting answer`, icon: HelpCircle, color: "#A855F7" });
  }
  if (hasStarted || isComplete) {
    steps.push({ id: 6, title: "Validate with Stakeholders", desc: "Share and collect feedback", icon: Users, color: "#3B82F6" });
  }
  if (hasDoc || isComplete) {
    steps.push({ id: 7, title: "Export Requirements", desc: "PDF, DOCX, Excel", icon: Sparkles, color: "#10B981" });
  }
  return steps;
}

export { getNextSteps, InfoRow, DeliverableCard, NextStepCard };

export function RequirementSummaryDashboard({ dashboard, projectId, knowledge }: Props) {
  const d = dashboard;
  const progress = d?.percentComplete ?? 0;
  const completed = d?.completedAgents ?? 0;
  const total = d?.totalAgents ?? 0;
  const quality = d?.requirementCompleteness ?? 0;
  const confidence = d?.aiConfidence ?? 0;
  const issues = d?.criticalIssueCount ?? 0;
  const missing = d?.openQuestionCount ?? 0;
  const totalReqs = d?.requirementCount ?? 0;

  const items = Array.isArray(knowledge) ? knowledge : [];
  const funcReqs = items.filter(i => i.type === 'FUNCTIONAL_REQUIREMENT').length;
  const userStories = items.filter(i => i.type === 'USER_STORY').length;
  const businessRules = items.filter(i => i.type === 'BUSINESS_RULE').length;
  const screens = items.filter(i => i.type === 'SCREEN' || i.type === 'UI_SCREEN').length;
  const acceptanceCriteria = items.filter(i => i.type === 'ACCEPTANCE_CRITERIA').length;
  const dataEntities = items.filter(i => i.type === 'DATA_ENTITY' || i.type === 'DB_TABLE').length;

  const dl = [
    { key: "reqs", label: "Requirements", value: String(Math.max(funcReqs, totalReqs)), sub: "Total generated", icon: FileText, color: "#06B6D4" },
    { key: "stories", label: "User Stories", value: String(userStories), sub: userStories > 0 ? "Ready for development" : "Not yet generated", icon: Users, color: "#3B82F6" },
    { key: "criteria", label: "Acceptance Criteria", value: String(acceptanceCriteria), sub: acceptanceCriteria > 0 ? "Detailed & clear" : "Pending", icon: BadgeCheck, color: "#22C55E" },
    { key: "rules", label: "Business Rules", value: String(businessRules), sub: businessRules > 0 ? "Defined" : "None yet", icon: Brain, color: "#F59E0B" },
    { key: "entities", label: "Data Entities", value: String(dataEntities), sub: dataEntities > 0 ? "Identified" : "Pending", icon: Database, color: "#A855F7" },
    { key: "screens", label: "UI Screens", value: String(screens), sub: screens > 0 ? "Planned" : "Not started", icon: Monitor, color: "#EC4899" },
  ];

  const isComplete = d?.status === "COMPLETED" || progress >= 100;
  const hasStarted = progress > 0 || (d?.status && d?.status !== "PENDING" && d?.status !== "NOT_STARTED");
  const statusLabel = isComplete ? "Pipeline Completed Successfully" : hasStarted ? "Pipeline In Progress" : "Pipeline Pending";
  const statusColor = isComplete ? "#22C55E" : hasStarted ? "#F59E0B" : "#64748B";
  const statusBg = isComplete ? "#22C55E0D" : hasStarted ? "#F59E0B0D" : "#64748B0D";
  const statusBorder = isComplete ? "#22C55E33" : hasStarted ? "#F59E0B33" : "#64748B33";

  return (
    <div className="mb-6">
      <div className="mx-auto" style={{ maxWidth: 1440 }}>
        {d && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight text-white">Requirement Generation Summary</h1>
              <p className="mt-2 text-base" style={{ color: "#64748B" }}>Real-time overview of your AI-powered requirement engineering pipeline.</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border" style={{ backgroundColor: statusBg, borderColor: statusBorder }}>
              {isComplete ? <CircleCheck className="w-4 h-4" style={{ color: statusColor }} /> : <Activity className="w-4 h-4 animate-pulse" style={{ color: statusColor }} />}
              <span className="text-sm font-medium" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {METRICS.map((config) => <MetricCard key={config.key} config={config} dashboard={d ?? {}} />)}
        </div>
      </div>
    </div>
  );
}
