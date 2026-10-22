// ============================================================
// Layer:      Routes
// File:       admin.routes.ts
// Purpose:    Platform moderation: users, roles, projects and stats.
// Mounted at: /api/admin (in app.ts)
// Exports:    adminRouter
// Auth:       Every route needs an ADMIN action (config/permissions.ts).
// ============================================================

import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
    verifyManageUsers,
    verifyManageProjects,
    verifyManageSystem
} from "../middlewares/admin.middleware";
import {
    getAllUsers,
    updateUserStatus,
    updateUserRole,
    getUserDetailsAdmin,
    deleteUserAdmin,
    deleteProjectAdmin,
    getPlatformStats
} from "../controllers/admin.controller";

const adminRouter = Router();

// ── ADMIN — MANAGE_USERS ─────────────────────────────────────
// verifyManageUsers asks config/permissions.ts whether this role
// holds the action, instead of hardcoding role === "ADMIN".
// That is what lets a future MODERATOR slot in without edits.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/admin/all-users
// Guards:  authMiddleware -> verifyManageUsers
// Handler: getAllUsers
// Example: Frontend sends GET /api/admin/all-users?role=USER&status=ACTIVE&page=1&limit=10
//          Backend responds with the first 10 matching users, plus the totals for paging
adminRouter.get("/all-users", authMiddleware, verifyManageUsers, getAllUsers);

// Route:   GET /api/admin/user-details/:id
// Guards:  authMiddleware -> verifyManageUsers
// Handler: getUserDetailsAdmin
// Example: Frontend sends GET /api/admin/user-details/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10?page=1&limit=10
//          Backend responds with that user, one page of their projects and one page of their applications
adminRouter.get("/user-details/:id", authMiddleware, verifyManageUsers, getUserDetailsAdmin);

// Route:   PATCH /api/admin/update-user-status/:id
// Guards:  authMiddleware -> verifyManageUsers
// Handler: updateUserStatus
// Example: Frontend sends PATCH /api/admin/update-user-status/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          with this JSON in the request body: { "status": "SUSPENDED" }
//          Backend responds with that user, status now SUSPENDED
adminRouter.patch("/update-user-status/:id", authMiddleware, verifyManageUsers, updateUserStatus);

// Route:   PATCH /api/admin/update-user-role/:id
// Guards:  authMiddleware -> verifyManageUsers
// Handler: updateUserRole
// Example: Frontend sends PATCH /api/admin/update-user-role/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          with this JSON in the request body: { "role": "ADMIN" }
//          Backend responds with that user, role now ADMIN
adminRouter.patch("/update-user-role/:id", authMiddleware, verifyManageUsers, updateUserRole);

// Route:   DELETE /api/admin/delete-user/:id
// Guards:  authMiddleware -> verifyManageUsers
// Handler: deleteUserAdmin
// Example: Frontend sends DELETE /api/admin/delete-user/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          Backend deletes that account; their projects and applications cascade
//          with it, then responds with a success message
adminRouter.delete("/delete-user/:id", authMiddleware, verifyManageUsers, deleteUserAdmin);

// ── ADMIN — MANAGE_PROJECTS ──────────────────────────────────// Force-removal without being the owner. This is the only path
// that can delete a project the admin does not own.
// ─────────────────────────────────────────────────────────────

// Route:   DELETE /api/admin/delete-project/:id
// Guards:  authMiddleware -> verifyManageProjects
// Handler: deleteProjectAdmin
// Example: Frontend sends DELETE /api/admin/delete-project/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          Backend deletes the project and its applications, then responds with a success message
adminRouter.delete("/delete-project/:id", authMiddleware, verifyManageProjects, deleteProjectAdmin);

// ── ADMIN — MANAGE_SYSTEM ────────────────────────────────────
// Read-only platform counters for the admin dashboard.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/admin/platform-stats
// Guards:  authMiddleware -> verifyManageSystem
// Handler: getPlatformStats
// Example: Frontend sends GET /api/admin/platform-stats
//          Backend responds with how many users, projects and applications exist
adminRouter.get("/platform-stats", authMiddleware, verifyManageSystem, getPlatformStats);

export { adminRouter };
