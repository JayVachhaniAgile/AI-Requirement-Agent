import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AgentNode } from "./AgentNode";
import { agentNetworkData, type AgentNodeData } from "./agentNetworkData";
import "./projectAgentNetwork.css";

const CENTER_CARD_WIDTH = 155;
const CENTER_CARD_HEIGHT = 60;

interface ProjectAgentNetworkProps {
  projectName?: string;
  projectIdea?: string;
  /**
   * Static agent definitions (name, icon, etc.). Status will be derived from
   * the optional `nodeStatuses` prop if present.
   */
  agents?: AgentNodeData[];
  /** Optional live status overrides keyed by agent.id */
  nodeStatuses?: Record<string, string>;
  onAgentClick?: (agent: AgentNodeData) => void;
  containerWidth?: number;
  containerHeight?: number;
}

/**
 * Two-ring circular layout — 7 agents on an inner ring, 7 on an outer ring,
 * each evenly spaced around the circle. The outer ring is angularly offset by
 * half a step so nodes don't fall directly behind their inner counterpart.
 *
 * - innerRadius ≈ 35 % of the smaller container dimension
 * - outerRadius ≈ 78 % of the smaller container dimension
 * - The ~43 % gap between rings ensures no overlap and a clear visual separation.
 */
function getAgentPositions(
  agents: AgentNodeData[],
  centerX: number,
  centerY: number,
): Record<string, { x: number; y: number }> {
  const baseSize = Math.min(centerX, centerY);
  const innerRadius = baseSize * 0.75;
  const outerRadius = baseSize * 1.25;
  const HALF_RING = 7; // agents per ring

  const innerAgents = agents.slice(0, HALF_RING);
  const outerAgents = agents.slice(HALF_RING, HALF_RING * 2);

  const positions: Record<string, { x: number; y: number }> = {};

  innerAgents.forEach((agent, i) => {
    const angle = -Math.PI / 2 + (i / innerAgents.length) * Math.PI * 2;
    positions[agent.id] = {
      x: centerX + Math.cos(angle) * innerRadius,
      y: centerY + Math.sin(angle) * innerRadius,
    };
  });

  outerAgents.forEach((agent, i) => {
    const angle =
      -Math.PI / 2 +
      (i / outerAgents.length) * Math.PI * 2 +
      Math.PI / outerAgents.length;
    positions[agent.id] = {
      x: centerX + Math.cos(angle) * outerRadius,
      y: centerY + Math.sin(angle) * outerRadius,
    };
  });

  const extraAgents = agents.slice(HALF_RING * 2);
  extraAgents.forEach((agent, i) => {
    const angle = -Math.PI / 2 + (i / extraAgents.length) * Math.PI * 2;
    positions[agent.id] = {
      x: centerX + Math.cos(angle) * outerRadius,
      y: centerY + Math.sin(angle) * outerRadius,
    };
  });

  return positions;
}

export function ProjectAgentNetwork({
  projectName = "Project Overview",
  projectIdea = "Healthcare Platform",
  agents = agentNetworkData,
  onAgentClick,
  containerWidth = 1200,
  containerHeight = 900,
}: ProjectAgentNetworkProps) {
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;

  const agentPositions = useMemo(
    () => getAgentPositions(agents, centerX, centerY),
    [agents, centerX, centerY],
  );

  const subtitle = projectIdea
    ? `${projectName} is an ${projectIdea.slice(0, 30)}...`
    : `${projectName} is an AI Project Pipeline`;

  return (
    <div
      className="project-agent-network"
      style={{
        width: containerWidth,
        height: containerHeight,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        style={{ overflow: "visible" }}
      >
        {agents.map((agent) => {
          const pos = agentPositions[agent.id];
          if (!pos) return null;
          const isActive = hoveredAgentId === agent.id;
          const isRunning = agent.status === "IN_PROGRESS";

          const dx = centerX - pos.x;
          const dy = centerY - pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nx = -dy / dist;
          const ny = dx / dist;
          const cp1x = pos.x + dx * 0.33 + nx * 60;
          const cp1y = pos.y + dy * 0.33 + ny * 60;
          const cp2x = pos.x + dx * 0.66 + nx * 60;
          const cp2y = pos.y + dy * 0.66 + ny * 60;

          return (
            <path
              key={`connector-${agent.id}`}
              d={`M${pos.x},${pos.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${centerX},${centerY}`}
              className={cn(
                "connector-line",
                isActive && "connector-line--active",
                isRunning && "connector-line--running",
              )}
            />
          );
        })}
      </svg>

      <div
        className="center-card absolute pointer-events-auto"
        style={{
          width: CENTER_CARD_WIDTH,
          height: CENTER_CARD_HEIGHT,
          left: centerX - CENTER_CARD_WIDTH / 2,
          top: centerY - CENTER_CARD_HEIGHT / 2,
          zIndex: 10,
        }}
      >
        <div className="center-card-icon">
          <span>AI</span>
        </div>
        <div className="flex flex-col">
          <span className="center-card-title">Project Overview</span>
          <span className="center-card-subtitle">{subtitle.slice(0, 35)}</span>
        </div>
      </div>

      {agents.map((agent) => {
        const pos = agentPositions[agent.id];
        if (!pos) return null;
        return (
          <AgentNode
            key={agent.id}
            agent={agent}
            onClick={onAgentClick}
            onMouseEnter={() => setHoveredAgentId(agent.id)}
            onMouseLeave={() => setHoveredAgentId(null)}
            style={{
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -50%)",
              zIndex: 20,
            }}
          />
        );
      })}
    </div>
  );
}
