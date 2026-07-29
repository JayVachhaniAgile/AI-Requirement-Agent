import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PROJECT_STATUSES = [
  "CREATED",
  "DISCOVERING",
  "ANALYSING",
  "RESEARCHING",
  "GENERATING_REQUIREMENTS",
  "DESIGNING",
  "ARCHITECTING",
  "SECURITY_REVIEW",
  "QA_ANALYSIS",
  "ESTIMATING",
  "VALIDATING",
  "REWORKING",
  "WAITING_FOR_USER",
  "COMPILING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TERMINAL_STATUSES: ProjectStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  idea: text("idea").notNull(),
  status: text("status").notNull().default("CREATED"),
  currentStage: text("current_stage"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
