// ============================================================
// Layer:      Controller
// File:       application.controller.ts
// Purpose:    Create, list, decide and withdraw project applications.
// Exports:    createApplication, getMyApplications, updateApplicationStatus,
//             deleteApplication
// Used by:    application.routes.ts
// Auth:       Every route requires a valid access token.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError, sendSuccess } from "../utils/response";
import { ErrorMessage, SuccessMessage } from "../utils/messages.headlines";
import { GITHUB_PROFILE_REGEX, UUID_REGEX } from "../config/regex";
import { prisma } from "../../lib/prisma";
import { ApplicationStatus, ProjectStatus, UserStatus } from "../../generated/prisma/enums";
import { Prisma } from "../../generated/prisma/client";
import { buildPagination } from "../utils/pagination";
import { Actions, canPerformAction } from "../config/permissions";
import { APPLICATION_NOTE_MIN_LENGTH, APPLICATION_NOTE_MAX_LENGTH } from "../config/limits";

// ============================================================
// Function:   createApplication
// Route:      POST /api/applications/apply
// In:         app.ts (/api/applications) -> application.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware, applyRateLimiter
// Body:       { projectId: string, note: string, githubProfile: string }
// Returns:    201 { application }
// Errors:     400 missing or invalid projectId / note / githubProfile
//             401 no token / 403 applying to your own project
//             404 project not found / 409 project closed or already applied
// Effects:    counts against the per-user apply limit (20 per 3 hours)
// Flow:
//   1. authMiddleware   -> Verifies JWT, attaches req.user.
//   2. applyRateLimiter -> Blocks more than 20 applications per 3 hours.
//   3. Controller       -> Validates body, project OPEN, no self-apply, no dupes.
// ============================================================

async function createApplication(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: req.user was attached by authMiddleware

        const userId = req.user?.id;

        if (!userId) {

            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Destructure the request body

        const { projectId, note, githubProfile } = req.body;

        // Step 3: All fields required

        if (!projectId || !note || !githubProfile) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "projectId, note, githubProfile are required"
            });
        }

        // Step 4: All fields must be text strings (arrays/numbers rejected here)

        if (typeof projectId !== "string" || typeof note !== "string" || typeof githubProfile !== "string") {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "projectId, note, githubProfile must be strings"
            });
        }

        // Step 5: Sanitize (trim everything)

        const cleanProjectId = projectId.trim();
        const cleanNote = note.trim();
        const cleanGithubProfile = githubProfile.trim();

        // Step 6: projectId must be a real UUID (fail in memory before hitting the DB)

        if (!UUID_REGEX.test(cleanProjectId)) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid project ID format"
            });
        }



        // Step 7: Note length (no empty, no essays)

        if (cleanNote.length < APPLICATION_NOTE_MIN_LENGTH || cleanNote.length > APPLICATION_NOTE_MAX_LENGTH) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Note must be between ${APPLICATION_NOTE_MIN_LENGTH} to ${APPLICATION_NOTE_MAX_LENGTH} characters long`
            });
        }


        // Step 8: githubProfile must be a valid GitHub profile URL

        if (!GITHUB_PROFILE_REGEX.test(cleanGithubProfile)) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Please provide a valid github profile url"
            });
        }

        // Step 9: The project must exist, and its owner must still be active

        const projectData = await prisma.project.findUnique({
            where: {
                id: cleanProjectId
            },
            select: {
                id: true,
                ownerId: true,
                status: true,
                owner: {
                    select: {
                        status: true
                    }
                }
            }
        });

        // A suspended owner's project is hidden, so it is also "not found" here.
        // Otherwise applications would pile up for someone who cannot log in.
        if (!projectData || projectData.owner.status !== UserStatus.ACTIVE) {
            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "Project not found"
            });
        }

        // Step 10: Cannot apply to a project that is not OPEN

        if (projectData.status !== ProjectStatus.OPEN) {
            return sendError({
                res,
                resCode: 409,
                resMessage: ErrorMessage.CONFLICT_ERROR,
                resError: "Cannot apply to a project that is not open"
            });
        }

        // Step 11: Cannot apply to your own project

        if (projectData.ownerId === userId) {

            return sendError({
                res,
                resCode: 403,
                resMessage: ErrorMessage.FORBIDDEN_ERROR,
                resError: "You cannot apply to your own project"
            });

        }

        // Step 12: No duplicate application (pre-check for a clean 409)

        const duplicateApplicationCheck = await prisma.application.findUnique({
            where: {
                userId_projectId: {
                    userId: userId,
                    projectId: cleanProjectId
                }
            }
        });

        if (duplicateApplicationCheck) {

            return sendError({
                res,
                resCode: 409,
                resMessage: ErrorMessage.CONFLICT_ERROR,
                resError: "You have already applied to this project"
            });
        }


        // Step 13: Create the application (status defaults to PENDING)

        const applicationData = await prisma.application.create({
            data: {
                note: cleanNote,
                githubProfile: cleanGithubProfile,
                projectId: cleanProjectId,
                userId: userId
            },
            select: {
                id: true,
                note: true,
                githubProfile: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
                projectId: true
            }
        });


        // Step 14: Return the created application

        return sendSuccess({
            res,
            resCode: 201,
            resMessage: SuccessMessage.APPLICATION_SUBMITTED,
            resData: {
                application: applicationData
            }
        });
    }
    catch (error) {

        // Step 15: Race-condition safety net.
        // If two requests slip past the Step 12 pre-check at the same instant,
        // the @@unique([userId, projectId]) constraint fires here as P2002.

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {

            return sendError({
                res,
                resCode: 409,
                resMessage: ErrorMessage.CONFLICT_ERROR,
                resError: "You have already applied to this project"
            });
        }

        // Step 16: Generic server error

        return next(error);
    }
}


// ============================================================
// Function:   getMyApplications
// Route:      GET /api/applications/my-applications
// In:         app.ts (/api/applications) -> application.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Query:      ?status=PENDING|ACCEPTED|REJECTED (optional), ?page=, ?limit=
// Returns:    200 { applications, count, total, totalPages, page, limit }
// Errors:     401 no token / 400 invalid status or invalid pagination
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Filters by req.user.id (+ optional status), paginates.
// ============================================================

async function getMyApplications(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: req.user was attached by authMiddleware

        const userId = req.user?.id;

        if (!userId) {

            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Optional status filter from the URL (?status=PENDING)

        let statusFilter: ApplicationStatus | undefined = undefined;

        const rawStatus = req.query.status;

        if (rawStatus !== undefined) {

            if (typeof rawStatus !== "string") {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Status must be a string"
                });
            }

            const cleanStatus = rawStatus.trim().toUpperCase();

            const allowedStatus: string[] = Object.values(ApplicationStatus);

            if (!allowedStatus.includes(cleanStatus)) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Invalid status: ${cleanStatus}. Allowed: ${allowedStatus.join(", ")}`
                });

            }

            statusFilter = cleanStatus as ApplicationStatus;
        }



        // Step 3: Read page and limit from the URL

        const pagination = buildPagination(req.query.page, req.query.limit);

        if (pagination.error !== null) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: pagination.error
            });
        }

        // Step 4: Build the filter (an undefined status is ignored by Prisma)

        const where = {
            userId: userId,
            status: statusFilter
        };

        // Step 5: Count all matching applications

        const totalApplications = await prisma.application.count({
            where: where
        });


        // Step 6: Fetch this page (newest first, stable order)

        const applicationsData = await prisma.application.findMany({
            where: where,
            select: {
                id: true,
                note: true,
                githubProfile: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                projectId: true,
                project: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        techStack: true,
                        githubUrl: true,
                        status: true,
                        owner: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
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

        // Step 7: Empty list is still a success (not an error)

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.APPLICATIONS_FETCHED,
            resData: {
                applications: applicationsData,
                count: applicationsData.length,
                total: totalApplications,
                totalPages: Math.max(1, Math.ceil(totalApplications / pagination.limit)),
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
// Function:   updateApplicationStatus
// Route:      PATCH /api/applications/update-status/:id
// In:         app.ts (/api/applications) -> application.routes.ts -> here
// Access:     Protected (Project owner or Admin)
// Middleware: authMiddleware
// Body:       { status: "ACCEPTED" | "REJECTED" }
// Returns:    200 { application }
// Errors:     400 invalid application id or status
//             401 no token / 403 not the project owner / 404 not found
//             409 project is closed or application already has that status
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Loads the application + its project, checks the
//                        requester is the owner (or admin), then updates.
// ============================================================


async function updateApplicationStatus(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: The logged-in user (id + role)

        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Read the application id from the URL

        const applicationId = req.params.id;

        if (!applicationId || typeof applicationId !== "string") {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid application ID"
            });
        }

        const cleanApplicationId = applicationId.trim();

        // Step 3: The id must be a real UUID

        if (!UUID_REGEX.test(cleanApplicationId)) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid application ID format"
            });
        }

        // Step 4: The requested status is required

        const status = req.body.status;


        if (!status) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Status is required"
            });
        }

        // Step 5: Status must be text

        if (typeof status !== "string") {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Status must be a string"
            });
        }

        // Step 6: Only ACCEPTED or REJECTED are valid decisions

        const cleanStatus = status.trim().toUpperCase();

        const allowedStatus: string[] = Object.values(ApplicationStatus);

        if (!allowedStatus.includes(cleanStatus)) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Invalid application status: ${cleanStatus}. Allowed: ${allowedStatus.join(",")}`
            });

        }

        const finalStatus = cleanStatus as ApplicationStatus;

        // Step 7: Load the application together with its project owner

        const applicationData = await prisma.application.findUnique({
            where: {
                id: cleanApplicationId
            },
            select: {
                id: true,
                status: true,
                project: {
                    select: {
                        id: true,
                        ownerId: true,
                        status: true
                    }
                }
            }
        });

        // Step 8: No match -> 404

        if (!applicationData) {

            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "Application not found"
            });
        }

        // Step 9: Only the project owner (or an admin) may decide

        let authorized = false;

        if (applicationData.project.ownerId === userId) {

            authorized = true;
        }
        else if (canPerformAction(userRole, Actions.UPDATE_APPLICATION_STATUS)) {

            authorized = true;
        }

        if (!authorized) {

            return sendError({
                res,
                resCode: 403,
                resMessage: ErrorMessage.FORBIDDEN_ERROR,
                resError: "You are not authorized to update this application status"
            });
        }

        // Step 10: The project must still be OPEN

        if (applicationData.project.status !== ProjectStatus.OPEN) {
            return sendError({
                res,
                resCode: 409,
                resMessage: ErrorMessage.CONFLICT_ERROR,
                resError: "Cannot update application status for a project that is not open"
            });
        }

        // Step 11: Reject a no-op status

        if (applicationData.status === finalStatus) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Application is already ${finalStatus.toLowerCase()}`
            });
        }

        // Step 12: Update the application in the database

        const updatedApplication = await prisma.application.update({
            where: {
                id: cleanApplicationId
            },
            data: {
                status: finalStatus
            },
            select: {
                id: true,
                note: true,
                githubProfile: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
                projectId: true
            }
        });

        // Step 13: Return the updated application

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.APPLICATION_STATUS_UPDATED,
            resData: {
                application: updatedApplication
            }
        });


    }
    catch (error) {

        return next(error);
    }

}

// ============================================================
// Function:   deleteApplication
// Route:      DELETE /api/applications/delete-application/:id
// In:         app.ts (/api/applications) -> application.routes.ts -> here
// Access:     Protected (Applicant or Admin)
// Middleware: authMiddleware
// Returns:    200 null
// Errors:     400 malformed application id / 401 no token
//             403 not the applicant / 404 application not found
//             409 already accepted or rejected
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> The applicant may withdraw a PENDING application,
//                        admins may delete one in any status.
// ============================================================

async function deleteApplication(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: The logged-in user

        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Read the application id from the URL

        const applicationId = req.params.id;

        if (!applicationId || typeof applicationId !== "string") {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid application ID"
            });
        }

        const cleanApplicationId = applicationId.trim();

        // Step 3: The id must be a real UUID

        if (!UUID_REGEX.test(cleanApplicationId)) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid application ID format"
            });
        }

        // Step 4: Load the application

        const applicationData = await prisma.application.findUnique({
            where: {
                id: cleanApplicationId
            },
            select: {
                id: true,
                userId: true,
                status: true
            }
        });

        // Step 5: No match -> 404

        if (!applicationData) {
            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "Application not found"
            });
        }

        // Step 6: Only the applicant (or an admin) may delete

        let authorized = false;

        if (applicationData.userId === userId) {
            authorized = true;
        }
        else if (canPerformAction(userRole, Actions.DELETE_APPLICATION)) {
            authorized = true;
        }

        if (!authorized) {
            return sendError({
                res,
                resCode: 403,
                resMessage: ErrorMessage.FORBIDDEN_ERROR,
                resError: "You are not authorized to delete this application"
            });
        }


        // Step 7: Only a PENDING application can be withdrawn.
        // Admins skip this, because moderation must be able to remove a
        // decided application too.

        const isAdmin = canPerformAction(userRole, Actions.DELETE_APPLICATION);

        if (!isAdmin && applicationData.status !== ApplicationStatus.PENDING) {
            return sendError({
                res,
                resCode: 409,
                resMessage: ErrorMessage.CONFLICT_ERROR,
                resError: `Cannot delete an application that is already ${applicationData.status.toLowerCase()}`
            });
        }

        // Step 8: Delete the application

        await prisma.application.delete({
            where: {
                id: cleanApplicationId
            }
        });

        // Step 9: Confirm the withdrawal

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.APPLICATION_WITHDRAWN,
            resData: null
        });

    }
    catch (error) {

        return next(error);
    }
}

export {
    createApplication,
    getMyApplications,
    updateApplicationStatus,
    deleteApplication
};
