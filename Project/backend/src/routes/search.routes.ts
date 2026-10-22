// ============================================================
// Layer:      Routes
// File:       search.routes.ts
// Purpose:    One endpoint that filters projects on any combination.
// Mounted at: /api/search (in app.ts)
// Exports:    searchRouter
// Auth:       Public.
// ============================================================

import { Router } from "express";
import { omniSearchProjects } from "../controllers/search.controller";

const searchRouter = Router();

// ── PUBLIC ───────────────────────────────────────────────────
// Searching the board is part of browsing, so it stays open.
// Every filter is optional — with no query it behaves like the
// public project list.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/search
// Guards:  none
// Handler: omniSearchProjects
// Example: Frontend sends GET /api/search?title=api&techStack=react&techStack=node&status=OPEN&page=1&limit=10
//          Backend responds with every project matching ANY of those tags, plus the totals for paging
searchRouter.get("/", omniSearchProjects);

export { searchRouter };
