import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  getDagStateQueryKey,
  type DagNodeDelta,
  type DagRunDelta,
} from "@/lib/dag-api";
import { getGetProjectQueryKey } from "@workspace/api-client-react";
import { getProjectDashboardQueryKey } from "@/lib/project-api";
import { getSocketUrl } from "@/lib/env";

/**
 * Subscribe to DAG execution deltas for the project room and keep the DAG
 * state query fresh (`dag.node.updated` / `dag.run.updated`).
 *
 * The project dashboard query is also invalidated on every delta so the main
 * pipeline visualization (which merges workflow_steps + DAG node states)
 * updates live even when the DAG engine is the execution path.
 */
export function useDagSocket(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

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
      socket.emit("join", { projectId });
    });

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: getDagStateQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(projectId) });
      // The Project row now carries the DAG-driven status/currentStage that powers
      // the top-level header/control bar, so refetch it alongside the dashboard.
      void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    };

    socket.on("dag.node.updated", (_payload: DagNodeDelta) => refresh());
    socket.on("dag.run.updated", (_payload: DagRunDelta) => refresh());

    return () => {
      socket.emit("leave", { projectId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId, queryClient]);

  return socketRef;
}
