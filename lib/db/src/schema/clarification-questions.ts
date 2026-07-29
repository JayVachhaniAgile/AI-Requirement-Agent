import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const QUESTION_STATUSES = ["PENDING", "ANSWERED", "SKIPPED"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const clarificationQuestionsTable = pgTable(
  "clarification_questions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    context: text("context"),
    isBlocking: boolean("is_blocking").notNull().default(false),
    status: text("status").notNull().default("PENDING"),
    answer: text("answer"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

export const insertClarificationQuestionSchema = createInsertSchema(
  clarificationQuestionsTable
).omit({ createdAt: true });
export type InsertClarificationQuestion = z.infer<
  typeof insertClarificationQuestionSchema
>;
export type ClarificationQuestion =
  typeof clarificationQuestionsTable.$inferSelect;
