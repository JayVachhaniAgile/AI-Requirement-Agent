import { ProjectAgentNetwork } from "@/components/projects/ProjectAgentNetwork";
import { agentNetworkData } from "@/components/projects/ProjectAgentNetwork/agentNetworkData";

export default function ProjectOverviewPage() {
  return (
    <div className="min-h-screen bg-white p-8">
      <ProjectAgentNetwork
        projectName="Healthcare Platform"
        projectIdea="Healthcare Platform"
        agents={agentNetworkData}
        onAgentClick={(agent) => {
          console.log("Agent clicked:", agent.name);
        }}
        containerWidth={900}
        containerHeight={650}
      />
    </div>
  );
}
