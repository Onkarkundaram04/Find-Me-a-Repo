// ============================================================
// Layer:      Routes
// File:       meta.routes.ts
// Purpose:    One public endpoint that lists the enums and tech tags the
//             frontend is allowed to build filters from.
// Mounted at: /api/meta (in app.ts)
// Exports:    metaRouter
// Auth:       Public.
// ============================================================

import { Router } from "express";
import { getMeta } from "../controllers/meta.controller";

const metaRouter = Router();

// ── PUBLIC ───────────────────────────────────────────────────
// Filter vocabularies are part of browsing, so they stay open.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/meta
// Guards:  none
// Handler: getMeta
// Example: Frontend sends GET /api/meta
//          Backend responds with the role, status and application-status enums,
//          plus every technology tag with the number of projects using it
metaRouter.get("/", getMeta);

export { metaRouter };
