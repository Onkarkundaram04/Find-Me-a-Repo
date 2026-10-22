// ============================================================
// Layer:      Config
// File:       permissions.ts
// Purpose:    Actions a role may perform, and the check for them.
// Exports:    Actions, RolePermissions, canPerformAction
// Used by:    admin.middleware.ts, projectOwner.middleware.ts,
//             application.controller.ts
// ============================================================

import { Role } from "../../generated/prisma/enums";

// Note: Some granular actions are defined ahead of the roles that will use them
// (e.g. a future MODERATOR). ADMIN holds all of them today.

// Note: 1. Centralized list of actions
enum Actions {
    // === 1. PROJECT DOMAIN ===
    MANAGE_PROJECTS = "MANAGE_PROJECTS", // Master key
    UPDATE_PROJECT = "UPDATE_PROJECT",
    DELETE_PROJECT = "DELETE_PROJECT",
    VIEW_PROJECT_APPLICATIONS = "VIEW_PROJECT_APPLICATIONS",

    // === 2. APPLICATION DOMAIN ===
    MANAGE_APPLICATIONS = "MANAGE_APPLICATIONS", // Master key
    UPDATE_APPLICATION_STATUS = "UPDATE_APPLICATION_STATUS",
    DELETE_APPLICATION = "DELETE_APPLICATION",

    // === 3. USER & MODERATION DOMAIN ===
    MANAGE_USERS = "MANAGE_USERS", // Master key
    VIEW_USERS = "VIEW_USERS",
    UPDATE_USER_STATUS = "UPDATE_USER_STATUS",
    DELETE_USER = "DELETE_USER",

    // === 4. SYSTEM & PLATFORM DOMAIN ===
    MANAGE_SYSTEM = "MANAGE_SYSTEM",

    // === 5. MANAGE SESSIONS ===
    MANAGE_SESSIONS = "MANAGE_SESSIONS"
}


// Note: 2. Assign actions to roles (plain and readable)
const RolePermissions: Record<Role, Actions[]> = {
    [Role.ADMIN]: [
        Actions.MANAGE_PROJECTS,
        Actions.UPDATE_PROJECT,
        Actions.DELETE_PROJECT,
        Actions.VIEW_PROJECT_APPLICATIONS,
        Actions.MANAGE_APPLICATIONS,
        Actions.UPDATE_APPLICATION_STATUS,
        Actions.DELETE_APPLICATION,
        Actions.MANAGE_USERS,
        Actions.VIEW_USERS,
        Actions.UPDATE_USER_STATUS,
        Actions.DELETE_USER,
        Actions.MANAGE_SYSTEM,
        Actions.MANAGE_SESSIONS
    ],
    [Role.USER]: []
};


// ============================================================
// Function: canPerformAction
// Input:    role (may be undefined), one action or a list of actions
// Returns:  true only when the role holds every action asked for
// ============================================================

// Note: 3. Simple helper function with standard if-checks

function canPerformAction(role: Role | undefined, action: Actions | Actions[]) {

    // Step 1: If user is not authenticated

    if (!role) {
        return false;
    }

    // Step 2: Get the list of allowed actions for the user
    const allowedActions = RolePermissions[role];

    // Step 3: If the role doesn't have any permissions
    if (!allowedActions) {
        return false;
    }

    // Step 4: If only a single action was passed

    if (typeof action === "string") {

        if (allowedActions.includes(action)) {
            return true;
        }

        return false;
    }

    // Step 5: If no actions were passed (empty array)

    if (action.length === 0) {
        return false;
    }

    // Step 6: Check every single action (AND logic)
    for (const item of action) {

        if (!allowedActions.includes(item)) {
            return false; // Missing even one -> immediately reject
        }
    }

    // Step 7: Every requested action is present

    return true; // Has every single action -> allow
}


export { Actions, RolePermissions, canPerformAction };
