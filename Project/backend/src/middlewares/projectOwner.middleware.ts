// ============================================================
// Layer:      Middleware
// File:       projectOwner.middleware.ts
// Purpose:    Confirm the caller owns the project in the URL.
// Exports:    verifyOwner
// Used by:    project.routes.ts
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import { ErrorMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { Actions, canPerformAction } from "../config/permissions";
import { UUID_REGEX } from "../config/regex";


// ============================================================
// Middleware: verifyOwner
// Goal:       Only the project owner (or an admin) may continue.
// Reads:      req.user (from authMiddleware), req.params.id
// Attaches:   req.project
// Rejects:    400 malformed id / 401 no user / 403 not the owner
//             404 project not found
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. verifyOwner    -> Loads the project, checks ownership, attaches req.project.
// ============================================================

async function verifyOwner(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: req.user must be present (attached by authMiddleware)

        const userId = req.user?.id;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Read the project id from the URL

        const projectId = req.params.id;

        if (!projectId || typeof projectId !== "string") {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid Project ID"
            });
        }

        const cleanProjectId = projectId.trim();

        // Step 3: The id must be a real UUID before it reaches PostgreSQL.

        if (!UUID_REGEX.test(cleanProjectId)) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project ID must be a valid UUID"
            });
        }

        // Step 4: Load the project

        const projectData = await prisma.project.findUnique({

            where: {
                id: cleanProjectId
            }
        });

        // Step 5: No match -> 404

        if (!projectData) {

            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "Project not found"
            });
        }

        // Step 6: Admins always pass

        if (canPerformAction(req.user?.role, Actions.MANAGE_PROJECTS)) {

            req.project = projectData;

            return next();
        }

        // Step 7: Otherwise the caller must be the owner

        if (projectData.ownerId !== userId) {

            return sendError({
                res,
                resCode: 403,
                resMessage: ErrorMessage.FORBIDDEN_ERROR,
                resError: "You are not allowed to manage this project"
            });
        }

        // Step 8: Attach req.project and continue

        req.project = projectData;

        return next();
    }
    catch (error) {

        // Unexpected failure -> global error middleware

        return next(error);
    }
}

export { verifyOwner };
