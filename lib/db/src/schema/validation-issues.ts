import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const VALIDATION_SEVERITIES = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;
export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];

export const VALIDATION_ISSUE_STATUSES = [
  "OPEN",
  "RESOLVED",
  "WONT_FIX",
  "ESCALATED",
] as const;
export type ValidationIssueStatus =
  (typeof VALIDATION_ISSUE_STATUSES)[number];

export const validationIssuesTable = pgTable("validation_issues", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  sourceAgent: text("source_agent"),
  affectedIds: text("affected_ids").array().notNull().default([]),
  problem: text("problem").notNull(),
  evidence: text("evidence"),
  impact: text("impact"),
  recommendedCorrection: text("recommended_correction"),
  responsibleAgent: text("responsible_agent"),
  requiresHumanDecision: boolean("requires_human_decision")
    .notNull()
    .default(false),
  status: text("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertValidationIssueSchema = createInsertSchema(
  validationIssuesTable
).omit({ createdAt: true });
export type InsertValidationIssue = z.infer<typeof insertValidationIssueSchema>;
export type ValidationIssue = typeof validationIssuesTable.$inferSelect;
