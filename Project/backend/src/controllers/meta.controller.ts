// ============================================================
// Layer:      Controller
// File:       meta.controller.ts
// Purpose:    Hands the frontend the vocabularies it needs to build filter UI:
//             the enum values straight from the schema, and every tech tag
//             actually used by a project.
// Exports:    getMeta
// Used by:    meta.routes.ts
// Auth:       Public.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/response";
import { SuccessMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { ApplicationStatus, ProjectStatus, Role, UserStatus } from "../../generated/prisma/enums";


// ============================================================
// Function:   getMeta
// Route:      GET /api/meta
// In:         app.ts (/api/meta) -> meta.routes.ts -> here
// Access:     Public
// Middleware: none
// Returns:    200 { roles, userStatuses, projectStatuses, applicationStatuses,
//                  techStack: [{ name, count }], projects }
// Flow:
//   1. Controller -> Reads every enum straight from the generated Prisma enum.
//   2. Controller -> Counts the tech tags actually used across all projects.
//   3. Controller -> Returns both, tags most-used first.
//
// Why this exists: the frontend must not contain a copy of the database
// vocabulary. When a status is added to the schema, or somebody posts a project
// using a new technology, the filter UI picks it up with no client change.
// ============================================================

async function getMeta(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Enum values from the schema, not from a literal in the controller

        const roles = Object.values(Role);

        const userStatuses = Object.values(UserStatus);

        const projectStatuses = Object.values(ProjectStatus);

        const applicationStatuses = Object.values(ApplicationStatus);

        // Step 2: Read only the tech stack column of every project

        const projectsData = await prisma.project.findMany({
            // Tags are counted only from projects people can actually see
            where: {
                owner: {
                    status: UserStatus.ACTIVE
                }
            },
            select: {
                techStack: true
            }
        });

        // Step 3: Count how many projects use each tag

        const tagCounts = new Map<string, number>();

        for (const project of projectsData) {

            for (const tag of project.techStack) {

                const current = tagCounts.get(tag);

                tagCounts.set(tag, current === undefined ? 1 : current + 1);
            }
        }

        // Step 4: Most used first, then alphabetical so the order is stable

        const techStack = Array.from(tagCounts, ([name, count]) => ({ name: name, count: count }));

        techStack.sort((first, second) => {

            if (second.count !== first.count) {

                return second.count - first.count;
            }

            return first.name.localeCompare(second.name);
        });

        // Step 5: Platform totals, so the landing page can state real numbers.
        // Every count respects the same rule as the listings: content owned by
        // a suspended account is not counted, because nobody can see it.

        const visibleOwner = { owner: { status: UserStatus.ACTIVE } };

        const counts = {
            users: await prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
            projects: projectsData.length,
            openProjects: await prisma.project.count({
                where: { ...visibleOwner, status: ProjectStatus.OPEN }
            }),
            applications: await prisma.application.count({
                where: { user: { status: UserStatus.ACTIVE }, project: { owner: { status: UserStatus.ACTIVE } } }
            })
        };

        // Step 6: Return everything the UI needs in one round trip

        return sendSuccess({
            res: res,
            resCode: 200,
            resMessage: SuccessMessage.META_FETCHED,
            resData: {
                roles: roles,
                userStatuses: userStatuses,
                projectStatuses: projectStatuses,
                applicationStatuses: applicationStatuses,
                techStack: techStack,
                counts: counts,
                projects: projectsData.length
            }
        });

    }
    catch (error) {

        return next(error);
    }
}

export {
    getMeta
};
