// ============================================================
// Layer:      Controller
// File:       admin.controller.ts
// Purpose:    Platform moderation: users, roles, projects and stats.
// Exports:    getAllUsers, updateUserStatus, updateUserRole,
//             getUserDetailsAdmin, deleteProjectAdmin, getPlatformStats
// Used by:    admin.routes.ts
// Auth:       Every route needs an ADMIN action (see config/permissions.ts).
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError, sendSuccess } from "../utils/response";
import { ErrorMessage, SuccessMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { Role, UserStatus, ProjectStatus, ApplicationStatus } from "../../generated/prisma/enums";
import { buildPagination } from "../utils/pagination";
import { Prisma } from "../../generated/prisma/client";
import { UUID_REGEX } from "../config/regex";
import { clearProjectsCache } from "../utils/cache";


// ============================================================
// Function:   getAllUsers
// Route:      GET /api/admin/all-users
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageUsers
// Query:      ?role=USER|ADMIN (optional, single or list)
//             ?status=ACTIVE|SUSPENDED|DEACTIVATED (optional, single or list)
//             ?page=number, ?limit=number
// Returns:    200 { users, count, total, totalPages, page, limit }
// Errors:     400 invalid role / status / pagination
//             401 no token / 403 missing MANAGE_USERS
// Flow:
//   1. authMiddleware    -> Verifies JWT, attaches req.user.
//   2. verifyManageUsers -> Requires the MANAGE_USERS action.
//   3. Controller        -> Validates the filters, paginates, hides passwords.
// ============================================================

async function getAllUsers(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Read the optional status filter (single value or list)

        let finalStatus: UserStatus[] = [];

        const rawStatus = req.query.status;

        if (rawStatus !== undefined) {

            let statusList: unknown[] = [];

            if (typeof rawStatus === "string") {

                statusList = [rawStatus];
            }
            else if (Array.isArray(rawStatus)) {

                statusList = rawStatus;
            }
            else {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Status must be text"
                });
            }

            // Step 2: Clean every status value (trim + uppercase)

            const cleanStatus: string[] = [];

            for (const item of statusList) {

                if (typeof item !== "string") {

                    return sendError({
                        res: res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: "Every status must be text"
                    });
                }

                cleanStatus.push(item.trim().toUpperCase());
            }

            // Step 3: Remove duplicate statuses

            for (const item of cleanStatus) {

                if (!finalStatus.includes(item as UserStatus)) {

                    finalStatus.push(item as UserStatus);
                }
            }

            // Step 4: Validate every status against the UserStatus enum

            const allowedStatus: string[] = Object.values(UserStatus);

            for (const item of finalStatus) {

                if (!allowedStatus.includes(item)) {

                    return sendError({
                        res: res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: `Invalid status: ${item}. Allowed: ${allowedStatus.join(", ")}`
                    });
                }
            }
        }

        // Step 5: Read the optional role filter (single value or list)

        let finalRole: Role[] = [];

        const rawRole = req.query.role;

        if (rawRole !== undefined) {

            let roleList: unknown[] = [];

            if (typeof rawRole === "string") {

                roleList = [rawRole];
            }
            else if (Array.isArray(rawRole)) {

                roleList = rawRole;
            }
            else {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Role must be text"
                });
            }

            // Step 6: Clean every role value (trim + uppercase)

            const cleanRole: string[] = [];

            for (const item of roleList) {

                if (typeof item !== "string") {

                    return sendError({
                        res: res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: "Every role must be text"
                    });
                }

                cleanRole.push(item.trim().toUpperCase());
            }

            // Step 7: Remove duplicate roles

            for (const item of cleanRole) {

                if (!finalRole.includes(item as Role)) {

                    finalRole.push(item as Role);
                }
            }

            // Step 8: Validate every role against the Role enum

            const allowedRole: string[] = Object.values(Role);

            for (const item of finalRole) {

                if (!allowedRole.includes(item)) {

                    return sendError({
                        res: res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: `Invalid role: ${item}. Allowed: ${allowedRole.join(", ")}`
                    });
                }
            }
        }

        // Step 9: Read page and limit from URL

        const pagination = buildPagination(req.query.page, req.query.limit);

        if (pagination.error !== null) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: pagination.error
            });
        }

        // Step 10: Build the where clause from the active filters

        const where: Prisma.UserWhereInput = {};

        if (finalStatus.length > 0) {

            where.status = {
                in: finalStatus
            };
        }

        if (finalRole.length > 0) {

            where.role = {
                in: finalRole
            };
        }

        // Step 11: Count total matching users

        const totalUsers = await prisma.user.count({
            where: where
        });

        // Step 12: Fetch this page, newest first

        const usersData = await prisma.user.findMany({
            where: where,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        projects: true,
                        applications: true
                    }
                }
            },
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" }
            ],
            take: pagination.limit,
            skip: pagination.skip
        });

        // Step 13: Return the page

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.USERS_FETCHED,
            resData: {
                users: usersData,
                count: usersData.length,
                total: totalUsers,
                totalPages: Math.max(1, Math.ceil(totalUsers / pagination.limit)),
                page: pagination.page,
                limit: pagination.limit
            }
        });

    }
    catch (error) {

        return next(error);
    }
}


// ============================================================
// Function:   updateUserStatus
// Route:      PATCH /api/admin/update-user-status/:id
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageUsers
// Body:       { status: "ACTIVE" | "SUSPENDED" }
// Returns:    200 { user }
// Errors:     400 malformed id / invalid status / targeting yourself
//             401 no token / 403 missing MANAGE_USERS / 404 user not found
// Flow:
//   1. authMiddleware    -> Verifies JWT, attaches req.user.
//   2. verifyManageUsers -> Requires the MANAGE_USERS action.
//   3. Controller        -> Blocks self-target, then updates the status.
// ============================================================

async function updateUserStatus(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Admin user ID from request

        const currentAdminId = req.user?.id;

        if (!currentAdminId) {

            return sendError({
                res: res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Validate target user ID from URL parameters

        const rawUserId = req.params.id;

        if (!rawUserId || typeof rawUserId !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID is required in URL parameters"
            });
        }

        const targetUserId = rawUserId.trim();

        if (!UUID_REGEX.test(targetUserId)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID must be a valid UUID"
            });
        }

        // Step 3: Prevent self-suspension

        if (targetUserId === currentAdminId) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Admin cannot modify their own account status"
            });
        }

        // Step 4: Validate status in request body

        const rawStatus = req.body.status;

        if (!rawStatus || typeof rawStatus !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Status is required and must be a text string"
            });
        }

        const cleanStatus = rawStatus.trim().toUpperCase();

        const allowedAdminStatuses: string[] = [UserStatus.ACTIVE, UserStatus.SUSPENDED];

        if (!allowedAdminStatuses.includes(cleanStatus)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Invalid status: ${cleanStatus}. Allowed: ${allowedAdminStatuses.join(", ")}`
            });
        }

        // Step 5: Check if target user exists in database

        const targetUser = await prisma.user.findUnique({
            where: {
                id: targetUserId
            },
            select: {
                id: true,
                name: true,
                email: true,
                status: true,
                role: true
            }
        });

        if (!targetUser) {

            return sendError({
                res: res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "User not found"
            });
        }

        // Step 6: Check if user is already in this status

        if (targetUser.status === cleanStatus) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `User is already ${cleanStatus}`
            });
        }

        // Step 7: Update user status in database

        const updatedUser = await prisma.user.update({
            where: {
                id: targetUserId
            },
            data: {
                status: cleanStatus as UserStatus
            },
            select: {
                id: true,
                name: true,
                email: true,
                status: true,
                role: true,
                createdAt: true,
                updatedAt: true
            }
        });

        // Step 8: Suspending hides this user's projects from the public list,
        // so the cached listing is now wrong — drop it either way, since
        // reactivating has to restore them immediately too.

        await clearProjectsCache();

        // Step 9: Return updated user

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.USER_STATUS_UPDATED,
            resData: {
                user: updatedUser
            }
        });

    }
    catch (error) {

        return next(error);
    }
}


// ============================================================
// Function:   updateUserRole
// Route:      PATCH /api/admin/update-user-role/:id
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageUsers
// Body:       { role: "USER" | "ADMIN" }
// Returns:    200 { user }
// Errors:     400 malformed id / invalid role / targeting yourself
//             401 no token / 403 missing MANAGE_USERS / 404 user not found
// Flow:
//   1. authMiddleware    -> Verifies JWT, attaches req.user.
//   2. verifyManageUsers -> Requires the MANAGE_USERS action.
//   3. Controller        -> Blocks self-demotion, then updates the role.
// ============================================================

async function updateUserRole(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Admin user ID from request

        const currentAdminId = req.user?.id;

        if (!currentAdminId) {

            return sendError({
                res: res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Validate target user ID from URL parameters

        const rawUserId = req.params.id;

        if (!rawUserId || typeof rawUserId !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID is required in URL parameters"
            });
        }

        const targetUserId = rawUserId.trim();

        if (!UUID_REGEX.test(targetUserId)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID must be a valid UUID"
            });
        }

        // Step 3: Prevent self-demotion

        if (targetUserId === currentAdminId) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Admin cannot modify their own role"
            });
        }

        // Step 4: Validate role in request body

        const rawRole = req.body.role;

        if (!rawRole || typeof rawRole !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Role is required and must be a text string"
            });
        }

        const cleanRole = rawRole.trim().toUpperCase();

        const allowedRoles: string[] = Object.values(Role);

        if (!allowedRoles.includes(cleanRole)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Invalid role: ${cleanRole}. Allowed: ${allowedRoles.join(", ")}`
            });
        }

        // Step 5: Check if target user exists in database

        const targetUser = await prisma.user.findUnique({
            where: {
                id: targetUserId
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true
            }
        });

        if (!targetUser) {

            return sendError({
                res: res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "User not found"
            });
        }

        // Step 6: Check if user already has that role

        if (targetUser.role === cleanRole) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `User already has the role: ${cleanRole}`
            });
        }

        // Step 7: Update user role in database

        const updatedUser = await prisma.user.update({
            where: {
                id: targetUserId
            },
            data: {
                role: cleanRole as Role
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true
            }
        });

        // Step 8: Return updated user

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.USER_ROLE_UPDATED,
            resData: {
                user: updatedUser
            }
        });

    }
    catch (error) {

        return next(error);
    }
}


// ============================================================
// Function:   getUserDetailsAdmin
// Route:      GET /api/admin/user-details/:id
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageUsers
// Query:      ?page=number, ?limit=number
//             (applied to both the projects and applications lists)
// Returns:    200 { user, projects, applications }
// Errors:     400 malformed id or pagination
//             401 no token / 403 missing MANAGE_USERS / 404 user not found
// Flow:
//   1. authMiddleware    -> Verifies JWT, attaches req.user.
//   2. verifyManageUsers -> Requires the MANAGE_USERS action.
//   3. Controller        -> Returns the profile plus both paginated lists.
// ============================================================

async function getUserDetailsAdmin(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Validate target user ID from URL parameters

        const rawUserId = req.params.id;

        if (!rawUserId || typeof rawUserId !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID is required in URL parameters"
            });
        }

        const cleanUserId = rawUserId.trim();

        if (!UUID_REGEX.test(cleanUserId)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID must be a valid UUID"
            });
        }

        // Step 2: Read page and limit from the URL (shared by both lists)

        const pagination = buildPagination(req.query.page, req.query.limit);

        if (pagination.error !== null) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: pagination.error
            });
        }

        // Step 3: Fetch the user with counts only (lists are fetched separately)

        const userData = await prisma.user.findUnique({
            where: {
                id: cleanUserId
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        projects: true,
                        applications: true
                    }
                }
            }
        });

        // Step 4: No match -> 404

        if (!userData) {

            return sendError({
                res: res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "User not found"
            });
        }

        // Step 5: Fetch this page of the user's projects

        const projectsData = await prisma.project.findMany({
            where: {
                ownerId: cleanUserId
            },
            select: {
                id: true,
                title: true,
                techStack: true,
                status: true,
                createdAt: true
            },
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" }
            ],
            take: pagination.limit,
            skip: pagination.skip
        });

        // Step 6: Fetch this page of the user's applications

        const applicationsData = await prisma.application.findMany({
            where: {
                userId: cleanUserId
            },
            select: {
                id: true,
                status: true,
                note: true,
                githubProfile: true,
                createdAt: true,
                project: {
                    select: {
                        id: true,
                        title: true
                    }
                }
            },
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" }
            ],
            take: pagination.limit,
            skip: pagination.skip
        });

        // Step 7: Return the profile with both paginated lists

        const totalProjects = userData._count.projects;

        const totalApplications = userData._count.applications;

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.USER_PROFILE_FETCHED,
            resData: {
                user: userData,
                projects: {
                    projects: projectsData,
                    count: projectsData.length,
                    total: totalProjects,
                    totalPages: Math.max(1, Math.ceil(totalProjects / pagination.limit)),
                    page: pagination.page,
                    limit: pagination.limit
                },
                applications: {
                    applications: applicationsData,
                    count: applicationsData.length,
                    total: totalApplications,
                    totalPages: Math.max(1, Math.ceil(totalApplications / pagination.limit)),
                    page: pagination.page,
                    limit: pagination.limit
                }
            }
        });

    }
    catch (error) {

        return next(error);
    }
}


// ============================================================
// Function:   deleteProjectAdmin
// Route:      DELETE /api/admin/delete-project/:id
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageProjects
// Returns:    200 null
// Errors:     400 malformed id / 401 no token
//             403 missing MANAGE_PROJECTS / 404 project not found
// Effects:    deletes any project (applications cascade),
//             clears the cached project listing
// Flow:
//   1. authMiddleware       -> Verifies JWT, attaches req.user.
//   2. verifyManageProjects -> Requires the MANAGE_PROJECTS action.
//   3. Controller           -> Deletes the project, then clears the cache.
// ============================================================

async function deleteProjectAdmin(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Validate target project ID from URL parameters

        const rawProjectId = req.params.id;

        if (!rawProjectId || typeof rawProjectId !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project ID is required in URL parameters"
            });
        }

        const cleanProjectId = rawProjectId.trim();

        if (!UUID_REGEX.test(cleanProjectId)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project ID must be a valid UUID"
            });
        }

        // Step 2: Check if project exists in database

        const projectData = await prisma.project.findUnique({
            where: {
                id: cleanProjectId
            },
            select: {
                id: true,
                title: true
            }
        });

        // Step 3: No match -> 404

        if (!projectData) {

            return sendError({
                res: res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "Project not found"
            });
        }

        // Step 4: Permanently delete project (applications cascade automatically)

        await prisma.project.delete({
            where: {
                id: cleanProjectId
            }
        });

        // Step 5: Drop the cached project listing (admin deletes count as writes too)

        await clearProjectsCache();

        // Step 6: Return success response

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECT_DELETED,
            resData: null
        });

    }
    catch (error) {

        return next(error);
    }
}


// ============================================================
// Function:   deleteUserAdmin
// Route:      DELETE /api/admin/delete-user/:id
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageUsers
// Returns:    200 deleted
// Errors:     400 invalid id or self-delete / 403 missing MANAGE_USERS / 404 no user
// Flow:
//   1. Controller -> Validates the target id.
//   2. Controller -> Refuses when the target is the caller.
//   3. Controller -> Deletes the user. Projects and applications cascade:
//      the schema declares onDelete: Cascade on both, so there is nothing
//      left orphaned and no second query to run.
// ============================================================

async function deleteUserAdmin(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Validate the target user id from the URL

        const rawUserId = req.params.id;

        if (!rawUserId || typeof rawUserId !== "string") {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID is required in URL parameters"
            });
        }

        const cleanUserId = rawUserId.trim();

        if (!UUID_REGEX.test(cleanUserId)) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "User ID must be a valid UUID"
            });
        }

        // Step 2: An admin must not delete their own account from here —
        // that is what the Settings page is for, and it keeps at least one
        // admin in the database by accident of clicking the wrong row.

        if (req.user && req.user.id === cleanUserId) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "You cannot delete your own account from the admin panel"
            });
        }

        // Step 3: The user must exist

        const userData = await prisma.user.findUnique({
            where: {
                id: cleanUserId
            },
            select: {
                id: true,
                email: true
            }
        });

        if (!userData) {

            return sendError({
                res: res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "User not found"
            });
        }

        // Step 4: Delete the account (projects + applications cascade)

        await prisma.user.delete({
            where: {
                id: cleanUserId
            }
        });

        // Step 5: Their projects are gone, so the cached listing is stale

        await clearProjectsCache();

        // Step 6: Respond

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.USER_DELETED,
            resData: null
        });

    }
    catch (error) {

        return next(error);
    }
}


// ============================================================
// Function:   getPlatformStats
// Route:      GET /api/admin/platform-stats
// In:         app.ts (/api/admin) -> admin.routes.ts -> here
// Access:     Protected (Admin only)
// Middleware: authMiddleware, verifyManageSystem
// Returns:    200 { users, projects, applications } counts
// Errors:     401 no token / 403 missing MANAGE_SYSTEM
// Flow:
//   1. authMiddleware     -> Verifies JWT, attaches req.user.
//   2. verifyManageSystem -> Requires the MANAGE_SYSTEM action.
//   3. Controller         -> Counts users, projects and applications.
// ============================================================

async function getPlatformStats(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Query user metrics sequentially

        const totalUsers = await prisma.user.count();

        const activeUsers = await prisma.user.count({
            where: {
                status: UserStatus.ACTIVE
            }
        });

        const suspendedUsers = await prisma.user.count({
            where: {
                status: UserStatus.SUSPENDED
            }
        });

        const deactivatedUsers = await prisma.user.count({
            where: {
                status: UserStatus.DEACTIVATED
            }
        });

        // Step 2: Query project metrics sequentially

        const totalProjects = await prisma.project.count();

        const openProjects = await prisma.project.count({
            where: {
                status: ProjectStatus.OPEN
            }
        });

        const closedProjects = await prisma.project.count({
            where: {
                status: ProjectStatus.CLOSED
            }
        });

        // Step 3: Query application metrics sequentially

        const totalApplications = await prisma.application.count();

        const pendingApplications = await prisma.application.count({
            where: {
                status: ApplicationStatus.PENDING
            }
        });

        const acceptedApplications = await prisma.application.count({
            where: {
                status: ApplicationStatus.ACCEPTED
            }
        });

        const rejectedApplications = await prisma.application.count({
            where: {
                status: ApplicationStatus.REJECTED
            }
        });

        // Step 4: Return platform statistics

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.PLATFORM_STATS_FETCHED,
            resData: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    suspended: suspendedUsers,
                    deactivated: deactivatedUsers
                },
                projects: {
                    total: totalProjects,
                    open: openProjects,
                    closed: closedProjects
                },
                applications: {
                    total: totalApplications,
                    pending: pendingApplications,
                    accepted: acceptedApplications,
                    rejected: rejectedApplications
                }
            }
        });

    }
    catch (error) {

        return next(error);
    }
}


export {
    getAllUsers,
    updateUserStatus,
    updateUserRole,
    getUserDetailsAdmin,
    deleteProjectAdmin,
    deleteUserAdmin,
    getPlatformStats
};
