import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getSocketUrl } from '@/lib/env';

export interface GapAnalysisProgressEvent {
  projectId: string;
  activeRun: {
    status: string;
    phase: string;
    phaseDetail: string | null;
    iteration: number;
    error?: string | null;
  };
}

export interface GapAnalysisLiveState {
  connected: boolean;
  activeRun: {
    status: string;
    phase: string;
    phaseDetail: string | null;
    iteration: number;
    error?: string | null;
  } | null;
}

export function useGapAnalysisSocket(projectId: string | undefined) {
  const socketRef = useRef<typeof Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeRun, setActiveRun] = useState<{
    status: string;
    phase: string;
    phaseDetail: string | null;
    iteration: number;
    error?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const socket = io(`${getSocketUrl()}/projects`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { projectId: projectId });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on(
      'gap.analysis.progress',
      (payload: {
        activeRun: {
          status: string;
          phase: string;
          phaseDetail: string | null;
          iteration: number;
          error?: string | null;
        } | null;
      }) => {
        if (payload.activeRun) {
          setActiveRun(payload.activeRun);
        }
      },
    );

    return () => {
      socket.emit("leave", { projectId });
      socket.disconnect();
    };
  }, [projectId]);

  return { connected, activeRun };
}
