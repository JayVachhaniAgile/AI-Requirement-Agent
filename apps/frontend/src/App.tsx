import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, Redirect } from "wouter";

import { ThemeProvider } from "@/components/theme-provider";
import { AppLayout } from "@/components/layouts/AppLayout";
import { WorkspaceHeaderProvider, useWorkspaceHeader } from "@/components/layouts/workspace-header-context";
import NewProjectPage from "@/pages/projects/new";
import ProjectWorkspace from "@/pages/projects/[id]";
import DashboardPage from "@/pages/dashboard";
import AiWorkflowPage from "@/pages/ai-workflow";
import ValidationHubPage from "@/pages/validation-hub";
import DocumentsHubPage from "@/pages/documents-hub";
import AnalyticsPage from "@/pages/analytics";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient();

function Shell({ children }: { children: React.ReactNode }) {
  const { projectName, projectStatus } = useWorkspaceHeader();
  return (
    <AppLayout projectName={projectName} projectStatus={projectStatus}>
      {children}
    </AppLayout>
  );
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/projects/new" component={NewProjectPage} />
        <Route path="/projects/:id" component={ProjectWorkspace} />
        <Route path="/ai-workflow" component={AiWorkflowPage} />
        <Route path="/validation" component={ValidationHubPage} />
        <Route path="/documents" component={DocumentsHubPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WorkspaceHeaderProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </WorkspaceHeaderProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
