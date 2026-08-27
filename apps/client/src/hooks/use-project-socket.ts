import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  getGetProjectQueryKey,
  getGetProjectProgressQueryKey,
  getListExecutionsQueryKey,
  getListKnowledgeItemsQueryKey,
  getGetDocumentQueryKey,
} from "@workspace/api-client-react";
import {
  getProjectDashboardQueryKey,
  type AgentActivityEvent,
  type KnowledgeCreatedEvent,
  type ProjectDashboard,
} from "@/lib/project-api";
import { getSocketUrl } from "@/lib/env";

export interface ProjectLiveState {
  connected: boolean;
  activities: Record<string, AgentActivityEvent>;
  recentOutputs: KnowledgeCreatedEvent["items"];
}

/**
 * Subscribe to project Socket.IO room and keep React Query caches fresh.
 * Falls back to letting callers poll when `connected` is false.
 */
export function useProjectSocket(projectId: string | undefined): ProjectLiveState {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [activities, setActivities] = useState<Record<string, AgentActivityEvent>>({});
  const [recentOutputs, setRecentOutputs] = useState<KnowledgeCreatedEvent["items"]>([]);

  useEffect(() => {
    if (!projectId) return;

    const socket = io(`${getSocketUrl()}/projects`, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1500,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join", { projectId });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("dashboard.snapshot", (snapshot: ProjectDashboard) => {
      queryClient.setQueryData(getProjectDashboardQueryKey(projectId), snapshot);
      queryClient.setQueryData(getGetProjectQueryKey(projectId), (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        return {
          ...prev,
          status: snapshot.status,
          currentStage: snapshot.currentStage,
        };
      });
      queryClient.setQueryData(getGetProjectProgressQueryKey(projectId), {
        projectId,
        status: snapshot.status,
        steps: snapshot.steps.map((s) => ({
          id: s.id,
          projectId,
          stage: s.stage,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          error: s.error,
          createdAt: s.startedAt ?? snapshot.updatedAt,
          updatedAt: snapshot.updatedAt,
        })),
      });
      if (snapshot.hasDocument) {
        void queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(projectId) });
      }
    });

    socket.on(
      "project.status",
      (payload: { status: string; currentStage: string | null; errorMessage?: string | null }) => {
        queryClient.setQueryData(getGetProjectQueryKey(projectId), (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev;
          return {
            ...prev,
            status: payload.status,
            currentStage: payload.currentStage,
            errorMessage: payload.errorMessage ?? null,
          };
        });
        void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(projectId) });
      },
    );

    socket.on("stage.updated", () => {
      void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: getGetProjectProgressQueryKey(projectId) });
    });

    socket.on("agent.activity", (payload: AgentActivityEvent) => {
      setActivities((prev) => ({ ...prev, [payload.agentKey]: payload }));
    });

    socket.on("knowledge.created", (payload: KnowledgeCreatedEvent) => {
      setRecentOutputs((prev) => [...payload.items, ...prev].slice(0, 40));
      void queryClient.invalidateQueries({ queryKey: getListKnowledgeItemsQueryKey(projectId) });
    });

    socket.on("reasoning.trace", (payload: { projectId: string; agentKey: string; traces: string[] }) => {
      setActivities((prev) => {
        const existing = prev[payload.agentKey];
        if (!existing) return prev;
        return {
          ...prev,
          [payload.agentKey]: { ...existing, reasoningTraces: payload.traces },
        };
      });
    });

    socket.on("execution.updated", () => {
      void queryClient.invalidateQueries({ queryKey: getListExecutionsQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(projectId) });
    });

    return () => {
      socket.emit("leave", { projectId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [projectId, queryClient]);

  return { connected, activities, recentOutputs };
}
