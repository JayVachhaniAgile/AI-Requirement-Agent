import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const AGENT_EXECUTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "RETRYING",
] as const;

export type AgentExecutionStatus = (typeof AGENT_EXECUTION_STATUSES)[number];

export const agentExecutionsTable = pgTable("agent_executions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  agentKey: text("agent_key").notNull(),
  status: text("status").notNull().default("QUEUED"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  retryCount: integer("retry_count").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAgentExecutionSchema = createInsertSchema(
  agentExecutionsTable
).omit({ createdAt: true });
export type InsertAgentExecution = z.infer<typeof insertAgentExecutionSchema>;
export type AgentExecution = typeof agentExecutionsTable.$inferSelect;
