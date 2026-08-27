import {
  Search,
  Briefcase,
  UserCheck,
  BookOpen,
  Database,
  FileText,
  Code2,
  Shield,
  ClipboardCheck,
  TrendingUp,
  Award,
  Lock,
  Palette,
  Box,
} from "lucide-react";

export type AgentStatus = "COMPLETED" | "IN_PROGRESS" | "PENDING" | "FAILED";

export interface AgentNodeData {
  id: string;
  name: string;
  status: AgentStatus;
  icon: React.ReactNode;
}

/** Static demo data for the `/project-overview` circular network. */
export const agentNetworkData: AgentNodeData[] = [
  {
    id: "discovery",
    name: "Discovery Agent",
    status: "COMPLETED",
    icon: <Search className="h-4 w-4" />,
  },
  {
    id: "product-manager",
    name: "Product Manager",
    status: "COMPLETED",
    icon: <Briefcase className="h-4 w-4" />,
  },
  {
    id: "business-analyst",
    name: "Business Analyst",
    status: "COMPLETED",
    icon: <UserCheck className="h-4 w-4" />,
  },
  {
    id: "research",
    name: "Research Agent",
    status: "COMPLETED",
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    id: "data-architect",
    name: "Data Architect",
    status: "COMPLETED",
    icon: <Database className="h-4 w-4" />,
  },
  {
    id: "requirements-agent",
    name: "Requirements Agent",
    status: "COMPLETED",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: "compiler",
    name: "Compiler Agent",
    status: "IN_PROGRESS",
    icon: <Code2 className="h-4 w-4" />,
  },
  {
    id: "critic",
    name: "Critic Agent",
    status: "PENDING",
    icon: <Shield className="h-4 w-4" />,
  },
  {
    id: "ai-architect",
    name: "AI Architect",
    status: "PENDING",
    icon: <Box className="h-4 w-4" />,
  },
  {
    id: "estimation",
    name: "Estimation Agent",
    status: "PENDING",
    icon: <TrendingUp className="h-4 w-4" />,
  },
  {
    id: "qa-agent",
    name: "QA Agent",
    status: "PENDING",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
  {
    id: "security-agent",
    name: "Security Agent",
    status: "FAILED",
    icon: <Lock className="h-4 w-4" />,
  },
  {
    id: "ux-agent",
    name: "UX Agent",
    status: "PENDING",
    icon: <Palette className="h-4 w-4" />,
  },
  {
    id: "solution-architect",
    name: "Solution Architect",
    status: "PENDING",
    icon: <Award className="h-4 w-4" />,
  },
];
