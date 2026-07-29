import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const WORKFLOW_STEP_STATUSES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
] as const;

export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export const WORKFLOW_STAGES = [
  "DISCOVERY",
  "BUSINESS_ANALYSIS",
  "PRODUCT_ANALYSIS",
  "REQUIREMENTS_ENGINEERING",
  "UX_ANALYSIS",
  "DATA_ARCHITECTURE",
  "AI_ARCHITECTURE",
  "SOLUTION_ARCHITECTURE",
  "SECURITY_REVIEW",
  "QA_ANALYSIS",
  "ESTIMATION",
  "VALIDATION",
  "REWORK",
  "COMPILATION",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const workflowStepsTable = pgTable("workflow_steps", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  status: text("status").notNull().default("QUEUED"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertWorkflowStepSchema = createInsertSchema(
  workflowStepsTable
).omit({ createdAt: true, updatedAt: true });
export type InsertWorkflowStep = z.infer<typeof insertWorkflowStepSchema>;
export type WorkflowStep = typeof workflowStepsTable.$inferSelect;
