// ============================================================
// Layer:      Routes
// File:       auth.routes.ts
// Purpose:    URL map for registration, login and session end.
// Mounted at: /api/auth (in app.ts)
// Exports:    authRouter
// Auth:       Public + protected mix.
// ============================================================

import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { authRateLimiter } from "../middlewares/rateLimiter.middleware";
import { registerUser, loginUser, refreshAccessToken, getMe, logOut } from "../controllers/auth.controller";

const authRouter = Router();

// ── PUBLIC ───────────────────────────────────────────────────
// A stranger must be able to create an account and log in, so
// these stay open. authRateLimiter caps brute-force attempts.
// ─────────────────────────────────────────────────────────────

// Route:   POST /api/auth/register
// Guards:  authRateLimiter
// Handler: registerUser
// Example: Frontend sends POST /api/auth/register
//          with this JSON in the request body: { "name": "Alex", "email": "alex@mail.com", "password": "Secret@123" }
//          Backend responds with the new user and an accessToken
authRouter.post("/register", authRateLimiter, registerUser);

// Route:   POST /api/auth/login
// Guards:  authRateLimiter
// Handler: loginUser
// Example: Frontend sends POST /api/auth/login
//          with this JSON in the request body: { "email": "alex@mail.com", "password": "Secret@123" }
//          Backend responds with the user and a fresh accessToken
authRouter.post("/login", authRateLimiter, loginUser);

// Route:   POST /api/auth/refresh
// Guards:  none — the httpOnly cookie is the credential
// Handler: refreshAccessToken
// Example: Frontend sends POST /api/auth/refresh (the browser attaches the refresh cookie by itself)
//          Backend responds with the user and a new accessToken
authRouter.post("/refresh", refreshAccessToken);

// ── PROTECTED ────────────────────────────────────────────────
// Only a caller holding a valid, unrevoked access token gets in.
// authMiddleware verifies it and attaches req.user.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/auth/me
// Guards:  authMiddleware
// Handler: getMe
// Example: Frontend sends GET /api/auth/me with the access token in the Authorization header
//          Backend responds with the logged-in user's profile
authRouter.get("/me", authMiddleware, getMe);

// Route:   POST /api/auth/logout
// Guards:  authMiddleware
// Handler: logOut
// Example: Frontend sends POST /api/auth/logout with the access token in the Authorization header
//          Backend ends the session (token blacklisted) and responds with a success message
authRouter.post("/logout", authMiddleware, logOut);

export { authRouter };
