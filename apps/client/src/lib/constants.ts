export const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  CREATED: "secondary",
  DISCOVERING: "warning",
  ANALYSING: "warning",
  RESEARCHING: "warning",
  GENERATING_REQUIREMENTS: "warning",
  DESIGNING: "warning",
  ARCHITECTING: "warning",
  SECURITY_REVIEW: "warning",
  QA_ANALYSIS: "warning",
  ESTIMATING: "warning",
  VALIDATING: "warning",
  REWORKING: "destructive",
  WAITING_FOR_USER: "destructive",
  COMPILING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",

  // Knowledge Item Status
  DRAFT: "secondary",
  ASSUMED: "warning",
  NEEDS_CLARIFICATION: "destructive",
  CONFIRMED: "success",
  VALIDATED: "success",
  REJECTED: "destructive",
  SUPERSEDED: "outline",

  // Questions
  PENDING: "destructive",
  ANSWERED: "success",
  SKIPPED: "outline",

  // Validation
  OPEN: "destructive",
  RESOLVED: "success",
  WONT_FIX: "outline",
  ESCALATED: "warning",

  // Severities
  CRITICAL: "destructive",
  HIGH: "destructive", // Maybe a different color if we had one
  MEDIUM: "warning",
  LOW: "secondary",
};
