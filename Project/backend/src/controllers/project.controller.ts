// ============================================================
// Layer:      Controller
// File:       project.controller.ts
// Purpose:    Create, browse and manage projects, plus their applicants.
// Exports:    createProject, getAllProjects, getProjectById,
//             getProjectApplications, getMyProjects, updateProject, deleteProject
// Used by:    project.routes.ts
// Auth:       Browsing is public; creating and managing need a token.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError, sendSuccess } from "../utils/response";
import { ErrorMessage, SuccessMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { ProjectStatus, UserStatus } from "../../generated/prisma/enums";
import { GITHUB_URL_REGEX, UUID_REGEX } from "../config/regex";
import {
    PROJECT_TITLE_MIN_LENGTH,
    PROJECT_TITLE_MAX_LENGTH,
    PROJECT_DESCRIPTION_MIN_LENGTH,
    PROJECT_DESCRIPTION_MAX_LENGTH,
    PROJECT_TECH_STACK_MAX_ITEMS
} from "../config/limits";
import { buildPagination } from "../utils/pagination";
import { getCachedProjects, setCachedProjects, clearProjectsCache } from "../utils/cache";



// ============================================================
// Function:   createProject
// Route:      POST /api/projects/create-project
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Body:       { title, description, githubUrl, techStack: string[] }
// Returns:    201 { project }
// Errors:     400 missing or invalid title / description / url / techStack
// Effects:    clears the cached project listing
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Validates every field, normalizes the tech stack,
//                        then stores the project with req.user.id as owner.
// ============================================================
async function createProject(req: Request, res: Response, next: NextFunction) {
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
        const { title, description, githubUrl, techStack } = req.body;

        // Step 3: All four fields are required

        if (!title || !description || !githubUrl || !techStack) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Title, description, githubUrl, and techStack are required"
            });
        }

        // Step 4: title, description and githubUrl must be text

        if (typeof title !== "string" || typeof description !== "string" || typeof githubUrl !== "string") {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Title, description, githubUrl are required in text format"
            });
        }

        // Step 5: Sanitize the strings and start an empty tech list

        const cleanTitle = title.trim();
        const cleanDescription = description.trim();
        const cleanGithubUrl = githubUrl.trim();
        const cleanTechStack: string[] = [];

        // Step 6: Validate the title length

        if (cleanTitle.length < PROJECT_TITLE_MIN_LENGTH || cleanTitle.length > PROJECT_TITLE_MAX_LENGTH) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Title length must be between ${PROJECT_TITLE_MIN_LENGTH} and ${PROJECT_TITLE_MAX_LENGTH} characters`
            }
            );
        }

        // Step 7: Validate the description length

        if (cleanDescription.length < PROJECT_DESCRIPTION_MIN_LENGTH || cleanDescription.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `Description must be between ${PROJECT_DESCRIPTION_MIN_LENGTH} and ${PROJECT_DESCRIPTION_MAX_LENGTH} characters`
            });
        }

        // Step 8: techStack must be a non-empty array

        if (!Array.isArray(techStack) || techStack.length === 0) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Tech stack must be an array with at least one technology"
            });
        }

        // Step 9: Validate and normalize each technology (lowercase + dedupe)

        for (const tech of techStack) {

            if (typeof tech !== "string" || tech.trim().length === 0) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "All tech stack items must be non-empty text strings"
                });
            }

            const lowerTech = tech.trim().toLowerCase();

            if (!cleanTechStack.includes(lowerTech)) {
                cleanTechStack.push(lowerTech);
            }
        }

        // Step 10: Cap the number of technologies

        if (cleanTechStack.length > PROJECT_TECH_STACK_MAX_ITEMS) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `You can provide a maximum of ${PROJECT_TECH_STACK_MAX_ITEMS} technologies`
            });
        }

        // Step 11: githubUrl must be a real GitHub link

        if (!GITHUB_URL_REGEX.test(cleanGithubUrl)) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Invalid GitHub URL"
            });
        }

        // Step 12: Create the project with req.user.id as owner

        const projectData = await prisma.project.create({

            data: {

                title: cleanTitle,
                description: cleanDescription,
                githubUrl: cleanGithubUrl,
                techStack: cleanTechStack,
                ownerId: userId
            },
            select: {

                id: true,
                title: true,
                description: true,
                githubUrl: true,
                techStack: true,
                status: true,
                ownerId: true,
                createdAt: true
            }
        });

        // Step 13: A new project exists -> drop the cached listing

        await clearProjectsCache();

        // Step 14: Return the created project

        return sendSuccess({
            res,
            resCode: 201,
            resMessage: SuccessMessage.PROJECT_CREATED,
            resData: {
                project: projectData
            }
        });

    }
    catch (error) {

        return next(error);

    }
}

// All get functionalities

// ============================================================
// Function:   getAllProjects
// Route:      GET /api/projects/all-projects
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Public
// Middleware: none
// Query:      ?status=OPEN|CLOSED (optional, single or list)
//             ?page=number, ?limit=number
// Returns:    200 { projects, count, total, totalPages, page, limit }
// Errors:     400 invalid status or invalid pagination
// Effects:    reads and fills the 60 second default-view cache
// Flow:
//   1. Controller -> Serves the cache when no filters are sent.
//   2. Controller -> Otherwise validates status + pagination, queries and caches.
// ============================================================
async function getAllProjects(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: Serve the default view from cache when no filters are sent

        const isDefaultView =
            req.query.status === undefined &&
            req.query.page === undefined &&
            req.query.limit === undefined;

        if (isDefaultView) {

            const cachedProjects = await getCachedProjects();

            if (cachedProjects) {

                return sendSuccess({
                    res,
                    resCode: 200,
                    resMessage: SuccessMessage.PROJECTS_FETCHED,
                    resData: cachedProjects
                });
            }
        }

        // Step 2: Read status from URL. If missing, use OPEN.

        let rawStatus: unknown = req.query.status;

        if (rawStatus === undefined) {

            rawStatus = ["OPEN"];
        }

        // Step 3: Make sure it is one value or a list of values

        let statusList: unknown[] = [];

        if (typeof rawStatus === "string") {

            statusList = [rawStatus];
        }
        else if (Array.isArray(rawStatus)) {

            statusList = rawStatus;

        }
        else {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Status must be text"
            });
        }

        // Step 4: Clean every value. Remove spaces and make uppercase.

        const cleanStatus: string[] = [];

        for (const item of statusList) {

            if (typeof item !== "string") {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Every status must be text"
                });
            }

            cleanStatus.push(item.trim().toUpperCase());
        }

        // Step 5: Remove duplicates

        const finalStatus: string[] = [];

        for (const item of cleanStatus) {

            if (!finalStatus.includes(item)) {

                finalStatus.push(item);
            }
        }

        // Step 6: Get the allowed statuses as an array from the Prisma enum.

        const allowedStatus: string[] = Object.values(ProjectStatus);

        // Step 7: Check every value is allowed. If not, send error.

        for (const item of finalStatus) {

            if (!allowedStatus.includes(item)) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Invalid status: ${item}. Allowed: ${allowedStatus.join(", ")}`
                });
            }
        }


        // Step 8: Read page and limit from the URL

        const pagination = buildPagination(req.query.page, req.query.limit);

        if (pagination.error !== null) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: pagination.error
            });
        }

        // Step 9: Count all projects with these statuses

        const where = {
            status: {
                in: finalStatus as ProjectStatus[]
            },
            // Hidden, not deleted: projects owned by a suspended account do not
            // appear in the public list. The same object drives the count.
            owner: {
                status: UserStatus.ACTIVE
            }
        };

        const totalProjects = await prisma.project.count({
            where: where
        });

        // Step 10: Fetch this page (newest first, stable order)

        const projectsData = await prisma.project.findMany(
            {
                where: where,
                select: {
                    id: true,
                    title: true,
                    description: true,
                    githubUrl: true,
                    techStack: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    owner: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    _count: {
                        select: {
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
            }
        );

        // Step 11: Build the response data

        const responseData = {
            projects: projectsData,
            count: projectsData.length,
            total: totalProjects,
            totalPages: Math.max(1, Math.ceil(totalProjects / pagination.limit)),
            page: pagination.page,
            limit: pagination.limit
        };

        // Step 12: Cache the default view only (filtered requests are never cached)

        if (isDefaultView) {
            await setCachedProjects(responseData);
        }

        // Step 13: Return the page

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECTS_FETCHED,
            resData: responseData
        });


    }
    catch (error) {

        return next(error);
    }
}

// ============================================================
// Function:   getProjectById
// Route:      GET /api/projects/project-details/:id
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Public
// Middleware: none
// Returns:    200 { project, applicationsCount }
// Errors:     400 missing or malformed project id
//             404 project not found
// Flow:
//   1. Controller -> Validates the UUID, then returns the project and its
//                    application count.
// ============================================================
async function getProjectById(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Read the project id from the URL

        const projectId = req.params.id;

        // Step 2: The id is required

        if (!projectId) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project id is required"
            });
        }

        // Step 3: The id must be a string

        if (typeof projectId !== "string") {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project id must be a string"
            });
        }

        // Step 4: Trim and reject an empty id

        const cleanProjectId = projectId.trim();

        if (cleanProjectId.length === 0) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project id cannot be empty"
            });
        }

        // Step 5: The id must be a real UUID before it reaches PostgreSQL,
        // otherwise the uuid column throws and the client gets a 500.

        if (!UUID_REGEX.test(cleanProjectId)) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "Project id must be a valid UUID"
            });
        }

        // Step 6: Load the project with its owner and application count

        const projectData = await prisma.project.findUnique({
            where: {
                id: cleanProjectId
            },
            select: {
                id: true,
                title: true,
                description: true,
                githubUrl: true,
                techStack: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                owner: {
                    select: {
                        id: true,
                        name: true,
                        status: true
                    }
                },
                _count: {
                    select: {
                        applications: true
                    }
                }
            }
        });

        // Step 7: No match, or the owner is suspended -> 404
        // A hidden project must not be reachable by its direct link either,
        // otherwise hiding it on the board would only be a visual illusion.

        if (!projectData || projectData.owner.status !== UserStatus.ACTIVE) {

            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "Project not found"
            });
        }

        // Step 8: Return the project and its application count

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECT_DETAILS_FETCHED,
            resData: {
                project: projectData,
                applicationsCount: projectData._count.applications
            }
        });
    }
    catch (error) {

        return next(error);
    }

}

// ============================================================
// Function:   getProjectApplications
// Route:      GET /api/projects/project-applications/:id
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Protected (Project owner or Admin)
// Middleware: authMiddleware, verifyOwner
// Returns:    200 { applications, count }
// Errors:     400 malformed project id
//             401 no token / 403 not the owner / 404 project not found
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. verifyOwner    -> Confirms ownership (admins pass), attaches req.project.
//   3. Controller     -> Returns every application for req.project.id.
// ============================================================
async function getProjectApplications(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: req.project was attached by verifyOwner

        const projectData = req.project;

        // Step 2: Defensive check - the middleware must have attached it

        if (!projectData) {

            return sendError({
                res,
                resCode: 500,
                resMessage: ErrorMessage.INTERNAL_SERVER_ERROR,
                resError: "Project not attached by middleware"
            });
        }

        // Step 3: Load every application for this project, newest first

        const applicationsData = await prisma.application.findMany({
            where: {
                projectId: projectData.id,
                // Applications from suspended accounts are hidden, not deleted
                user: {
                    status: UserStatus.ACTIVE
                }
            },
            select: {
                id: true,
                note: true,
                githubProfile: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        // Step 4: Return the list and its count

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.APPLICATIONS_FETCHED,
            resData: {
                applications: applicationsData,
                count: applicationsData.length
            }
        });
    }
    catch (error) {
        return next(error);
    }
}

// ============================================================
// Function:   getMyProjects
// Route:      GET /api/projects/my-projects
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Query:      ?page=number, ?limit=number
// Returns:    200 { projects, count, total, totalPages, page, limit }
// Errors:     401 no token / 400 invalid pagination
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Lists this owner's projects, newest first, paginated.
// ============================================================
async function getMyProjects(req: Request, res: Response, next: NextFunction) {

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


        // Step 2: Read page and limit from the URL

        const pagination = buildPagination(req.query.page, req.query.limit);

        if (pagination.error !== null) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: pagination.error
            });
        }

        // Step 3: Count all projects owned by this user

        const where = {
            ownerId: userId
        };

        const totalProjects = await prisma.project.count({
            where: where
        });

        // Step 4: Fetch this page (newest first, stable order)

        const myProjectsData = await prisma.project.findMany({

            where: where,
            select: {
                id: true,
                title: true,
                description: true,
                githubUrl: true,
                techStack: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
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

        // Step 5: Return the page

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECTS_FETCHED,
            resData: {
                projects: myProjectsData,
                count: myProjectsData.length,
                total: totalProjects,
                totalPages: Math.max(1, Math.ceil(totalProjects / pagination.limit)),
                page: pagination.page,
                limit: pagination.limit
            }
        });


    }
    catch (error) {

        return next(error);
    }
}


// all update functionalities

// ============================================================
// Function:   updateProject
// Route:      PATCH /api/projects/update-project/:id
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Protected (Project owner or Admin)
// Middleware: authMiddleware, verifyOwner
// Body:       { title?, description?, githubUrl?, techStack?: string[], status? }
// Returns:    200 { project }
// Errors:     400 invalid field or nothing to update
//             401 no token / 403 not the owner / 404 project not found
// Effects:    clears the cached project listing
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. verifyOwner    -> Confirms ownership (admins pass), attaches req.project.
//   3. Controller     -> Validates only the fields sent, updates, clears the cache.
// ============================================================
async function updateProject(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: req.project was attached by verifyOwner

        const projectData = req.project;

        // Step 2: Defensive check - the middleware must have attached it

        if (!projectData) {
            return sendError({
                res,
                resCode: 500,
                resMessage: ErrorMessage.INTERNAL_SERVER_ERROR,
                resError: "Project not attached by middleware"
            });
        }

        // Step 3: Destructure the body and build the update payload

        const { title, description, githubUrl, techStack, status } = req.body;

        const updateData: {
            title?: string;
            description?: string;
            githubUrl?: string;
            techStack?: string[];
            status?: ProjectStatus;
        } = {};

        // Step 4: Title (if given)

        if (title !== undefined) {

            if (typeof title !== "string") {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Title must be text"
                });
            }

            const cleanTitle = title.trim();

            if (cleanTitle.length < PROJECT_TITLE_MIN_LENGTH || cleanTitle.length > PROJECT_TITLE_MAX_LENGTH) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Title must be at least ${PROJECT_TITLE_MIN_LENGTH} and at most ${PROJECT_TITLE_MAX_LENGTH} characters long`
                });
            }

            updateData.title = cleanTitle;
        }

        // Step 5: Description (if given)

        if (description !== undefined) {

            if (typeof description !== "string") {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Description must be text"
                });
            }

            const cleanDescription = description.trim();

            if (cleanDescription.length < PROJECT_DESCRIPTION_MIN_LENGTH || cleanDescription.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Description must be at least ${PROJECT_DESCRIPTION_MIN_LENGTH} and at most ${PROJECT_DESCRIPTION_MAX_LENGTH} characters long`
                });
            }

            updateData.description = cleanDescription;
        }

        // Step 6: GitHub URL (if given)

        if (githubUrl !== undefined) {

            if (typeof githubUrl !== "string" || githubUrl.trim().length === 0) {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Github URL must be non-empty string"
                });
            }

            const cleanGithubUrl = githubUrl.trim();

            if (!GITHUB_URL_REGEX.test(cleanGithubUrl)) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Invalid github url format"
                });
            }


            updateData.githubUrl = cleanGithubUrl;
        }

        // Step 7: Tech stack (if given). Same rules as createProject.

        if (techStack !== undefined) {

            if (!Array.isArray(techStack) || techStack.length === 0) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Tech stack must be an array with at least one technology"
                });
            }

            const cleanTechStack: string[] = [];

            for (const item of techStack) {

                if (typeof item !== "string" || item.trim().length === 0) {

                    return sendError({
                        res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: "All tech stack items must be non-empty text strings"
                    });
                }

                const lowerTech = item.trim().toLowerCase();

                if (!cleanTechStack.includes(lowerTech)) {

                    cleanTechStack.push(lowerTech);
                }
            }

            if (cleanTechStack.length > PROJECT_TECH_STACK_MAX_ITEMS) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `You can provide a maximum of ${PROJECT_TECH_STACK_MAX_ITEMS} technologies`
                });
            }

            updateData.techStack = cleanTechStack;
        }

        // Step 8: Status (if given). Same check as getAllProjects.

        if (status !== undefined) {

            if (typeof status !== "string") {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Status must be text"
                });
            }

            const cleanStatus = status.trim().toUpperCase();

            const allowedStatus: string[] = Object.values(ProjectStatus);

            if (!allowedStatus.includes(cleanStatus)) {

                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Status: ${cleanStatus} is not allowed! Allowed values: ${allowedStatus.join(", ")}`
                });
            }

            updateData.status = cleanStatus as ProjectStatus;
        }

        // Step 9: Make sure at least one field was given

        const updatedFields = Object.keys(updateData);


        if (updatedFields.length === 0) {

            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "No fields to update"
            });
        }

        // Step 10: Update the project

        const updatedProject = await prisma.project.update({

            where: {
                id: projectData.id
            },
            data: updateData,
            select: {
                id: true,
                title: true,
                description: true,
                githubUrl: true,
                techStack: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                owner: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                _count: {
                    select: {
                        applications: true
                    }
                }
            }
        });

        // Step 11: The project changed -> drop the cached listing

        await clearProjectsCache();

        // Step 12: Return the updated project

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECT_UPDATED,
            resData: {
                project: updatedProject
            }
        });


    }
    catch (error) {

        return next(error);
    }
}

// all delete functionalities

// ============================================================
// Function:   deleteProject
// Route:      DELETE /api/projects/delete-project/:id
// In:         app.ts (/api/projects) -> project.routes.ts -> here
// Access:     Protected (Project owner or Admin)
// Middleware: authMiddleware, verifyOwner
// Returns:    200 null
// Errors:     401 no token / 403 not the owner / 404 project not found
// Effects:    deletes the project (applications cascade),
//             clears the cached project listing
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. verifyOwner    -> Confirms ownership (admins pass), attaches req.project.
//   3. Controller     -> Deletes req.project.id, then clears the cache.
// ============================================================

async function deleteProject(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: req.project was attached by verifyOwner

        const projectData = req.project;

        // Step 2: Defensive check - the middleware must have attached it

        if (!projectData) {

            return sendError({
                res,
                resCode: 500,
                resMessage: ErrorMessage.INTERNAL_SERVER_ERROR,
                resError: "Project not attached by middleware"
            });
        }

        // Step 3: Delete the project (applications cascade automatically)

        const deletedProject = await prisma.project.delete({
            where: {
                id: projectData.id
            }
        });


        // Step 4: The project is gone -> drop the cached listing

        await clearProjectsCache();


        // Step 5: Confirm the deletion

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECT_DELETED,
            resData: null
        });

    }
    catch (error) {

        return next(error);
    }
}

export {
    createProject,
    getAllProjects,
    getProjectById,
    getProjectApplications,
    getMyProjects,
    updateProject,
    deleteProject
};