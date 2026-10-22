
// ============================================================
// Layer:      Controller
// File:       auth.controller.ts
// Purpose:    Registration, login, token refresh and session end.
// Exports:    registerUser, loginUser, refreshAccessToken, getMe, logOut
// Used by:    auth.routes.ts
// Auth:       Only /me and /logout need a token; the rest are public.
// ============================================================

import { Request, Response, NextFunction } from "express";
import { sendError, sendSuccess } from "../utils/response";
import { ErrorMessage, SuccessMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { UserStatus } from "../../generated/prisma/enums";
import { redis } from "../../lib/redis";
import {
    issueTokenPair,
    hashRefreshToken,
    rotateRefreshToken,
    revokeRefreshFamily,
    revokeRefreshSession
} from "../utils/authTokens";
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
import {
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_OPTIONS,
    CLEAR_COOKIE_OPTIONS
} from "../config/cookies";


// ============================================================
// Function:   registerUser
// Route:      POST /api/auth/register
// In:         app.ts (/api/auth) -> auth.routes.ts -> here
// Access:     Public
// Middleware: authRateLimiter
// Body:       { name: string, email: string, password: string }
// Returns:    201 { user, accessToken }
// Errors:     400 missing or invalid name / email / password
//             409 email already registered
// Effects:    stores the refresh token in Redis, sets the refresh cookie
// Flow:
//   1. authRateLimiter -> Blocks more than 5 attempts per IP per 15 minutes.
//   2. Controller      -> Validates input, hashes the password, creates the
//                         user, then issues the token pair.
// ============================================================

async function registerUser(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: Destructure the request body

        const { name, email, password } = req.body;

        // Step 2: All three fields are required
        if (!name || !email || !password) {

            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: 'Name, email, and password are required'
                }
            );
        }

        // Step 3: All three values must be text strings
        if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {

            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: 'Name, email, and password must be text strings'
                }
            );
        }

        // Step 4: Sanitize the name and email (trim, lowercase the email)
        const sanitizedName = name.trim();

        const sanitizedEmail = email.trim().toLowerCase();


        // Step 5: Validate the name length
        if (sanitizedName.length < NAME_MIN_LENGTH || sanitizedName.length > NAME_MAX_LENGTH) {

            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters long`
                }
            );
        }

        // Step 6: Validate the email length
        if (sanitizedEmail.length < EMAIL_MIN_LENGTH || sanitizedEmail.length > EMAIL_MAX_LENGTH) {
            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Email must be between ${EMAIL_MIN_LENGTH} and ${EMAIL_MAX_LENGTH} characters long`
                }
            );
        }

        // Step 7: Validate the email format
        if (!EMAIL_REGEX.test(sanitizedEmail)) {

            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: 'Please enter a valid email address'
                }
            );
        }


        // Step 8: Validate the password length
        if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters long`
                }
            );
        }

        // Step 9: Validate the password strength
        if (!PASSWORD_REGEX.test(password)) {

            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: 'Password must contain at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character'
                }
            );
        }




        // Step 10: Reject an email that is already registered

        const existingUser = await prisma.user.findUnique(
            {
                where: { email: sanitizedEmail }
            }
        );

        if (existingUser) {

            return sendError(
                {
                    res,
                    resCode: 409,
                    resMessage: ErrorMessage.CONFLICT_ERROR,
                    resError: "User with this email already exists!"
                }
            );
        }

        // Step 11: Hash the password

        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);


        // Step 12: Create the user row (password never leaves this file in clear)

        const userData = await prisma.user.create(
            {
                data: {
                    name: sanitizedName,
                    email: sanitizedEmail,
                    password: hashedPassword
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                    createdAt: true
                }
            }
        );

        // Step 13: Issue the token pair and set the refresh cookie

        const tokenPair = await issueTokenPair(userData.id, userData.role);

        res.cookie(REFRESH_COOKIE_NAME, tokenPair.refreshToken, REFRESH_COOKIE_OPTIONS);

        // Step 14: Return the new user and the access token

        return sendSuccess(
            {
                res,
                resCode: 201,
                resMessage: SuccessMessage.USER_REGISTERED,
                resData: {
                    user: userData,
                    accessToken: tokenPair.accessToken
                }
            }
        );

    }
    catch (error) {

        next(error);

    }
}

// ============================================================
// Function:   loginUser
// Route:      POST /api/auth/login
// In:         app.ts (/api/auth) -> auth.routes.ts -> here
// Access:     Public
// Middleware: authRateLimiter
// Body:       { email: string, password: string }
// Returns:    200 { user, accessToken }
// Errors:     400 invalid email format
//             401 wrong email or password
//             403 account is not ACTIVE
// Effects:    stores the refresh token in Redis, sets the refresh cookie
// Flow:
//   1. authRateLimiter -> Blocks more than 5 attempts per IP per 15 minutes.
//   2. Controller      -> Finds the user, blocks non-ACTIVE accounts, compares
//                         the password, then issues the token pair.
// ============================================================

async function loginUser(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: Destructure the request body
        const { email, password } = req.body;

        // Step 2: Both fields are required
        if (!email || !password) {
            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Email and password are required."
                }
            );
        }

        // Step 3: Both fields must be text strings
        if (typeof email !== "string" || typeof password !== "string") {

            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Email and password should be text strings."
                }
            );
        }

        // Step 4: Sanitize the email (trim + lowercase)
        const sanitizedEmail = email.trim().toLowerCase();

        // Step 5: Validate the email length and format
        if (sanitizedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(sanitizedEmail)) {
            return sendError(
                {
                    res,
                    resCode: 400,
                    resMessage: ErrorMessage.VALIDATION_ERROR,
                    resError: "Please enter a valid email address."
                }
            );
        }

        // Step 6: Load the user by email, including the password hash
        const userData = await prisma.user.findUnique(
            {
                where: { email: sanitizedEmail },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                    password: true,
                    createdAt: true
                }
            }
        );

        // Step 7: Unknown email -> same message as a wrong password
        if (!userData) {

            return sendError(
                {
                    res,
                    resCode: 401,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "Invalid email or password!"
                }
            );
        }

        // Step 8: Block suspended accounts (Administrators alone manage suspensions)
        if (userData.status === UserStatus.SUSPENDED) {
            return sendError({
                res,
                resCode: 403,
                resMessage: ErrorMessage.FORBIDDEN_ERROR,
                resError: `Your account has been ${userData.status.toLowerCase()} by an administrator`
            });
        }

        // Step 9: Compare the submitted password with the stored hash
        const isPasswordValid = await bcrypt.compare(password, userData.password);

        if (!isPasswordValid) {
            return sendError(
                {
                    res,
                    resCode: 401,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "Invalid email or password!"
                }
            );
        }

        // Step 10: Auto-reactivate a deactivated account on a successful login
        let currentStatus = userData.status;

        if (userData.status === UserStatus.DEACTIVATED) {
            await prisma.user.update({
                where: {
                    id: userData.id
                },
                data: {
                    status: UserStatus.ACTIVE
                }
            });
            currentStatus = UserStatus.ACTIVE;
        }

        // Step 11: Issue the token pair and set the refresh cookie
        const tokenPair = await issueTokenPair(userData.id, userData.role);

        res.cookie(REFRESH_COOKIE_NAME, tokenPair.refreshToken, REFRESH_COOKIE_OPTIONS);


        // Step 12: Return the safe user shape (status after any reactivation)
        return sendSuccess(
            {
                res,
                resCode: 200,
                resMessage: SuccessMessage.USER_LOGGED_IN,
                resData: {
                    user: {
                        id: userData.id,
                        name: userData.name,
                        email: userData.email,
                        role: userData.role,
                        status: currentStatus,
                        createdAt: userData.createdAt
                    },
                    accessToken: tokenPair.accessToken
                }
            }
        );


    }
    catch (err) {
        next(err);
    }
}


// ============================================================
// Function:   refreshAccessToken
// Route:      POST /api/auth/refresh
// In:         app.ts (/api/auth) -> auth.routes.ts -> here
// Access:     Public (the httpOnly cookie is the credential)
// Middleware: none, the cookie itself is the proof
// Returns:    200 { user, accessToken }
// Errors:     401 missing, expired or reused refresh token
//             403 account is not ACTIVE
// Effects:    rotates the token in Redis, revokes the whole family on reuse,
//             resets or clears the refresh cookie
// Flow:
//   1. Controller -> Reads the cookie and rotates the hashed token in Redis.
//   2. Controller -> Re-checks the user, issues a new pair in the same family.
// ============================================================

async function refreshAccessToken(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Read the refresh token from the httpOnly cookie
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {

            return sendError(
                {
                    res,
                    resCode: 401,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "Refresh token is required"
                }
            );
        }

        // Step 2: Hash the raw token and try to rotate it in Redis

        const hashedToken = hashRefreshToken(refreshToken);


        const rotationResult = await rotateRefreshToken(hashedToken);

        // Step 3: Reject if rotation failed (invalid, expired, or reused)

        if (!rotationResult.success) {
            res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);


            if (rotationResult.failureReason === "REUSED") {
                return sendError(
                    {
                        res,
                        resCode: 401,
                        resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                        resError: "Refresh token reuse detected. Please log in again."
                    }
                );
            }

            return sendError(
                {
                    res,
                    resCode: 401,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "Invalid or expired refresh token"
                }
            );
        }

        // Step 4: Keep the types honest - a successful rotation always carries both ids
        const userId = rotationResult.userId;

        const familyId = rotationResult.familyId;

        if (userId === null || familyId === null) {
            return sendError(
                {
                    res,
                    resCode: 500,
                    resMessage: ErrorMessage.INTERNAL_SERVER_ERROR,
                    resError: "Rotation succeeded without a user or family id"
                }
            );
        }


        // Step 5: Confirm the user still exists and is still active

        const existingUser = await prisma.user.findUnique(
            {
                where: {
                    id: userId
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                    createdAt: true
                }
            }
        );

        if (!existingUser) {
            await revokeRefreshFamily(familyId);

            res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

            return sendError(
                {
                    res,
                    resCode: 401,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "User account no longer exists"
                }
            );
        }

        if (existingUser.status !== UserStatus.ACTIVE) {

            await revokeRefreshFamily(familyId);

            res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

            return sendError(
                {
                    res,
                    resCode: 403,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "Account is " + existingUser.status.toLowerCase()
                }
            );
        }

        // Step 6: Issue a fresh pair in the SAME family and reset the cookie

        const tokenPair = await issueTokenPair(existingUser.id, existingUser.role, familyId);

        res.cookie(REFRESH_COOKIE_NAME, tokenPair.refreshToken, REFRESH_COOKIE_OPTIONS);

        // Step 7: Return only the new access token; the refresh token stays in the cookie

        return sendSuccess(
            {
                res,
                resCode: 200,
                resMessage: SuccessMessage.TOKEN_REFRESHED,
                resData: {
                    user: {
                        id: existingUser.id,
                        name: existingUser.name,
                        email: existingUser.email,
                        role: existingUser.role,
                        status: existingUser.status,
                        createdAt: existingUser.createdAt
                    },
                    accessToken: tokenPair.accessToken
                }
            }
        );

    }
    catch (error) {

        return next(error);
    }
}



// ============================================================
// Function:   getMe
// Route:      GET /api/auth/me
// In:         app.ts (/api/auth) -> auth.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Returns:    200 { user }
// Errors:     401 no token / revoked token / deleted user
// Flow:
//   1. authMiddleware -> Verifies JWT, checks the blacklist, loads req.user.
//   2. Controller     -> Re-reads the profile and returns it.
// ============================================================

async function getMe(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: req.user was attached by authMiddleware

        const userId = req.user?.id;

        if (!userId) {
            return sendError(
                {
                    res,
                    resCode: 401,
                    resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                    resError: "User not authenticated!"
                }
            );
        }

        // Step 2: Re-read the profile (the token only carries id and role)

        const userData = await prisma.user.findUnique({
            where: { id: userId },
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

        // Step 3: User vanished between the middleware and this query

        if (!userData) {
            return sendError({
                res,
                resCode: 404,
                resMessage: ErrorMessage.RESOURCE_NOT_FOUND,
                resError: "User not found"
            });
        }

        // Step 4: Return the profile

        return sendSuccess({
            res,
            resCode: 200,
            resMessage: SuccessMessage.USER_PROFILE_FETCHED,
            resData: {
                user: userData
            }
        });

    }
    catch (error) {
        return next(error);
    }

}

// ============================================================
// Function:   logOut
// Route:      POST /api/auth/logout
// In:         app.ts (/api/auth) -> auth.routes.ts -> here
// Access:     Protected (Logged-in user)
// Middleware: authMiddleware
// Returns:    200 null
// Errors:     401 no token
// Effects:    blacklists the access token, revokes the refresh family,
//             clears the refresh cookie
// Flow:
//   1. authMiddleware -> Verifies JWT, attaches req.user.
//   2. Controller     -> Blacklists the access token, revokes the family,
//                        then clears the cookie.
// ============================================================

async function logOut(req: Request, res: Response, next: NextFunction) {
    try {

        // Step 1: Extract the access token from the Authorization header
        const authHeader = req.headers.authorization;

        const accessToken = authHeader?.split(" ")[1];

        // Step 2: Blacklist the access token in Redis until it naturally expires
        if (accessToken) {
            const decoded = jwt.decode(accessToken) as JwtPayload | null;

            if (decoded && decoded.exp) {

                const currentTimeInSeconds = Math.floor(Date.now() / 1000);

                const remainingSeconds = decoded.exp - currentTimeInSeconds;

                if (remainingSeconds > 0) {

                    await redis.setex(`blacklist:${accessToken}`, remainingSeconds, "revoked");

                }
            }
        }

        // Step 3: Revoke the refresh token (and its whole family) from the cookie
        const refreshToken = req.cookies.refreshToken;

        if (refreshToken) {
            await revokeRefreshSession(refreshToken);
        }

        // Step 4: Clear the refresh cookie from the browser
        res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

        // Step 5: Confirm the session has ended
        return sendSuccess(
            {
                res,
                resCode: 200,
                resMessage: SuccessMessage.USER_LOGGED_OUT,
                resData: null
            }
        );
    }
    catch (error) {
        return next(error);

    }
}
export { registerUser, loginUser, refreshAccessToken, getMe, logOut };