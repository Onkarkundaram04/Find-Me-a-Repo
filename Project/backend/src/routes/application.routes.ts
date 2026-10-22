// ============================================================
// Layer:      Routes
// File:       application.routes.ts
// Purpose:    URL map for applying, listing, deciding and withdrawing.
// Mounted at: /api/applications (in app.ts)
// Exports:    applicationRouter
// Auth:       Every route requires a valid access token.
// ============================================================

import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
    createApplication,
    getMyApplications,
    updateApplicationStatus,
    deleteApplication
} from "../controllers/application.controller";
import { applyRateLimiter } from "../middlewares/rateLimiter.middleware";

const applicationRouter = Router();

// ── PROTECTED ────────────────────────────────────────────────
// Your own applications. authMiddleware guarantees req.user, so
// the controller always filters by the caller's own id.
// ─────────────────────────────────────────────────────────────

// Route:   POST /api/applications/apply
// Guards:  authMiddleware -> applyRateLimiter
// Handler: createApplication
// Example: Frontend sends POST /api/applications/apply
//          with this JSON in the request body: { "projectId": "3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10", "note": "I built two APIs like this one", "githubProfile": "https://github.com/alex" }
//          Backend responds with the created application, status PENDING
applicationRouter.post("/apply", authMiddleware, applyRateLimiter, createApplication);

// Route:   GET /api/applications/my-applications
// Guards:  authMiddleware
// Handler: getMyApplications
// Example: Frontend sends GET /api/applications/my-applications?status=PENDING&page=1&limit=10
//          Backend responds with the applications this caller sent, plus the totals for paging
applicationRouter.get("/my-applications", authMiddleware, getMyApplications);

// ── PROTECTED — ownership checked in the controller ──────────
// The guard here is only "logged in". Whether the caller may
// decide or delete this application is decided once the row is
// loaded, so the middleware chain stays flat.
// ─────────────────────────────────────────────────────────────

// Route:   PATCH /api/applications/update-status/:id
// Guards:  authMiddleware (owner or admin checked in the controller)
// Handler: updateApplicationStatus
// Example: Frontend sends PATCH /api/applications/update-status/9c2a77e1-1b3d-4f60-8a55-77d1e3b9c042
//          with this JSON in the request body: { "status": "ACCEPTED" }
//          Backend responds with that application, status now ACCEPTED
applicationRouter.patch("/update-status/:id", authMiddleware, updateApplicationStatus);

// Route:   DELETE /api/applications/delete-application/:id
// Guards:  authMiddleware (applicant or admin checked in the controller)
// Handler: deleteApplication
// Example: Frontend sends DELETE /api/applications/delete-application/9c2a77e1-1b3d-4f60-8a55-77d1e3b9c042
//          Backend deletes that application and responds with a success message
applicationRouter.delete("/delete-application/:id", authMiddleware, deleteApplication);

export {
    applicationRouter
};
