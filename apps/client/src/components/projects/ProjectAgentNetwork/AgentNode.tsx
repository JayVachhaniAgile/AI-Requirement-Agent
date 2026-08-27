import { memo } from "react";
import type { AgentNodeData, AgentStatus } from "./agentNetworkData";
import { cn } from "@/lib/utils";

interface AgentNodeProps {
  agent: AgentNodeData;
  onClick?: (agent: AgentNodeData) => void;
  onMouseEnter?: (agent: AgentNodeData) => void;
  onMouseLeave?: (agent: AgentNodeData) => void;
  style?: React.CSSProperties;
}

const STATUS_CLASS: Record<AgentStatus, string> = {
  COMPLETED: "agent-card--completed",
  IN_PROGRESS: "agent-card--in-progress",
  PENDING: "agent-card--pending",
  FAILED: "agent-card--failed",
};

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  COMPLETED: "agent-status-dot--completed",
  IN_PROGRESS: "agent-status-dot--in-progress",
  PENDING: "agent-status-dot--pending",
  FAILED: "agent-status-dot--failed",
};

export const AgentNode = memo(function AgentNode({
  agent,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
}: AgentNodeProps) {
  const statusClass = STATUS_CLASS[agent.status];
  const dotClass = STATUS_DOT_CLASS[agent.status];

  return (
    <div
      className={cn(
        "agent-card",
        statusClass,
        "absolute transition-all duration-200"
      )}
      style={{
        minWidth: "140px",
        maxWidth: "180px",
        minHeight: "72px",
        padding: "12px 16px",
        borderRadius: "12px",
        ...style,
      }}
      onClick={() => onClick?.(agent)}
      onMouseEnter={() => onMouseEnter?.(agent)}
      onMouseLeave={() => onMouseLeave?.(agent)}
    >
      <div className="agent-card-header">
        <div className="agent-icon">
          {agent.icon}
        </div>
        <span className="agent-name">{agent.name}</span>
      </div>
      <div className="agent-status-row">
        <span className="agent-status-text">{agent.status}</span>
        <span className={cn("agent-status-dot", dotClass)} />
      </div>
    </div>
  );
});
