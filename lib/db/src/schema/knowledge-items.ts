import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const KNOWLEDGE_ITEM_STATUSES = [
  "DRAFT",
  "ASSUMED",
  "NEEDS_CLARIFICATION",
  "CONFIRMED",
  "VALIDATED",
  "REJECTED",
  "SUPERSEDED",
] as const;

export type KnowledgeItemStatus = (typeof KNOWLEDGE_ITEM_STATUSES)[number];

export const knowledgeItemsTable = pgTable("knowledge_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("DRAFT"),
  source: text("source"),
  createdBy: text("created_by"),
  metadata: text("metadata"),
  version: integer("version").notNull().default(1),
  relatedIds: text("related_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertKnowledgeItemSchema = createInsertSchema(
  knowledgeItemsTable
).omit({ createdAt: true, updatedAt: true });
export type InsertKnowledgeItem = z.infer<typeof insertKnowledgeItemSchema>;
export type KnowledgeItem = typeof knowledgeItemsTable.$inferSelect;
