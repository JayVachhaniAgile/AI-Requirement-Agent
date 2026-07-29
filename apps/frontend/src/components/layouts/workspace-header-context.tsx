import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface WorkspaceHeaderState {
  projectName?: string;
  projectStatus?: string;
  setWorkspaceHeader: (next: { projectName?: string; projectStatus?: string }) => void;
}

const WorkspaceHeaderContext = createContext<WorkspaceHeaderState>({
  setWorkspaceHeader: () => undefined,
});

export function WorkspaceHeaderProvider({ children }: { children: ReactNode }) {
  const [projectName, setProjectName] = useState<string | undefined>();
  const [projectStatus, setProjectStatus] = useState<string | undefined>();

  const value = useMemo(
    () => ({
      projectName,
      projectStatus,
      setWorkspaceHeader: (next: { projectName?: string; projectStatus?: string }) => {
        setProjectName(next.projectName);
        setProjectStatus(next.projectStatus);
      },
    }),
    [projectName, projectStatus],
  );

  return (
    <WorkspaceHeaderContext.Provider value={value}>{children}</WorkspaceHeaderContext.Provider>
  );
}

export function useWorkspaceHeader() {
  return useContext(WorkspaceHeaderContext);
}
