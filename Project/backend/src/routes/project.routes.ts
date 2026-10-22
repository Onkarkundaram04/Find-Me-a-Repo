// ============================================================
// Layer:      Routes
// File:       project.routes.ts
// Purpose:    URL map for creating, browsing and managing projects.
// Mounted at: /api/projects (in app.ts)
// Exports:    projectRouter
// Auth:       Browsing is public; creating and managing need a token.
// ============================================================

import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { verifyOwner } from "../middlewares/projectOwner.middleware";
import {
    createProject,
    getAllProjects,
    getProjectById,
    getProjectApplications,
    getMyProjects,
    updateProject,
    deleteProject
} from "../controllers/project.controller";

const projectRouter = Router();

// ── PUBLIC ───────────────────────────────────────────────────
// A visitor must be able to see what is on the board before
// signing up. Paths are spelled out (no bare /:id) so no route
// can ever swallow another one.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/projects/all-projects
// Guards:  none
// Handler: getAllProjects
// Example: Frontend sends GET /api/projects/all-projects?status=OPEN&page=1&limit=10
//          Backend responds with the first 10 open projects, plus the totals for paging
projectRouter.get("/all-projects", getAllProjects);

// Route:   GET /api/projects/project-details/:id
// Guards:  none
// Handler: getProjectById
// Example: Frontend sends GET /api/projects/project-details/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          Backend responds with that project and how many people applied to it
projectRouter.get("/project-details/:id", getProjectById);

// ── PROTECTED ────────────────────────────────────────────────
// Any logged-in user. The owner is taken from req.user, never
// from the body, so nobody can create a project for someone else.
// ─────────────────────────────────────────────────────────────

// Route:   POST /api/projects/create-project
// Guards:  authMiddleware
// Handler: createProject
// Example: Frontend sends POST /api/projects/create-project
//          with this JSON in the request body: { "title": "Portfolio API", "description": "Backend for my portfolio", "githubUrl": "https://github.com/alex/portfolio-api", "techStack": ["node", "postgres"] }
//          Backend responds with the created project
projectRouter.post("/create-project", authMiddleware, createProject);

// Route:   GET /api/projects/my-projects
// Guards:  authMiddleware
// Handler: getMyProjects
// Example: Frontend sends GET /api/projects/my-projects?page=1&limit=10 with the access token
//          Backend responds with the projects this caller created, plus the totals for paging
projectRouter.get("/my-projects", authMiddleware, getMyProjects);

// ── OWNER (or admin) ─────────────────────────────────────────
// verifyOwner loads the project from :id and confirms the caller
// is the owner — admins pass. It also attaches req.project, so
// the controller never queries it twice.
// ─────────────────────────────────────────────────────────────

// Route:   GET /api/projects/project-applications/:id
// Guards:  authMiddleware -> verifyOwner
// Handler: getProjectApplications
// Example: Frontend sends GET /api/projects/project-applications/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          Backend responds with every application sent to that project, and how many there are
projectRouter.get("/project-applications/:id", authMiddleware, verifyOwner, getProjectApplications);

// Route:   PATCH /api/projects/update-project/:id
// Guards:  authMiddleware -> verifyOwner
// Handler: updateProject
// Example: Frontend sends PATCH /api/projects/update-project/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          with this JSON in the request body: { "status": "CLOSED" }
//          Backend responds with the updated project
projectRouter.patch("/update-project/:id", authMiddleware, verifyOwner, updateProject);

// Route:   DELETE /api/projects/delete-project/:id
// Guards:  authMiddleware -> verifyOwner
// Handler: deleteProject
// Example: Frontend sends DELETE /api/projects/delete-project/3f7c1b90-2a4e-4d61-9c8a-5b1e2d7f9a10
//          Backend deletes the project and its applications, then responds with a success message
projectRouter.delete("/delete-project/:id", authMiddleware, verifyOwner, deleteProject);

export { projectRouter };
