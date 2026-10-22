// ============================================================
// Layer:      Middleware
// File:       admin.middleware.ts
// Purpose:    Guard admin routes by the action the caller's role holds.
// Exports:    verifyManageUsers, verifyManageProjects, verifyManageSystem
// Used by:    admin.routes.ts
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import { ErrorMessage } from "../utils/messages.headlines";
import { Actions, canPerformAction } from "../config/permissions";


// ============================================================
// Helper:   checkPermission
// Purpose:  Shared guard logic behind every admin middleware.
// Reads:    req.user.role, the required action
// Rejects:  401 no user / 403 the role lacks that action
// ============================================================

function checkPermission(req: Request, res: Response, next: NextFunction, action: Actions) {

    // Step 1: Read the caller's role (attached by authMiddleware)

    const userRole = req.user?.role;

    // Step 2: Nobody logged in -> 401

    if (!userRole) {

        return sendError({
            res: res,
            resCode: 401,
            resMessage: ErrorMessage.AUTHENTICATION_ERROR,
            resError: "User not authenticated"
        });
    }

    // Step 3: The role does not hold this action -> 403

    if (!canPerformAction(userRole, action)) {

        return sendError({
            res: res,
            resCode: 403,
            resMessage: ErrorMessage.FORBIDDEN_ERROR,
            resError: `Admin access required: ${action} permission missing`
        });
    }

    // Step 4: Allowed -> hand over to the controller

    return next();
}


// ============================================================
// Middleware: verifyManageUsers
// Goal:       Requires the MANAGE_USERS action.
// Rejects:    401 no user / 403 action missing
// Flow:
//   1. authMiddleware  -> Verifies JWT, attaches req.user.
//   2. checkPermission -> Requires MANAGE_USERS.
// ============================================================

function verifyManageUsers(req: Request, res: Response, next: NextFunction) {

    return checkPermission(req, res, next, Actions.MANAGE_USERS);
}


// ============================================================
// Middleware: verifyManageProjects
// Goal:       Requires the MANAGE_PROJECTS action.
// Rejects:    401 no user / 403 action missing
// Flow:
//   1. authMiddleware  -> Verifies JWT, attaches req.user.
//   2. checkPermission -> Requires MANAGE_PROJECTS.
// ============================================================

function verifyManageProjects(req: Request, res: Response, next: NextFunction) {

    return checkPermission(req, res, next, Actions.MANAGE_PROJECTS);
}


// ============================================================
// Middleware: verifyManageSystem
// Goal:       Requires the MANAGE_SYSTEM action.
// Rejects:    401 no user / 403 action missing
// Flow:
//   1. authMiddleware  -> Verifies JWT, attaches req.user.
//   2. checkPermission -> Requires MANAGE_SYSTEM.
// ============================================================

function verifyManageSystem(req: Request, res: Response, next: NextFunction) {

    return checkPermission(req, res, next, Actions.MANAGE_SYSTEM);
}


export {
    verifyManageUsers,
    verifyManageProjects,
    verifyManageSystem,
};
