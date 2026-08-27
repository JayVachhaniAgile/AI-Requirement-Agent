import type { FewShotExample } from '../../template.types';

/**
 * Few-shot example for the Discovery agent. Kept opt-in (not attached to the
 * live template) so existing packaged prompts stay byte-for-byte identical.
 * Used by the builder tests to demonstrate few-shot assembly.
 */
export const discoveryFewShotExamples: FewShotExample[] = [
  {
    user:
      'Project: Task Tracker\n\nSoftware Idea:\nA simple task management app with users, tasks, and due dates.',
    assistant:
      'ideaInterpretation: "A multi-user task management web app."\nproblemStatement: "Teams need a shared place to track tasks and deadlines."\nproposedSolution: "A web app with user accounts, task CRUD, and due-date reminders."\nconfirmedFacts: [{"externalId": "FACT-001", "title": "Multi-user", "description": "Users can create accounts."}]\nblockingQuestions: []',
  },
];
