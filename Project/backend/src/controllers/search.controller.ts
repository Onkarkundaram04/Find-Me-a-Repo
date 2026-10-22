// ============================================================
// Layer:      Controller
// File:       search.controller.ts
// Purpose:    Filter projects by id, title, tech stack, status or owner.
// Exports:    omniSearchProjects
// Used by:    search.routes.ts
// Auth:       Public.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError, sendSuccess } from "../utils/response";
import { ErrorMessage, SuccessMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { ProjectStatus, UserStatus } from "../../generated/prisma/enums";
import { Prisma } from "../../generated/prisma/client";
import { buildPagination } from "../utils/pagination";
import { UUID_REGEX } from "../config/regex";


// ============================================================
// Function:   omniSearchProjects
// Route:      GET /api/search
// In:         app.ts (/api/search) -> search.routes.ts -> here
// Access:     Public
// Middleware: none
// Query:      ?id=uuid (optional)
//             ?title=text or ?q=text (optional)
//             ?techStack=tag (optional, single or list)
//             ?status=OPEN|CLOSED (optional, single or list)
//             ?ownerName=text (optional)
//             ?page=number, ?limit=number
// Returns:    200 { projects, count, total, totalPages, page, limit }
// Errors:     400 invalid id / status / ownerName / pagination
// Flow:
//   1. Controller -> Validates each filter that was actually sent.
//   2. Controller -> Builds one where clause (filters combine with AND).
//   3. Controller -> Validates pagination, queries, returns the page.
// ============================================================

async function omniSearchProjects(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Optional Project ID filter (?id=uuid)

        let cleanId: string | undefined = undefined;

        const rawId = req.query.id;

        if (rawId !== undefined) {

            if (typeof rawId !== "string") {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Project ID must be a text string"
                });
            }

            const trimmedId = rawId.trim();

            // Step 2: The id must be a valid UUID

            if (!UUID_REGEX.test(trimmedId)) {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Project ID must be a valid UUID"
                });
            }

            cleanId = trimmedId;
        }

        // Step 3: Optional Title or Keyword filter (?title=text or ?q=text)

        let cleanTitle: string | undefined = undefined;

        const rawTitle = req.query.title;

        if (rawTitle !== undefined) {

            if (typeof rawTitle !== "string") {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Title search query must be a text string"
                });
            }

            const trimmedTitle = rawTitle.trim();

            if (trimmedTitle.length > 0) {

                cleanTitle = trimmedTitle;
            }
        }

        // Step 3b: Optional omni query (?q=text) — searches title, developer
        // name and project id at once. This is what the search box sends, so
        // typing "Priya" finds her projects and pasting a UUID finds that one.
        // `title` above stays title-only for callers that want exactly that.

        let cleanQuery: string | undefined = undefined;

        const rawQuery = req.query.q;

        if (rawQuery !== undefined) {

            if (typeof rawQuery !== "string") {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Search query must be a text string"
                });
            }

            const trimmedQuery = rawQuery.trim();

            if (trimmedQuery.length > 0) {

                cleanQuery = trimmedQuery;
            }
        }

        // Step 4: Optional Tech Stack filter (?techStack=Node.js or ?techStack=Node.js&techStack=React)

        const finalTechStack: string[] = [];

        const rawTechStack = req.query.techStack;

        if (rawTechStack !== undefined) {

            let techStackList: unknown[] = [];

            if (typeof rawTechStack === "string") {

                techStackList = [rawTechStack];
            }
            else if (Array.isArray(rawTechStack)) {

                techStackList = rawTechStack;
            }
            else {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Tech stack must be text"
                });
            }

            // Step 5: Clean every technology tag (trim + lowercase)
            // Project tags are stored lowercase in createProject, so the query
            // must be lowercased too or "React" would never match "react".

            const cleanTags: string[] = [];

            for (const item of techStackList) {

                if (typeof item !== "string") {

                    return sendError({
                        res: res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: "Every tech stack tag must be text"
                    });
                }

                const trimmedTag = item.trim().toLowerCase();

                if (trimmedTag.length > 0) {

                    cleanTags.push(trimmedTag);
                }
            }

            // Step 6: Remove duplicate tags

            for (const item of cleanTags) {

                if (!finalTechStack.includes(item)) {

                    finalTechStack.push(item);
                }
            }
        }

        // Step 7: Optional Status filter (?status=OPEN or ?status=OPEN&status=CLOSED)

        const finalStatus: ProjectStatus[] = [];

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

            // Step 8: Clean every status value (trim + uppercase)

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

            // Step 9: Remove duplicate statuses

            for (const item of cleanStatus) {

                if (!finalStatus.includes(item as ProjectStatus)) {

                    finalStatus.push(item as ProjectStatus);
                }
            }

            // Step 10: Validate every status against the ProjectStatus enum

            const allowedStatus: string[] = Object.values(ProjectStatus);

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

        // Step 11: Optional Creator / Owner Name filter (?ownerName=Alex)

        let cleanOwnerName: string | undefined = undefined;

        const rawOwnerName = req.query.ownerName;

        if (rawOwnerName !== undefined) {

            if (typeof rawOwnerName !== "string") {

                return sendError({
                    res: res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Owner name must be a text string"
                });
            }

            const trimmedOwnerName = rawOwnerName.trim();

            if (trimmedOwnerName.length > 0) {

                cleanOwnerName = trimmedOwnerName;
            }
        }

        // Step 12: Validate pagination parameters

        const pagination = buildPagination(req.query.page, req.query.limit);

        if (pagination.error !== null) {

            return sendError({
                res: res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: pagination.error
            });
        }

        // Step 13: Build the where clause from the active filters

        const where: Prisma.ProjectWhereInput = {};

        if (cleanId !== undefined) {

            where.id = cleanId;
        }

        if (cleanTitle !== undefined) {

            where.title = {
                contains: cleanTitle,
                mode: "insensitive"
            };
        }

        // Step 13b: The omni query matches ANY of: title, developer name, id.
        // Prisma ANDs this with every other filter, so `q` narrows the result
        // set rather than replacing it.

        if (cleanQuery !== undefined) {

            const matches: Prisma.ProjectWhereInput[] = [
                {
                    title: {
                        contains: cleanQuery,
                        mode: "insensitive"
                    }
                },
                {
                    owner: {
                        name: {
                            contains: cleanQuery,
                            mode: "insensitive"
                        }
                    }
                }
            ];

            // A pasted project id should find that exact project
            if (UUID_REGEX.test(cleanQuery)) {

                matches.push({ id: cleanQuery });
            }

            where.OR = matches;
        }

        if (finalTechStack.length > 0) {

            where.techStack = {
                hasSome: finalTechStack
            };
        }

        if (finalStatus.length > 0) {

            where.status = {
                in: finalStatus
            };
        }

        // Step 13e: Only content owned by an ACTIVE account.
        // A suspended owner's projects are hidden, never deleted — reactivating
        // the account brings every one of them back exactly as it was. The same
        // `where` drives the count below, so the total stays honest.

        const ownerFilter: Prisma.UserWhereInput = {
            status: UserStatus.ACTIVE
        };

        if (cleanOwnerName !== undefined) {

            ownerFilter.name = {
                contains: cleanOwnerName,
                mode: "insensitive"
            };
        }

        where.owner = ownerFilter;

        // Step 14: Count total matching projects in database

        const totalProjects = await prisma.project.count({
            where: where
        });

        // Step 15: Fetch paginated projects with author info and application count

        const projectsData = await prisma.project.findMany({
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
                ownerId: true,
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
        });

        // Step 16: Return the page

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.PROJECTS_FETCHED,
            resData: {
                projects: projectsData,
                count: projectsData.length,
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

export {
    omniSearchProjects
};
