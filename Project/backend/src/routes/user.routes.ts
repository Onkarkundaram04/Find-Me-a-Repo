// ============================================================
// Layer:      Routes
// File:       user.routes.ts
// Purpose:    URL map for the logged-in user's own account actions.
// Mounted at: /api/users (in app.ts)
// Exports:    userRouter
// Auth:       Every route requires a valid access token.
// ============================================================

import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
    updateProfile,
    updatePassword,
    deactivateAccount,
    deleteAccount
} from "../controllers/user.controller";

const userRouter = Router();

// ── PROTECTED ────────────────────────────────────────────────
// Self-service only. None of these take a user id in the URL —
// the target is always req.user, so you can only change your
// own account.
// ─────────────────────────────────────────────────────────────

// Route:   PATCH /api/users/update-profile
// Guards:  authMiddleware
// Handler: updateProfile
// Example: Frontend sends PATCH /api/users/update-profile
//          with this JSON in the request body: { "name": "Alex Carter" }
//          Backend responds with the updated user
userRouter.patch("/update-profile", authMiddleware, updateProfile);

// Route:   PATCH /api/users/update-password
// Guards:  authMiddleware
// Handler: updatePassword
// Example: Frontend sends PATCH /api/users/update-password
//          with this JSON in the request body: { "currentPassword": "Secret@123", "newPassword": "Better@456" }
//          Backend saves the new password and ends the old session
userRouter.patch("/update-password", authMiddleware, updatePassword);

// Route:   PATCH /api/users/deactivate-account
// Guards:  authMiddleware
// Handler: deactivateAccount
// Example: Frontend sends PATCH /api/users/deactivate-account with no body
//          Backend marks the account DEACTIVATED and ends the session
userRouter.patch("/deactivate-account", authMiddleware, deactivateAccount);

// Route:   DELETE /api/users/delete-account
// Guards:  authMiddleware
// Handler: deleteAccount
// Example: Frontend sends DELETE /api/users/delete-account with no body
//          Backend deletes the account with its projects and applications, then responds with a success message
userRouter.delete("/delete-account", authMiddleware, deleteAccount);

export { userRouter };
