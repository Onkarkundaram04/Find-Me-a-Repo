// ============================================================
// Layer:      Controller
// File:       user.controller.ts
// Purpose:    Self-service account actions for the logged-in user.
// Exports:    updateProfile, updatePassword, deactivateAccount, deleteAccount
// Used by:    user.routes.ts
// Auth:       Every route requires a valid access token.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError, sendSuccess } from "../utils/response";
import { ErrorMessage, SuccessMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { UserStatus } from "../../generated/prisma/enums";
import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { EMAIL_REGEX, PASSWORD_REGEX } from "../config/regex";
import {
    NAME_MIN_LENGTH,
    NAME_MAX_LENGTH,
    EMAIL_MIN_LENGTH,
    EMAIL_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    BCRYPT_SALT_ROUNDS
} from "../config/limits";
import { REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS } from "../config/cookies";
import { revokeRefreshSession } from "../utils/authTokens";
import { redis } from "../../lib/redis";


// ============================================================
// Function:   updateProfile
// Route:      PATCH /api/users/update-profile
// In:         app.ts (/api/users) -> user.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Body:       { name?: string, email?: string }
// Returns:    200 { user }
// Errors:     400 nothing sent / invalid name or email / same email
//             409 email already belongs to another account
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Requires name or email, validates both, blocks a
//                        taken email, then updates only the sent fields.
// ============================================================

async function updateProfile(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: The logged-in user

        const userId = req.user?.id;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        const { name, email } = req.body;

        // Step 2: At least one field must be provided

        if (name === undefined && email === undefined) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "At least name or email must be provided"
            });
        }

        // Step 3: Validate name (if provided)

        let cleanName: string | undefined = undefined;

        if (name !== undefined) {

            if (typeof name !== "string") {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Name must be a text string"
                });
            }

            cleanName = name.trim();

            if (cleanName.length < NAME_MIN_LENGTH || cleanName.length > NAME_MAX_LENGTH) {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters long`
                });
            }
        }

        // Step 4: Validate email (if provided)

        let cleanEmail: string | undefined = undefined;

        if (email !== undefined) {

            if (typeof email !== "string") {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Email must be a text string"
                });
            }

            cleanEmail = email.trim().toLowerCase();

            if (cleanEmail.length < EMAIL_MIN_LENGTH || cleanEmail.length > EMAIL_MAX_LENGTH) {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Email must be between ${EMAIL_MIN_LENGTH} and ${EMAIL_MAX_LENGTH} characters long`
                });
            }

            if (!EMAIL_REGEX.test(cleanEmail)) {
                return sendError({
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Please enter a valid email address"
                });
            }

            // Step 5: Check if email is already taken in the database

            const existingUser = await prisma.user.findUnique({
                where: {
                    email: cleanEmail
                },
                select: {
                    id: true
                }
            });

            if (existingUser) {

                // The same email as the current one means nothing to change

                if (existingUser.id === userId) {
                    return sendError({
                        res,
                        resCode: 400,
                        resMessage: ErrorMessage.VALIDATION_ERROR,
                        resError: "New email must be different from your current email"
                    });
                }

                return sendError({
                    res,
                    resCode: 409,
                    resMessage: ErrorMessage.CONFLICT_ERROR,
                    resError: "This email address is already in use"
                });
            }
        }

        // Step 6: Build update payload dynamically

        const updateData: {
            name?: string;
            email?: string;
        } = {};

        if (cleanName !== undefined) {
            updateData.name = cleanName;
        }

        if (cleanEmail !== undefined) {
            updateData.email = cleanEmail;
        }

        // Step 7: Update user in DB

        const userData = await prisma.user.update({
            where: {
                id: userId
            },
            data: updateData,
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

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.USER_PROFILE_UPDATED,
            resData: {
                user: userData
            }
        });

    }
    catch (error) {

        // Race-condition safety net: unique email constraint fires as P2002

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return sendError({
                res,
                resCode: 409,
                resMessage: ErrorMessage.CONFLICT_ERROR,
                resError: "This email address is already in use"
            });
        }

        return next(error);
    }
}


// ============================================================
// Function:   updatePassword
// Route:      PATCH /api/users/update-password
// In:         app.ts (/api/users) -> user.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Body:       { currentPassword: string, newPassword: string }
// Returns:    200 null
// Errors:     400 missing fields / weak new password / same password
//             401 wrong current password
// Effects:    revokes the refresh family, clears the refresh cookie
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Validates the new password, confirms the current one,
//                        blocks reuse, re-hashes, then kills the session.
// ============================================================

async function updatePassword(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: The logged-in user

        const userId = req.user?.id;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Both passwords are required

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "currentPassword and newPassword are required"
            });
        }

        if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "currentPassword and newPassword must be text strings"
            });
        }

        // Step 3: The new password must follow the same rules as registration

        if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: `New password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters long`
            });
        }

        if (!PASSWORD_REGEX.test(newPassword)) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "New password must contain at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character"
            });
        }

        // Step 4: Load this user's current password hash

        const userData = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                password: true
            }
        });

        if (!userData) {
            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "User not found"
            });
        }

        // Step 5: The current password must be correct

        const isPasswordValid = await bcrypt.compare(currentPassword, userData.password);

        if (!isPasswordValid) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Current password is incorrect"
            });
        }

        // Step 6: Instant 0ms memory check (no costly bcrypt needed!)

        if (currentPassword === newPassword) {
            return sendError({
                res,
                resCode: 400,
                resMessage: ErrorMessage.VALIDATION_ERROR,
                resError: "New password must be different from the current password"
            });
        }


        // Step 7: Hash and save the new password

        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                password: hashedPassword
            }
        });

        // Step 8: Kill the existing refresh session, so a stolen token stops
        // working the moment the password changes

        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            await revokeRefreshSession(refreshToken);
        }

        // Clear the cookie too, otherwise the browser keeps sending a dead token

        res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.USER_PROFILE_UPDATED,
            resData: null
        });

    }
    catch (error) {
        return next(error);
    }
}


// ============================================================
// Function:   deactivateAccount
// Route:      PATCH /api/users/deactivate-account
// In:         app.ts (/api/users) -> user.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Returns:    200 null
// Errors:     401 no token
// Effects:    blacklists the access token, revokes the refresh family,
//             clears the refresh cookie, sets status to DEACTIVATED
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Force logout (blacklist token, revoke refresh family,
//                        clear cookie), then sets status to DEACTIVATED.
// ============================================================

async function deactivateAccount(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: The logged-in user

        const userId = req.user?.id;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Blacklist the current access token until it would expire anyway,
        // so a deactivated account cannot keep calling the API

        const accessToken = req.headers.authorization?.split(" ")[1];

        if (accessToken) {

            const decoded = jwt.decode(accessToken) as JwtPayload | null;

            if (decoded && decoded.exp) {

                const remainingSeconds = decoded.exp - Math.floor(Date.now() / 1000);

                if (remainingSeconds > 0) {
                    await redis.setex(`blacklist:${accessToken}`, remainingSeconds, "revoked");
                }
            }
        }

        // Step 3: Revoke the refresh session in Redis (if cookie present)

        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            await revokeRefreshSession(refreshToken);
        }

        // Step 4: Clear the refresh cookie on client

        res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

        // Step 5: Mark user status as DEACTIVATED in DB

        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                status: UserStatus.DEACTIVATED
            }
        });

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.USER_DEACTIVATED,
            resData: null
        });

    }
    catch (error) {
        return next(error);
    }
}


// ============================================================
// Function:   deleteAccount
// Route:      DELETE /api/users/delete-account
// In:         app.ts (/api/users) -> user.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Returns:    200 null
// Errors:     401 no token
// Effects:    revokes the refresh family, clears the refresh cookie,
//             hard deletes the user (projects + applications cascade)
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Revokes the refresh family, clears the cookie, then
//                        hard deletes the user (projects + applications cascade).
// ============================================================

async function deleteAccount(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: The logged-in user

        const userId = req.user?.id;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Revoke the refresh session (if a cookie is present)

        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            await revokeRefreshSession(refreshToken);
        }

        // Step 3: Clear the refresh cookie on client

        res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

        // Step 4: Delete the user (projects + applications cascade automatically)
        // No access-token blacklist needed here: authMiddleware re-reads the user
        // from the DB on every request, so the next call fails on its own.

        await prisma.user.delete({
            where: {
                id: userId
            }
        });

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.USER_DELETED,
            resData: null
        });

    }
    catch (error) {
        return next(error);
    }
}

export {
    updateProfile,
    updatePassword,
    deactivateAccount,
    deleteAccount
};
