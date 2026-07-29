# BACKLOG.md — Prioritized Product & Engineering Backlog

## Purpose

This is the living backlog for the Req Platform. Items here are prioritized for implementation.

## Rules

- **Status keys:** `done` · `stub/partial` · `not started` · `blocked` · `cancelled` · `deferred`
- When an item ships, update this file AND `ROADMAP.md` in the same PR
- Do not duplicate prioritization in `ROADMAP.md` — that file only shows current status

## Tier 1 — High Priority

| ID | Item | Priority | Status | Notes | Touchpoints |
|---|---|---|---|---|---|
| A1 | Authentication system | P0 | `not started` | JWT or OAuth; needed for multi-user | Backend auth module, frontend auth context |
| A2 | Database migrations | P0 | `not started` | Replace `synchronize: true` in production | Backend database module |
| A3 | CI/CD pipeline | P0 | `not started` | GitHub Actions or Replit Deploy | Root config |
| A4 | Docker setup | P1 | `not started` | Dockerfile for backend + frontend | Root |
| A5 | PDF export | P1 | `stub/partial` | Button exists, no implementation | Frontend document tab |

## Tier 2 — Medium Priority

| ID | Item | Priority | Status | Notes | Touchpoints |
|---|---|---|---|---|---|
| B1 | Document versioning | P2 | `not started` | Track doc versions per project | Backend documents table, frontend versions tab |
| B2 | Project archiving | P2 | `not started` | Soft-delete or archive old projects | Backend projects controller |
| B3 | Agent retry with backoff | P2 | `not started` | Rate limit handling for LLM calls | Backend LLM service |
| B4 | Export to Notion/Confluence | P2 | `not started` | Integration with doc platforms | Backend + frontend |
| B5 | Slack notifications | P2 | `not started` | Pipeline status alerts | Backend events |

## Tier 3 — Low Priority / Nice to Have

| ID | Item | Priority | Status | Notes | Touchpoints |
|---|---|---|---|---|---|
| O1 | Custom agent configuration | P3 | `not started` | Allow users to enable/disable agents | Backend workflow, frontend settings |
| O2 | Project templates | P3 | `not started` | Pre-built idea templates | Frontend new project page |
| O3 | Keyboard shortcuts | P3 | `not started` | Navigation hotkeys | Frontend AppLayout |
| O4 | Mobile responsive polish | P3 | `partial` | Some layouts need mobile fixes | Frontend components |

## Backlog Hygiene

- Review quarterly
- Remove items that are clearly never going to happen
- Promote items based on user feedback
- Update `ROADMAP.md` status when items ship

## Changelog

| Date | Item | Change |
|---|---|---|
| 2025-07-28 | A1-A5, B1-B5, O1-O4 | Initial backlog created |
