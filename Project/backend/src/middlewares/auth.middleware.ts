// ============================================================
// Layer:      Middleware
// File:       auth.middleware.ts
// Purpose:    Verify the access token and load the caller into req.user.
// Exports:    authMiddleware
// Used by:    auth.routes.ts, project.routes.ts, application.routes.ts,
//             user.routes.ts, admin.routes.ts
// ============================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { sendError } from "../utils/response";
import { ErrorMessage } from "../utils/messages.headlines";
import { prisma } from "../../lib/prisma";
import { UserStatus } from "../../generated/prisma/enums";
import { redis } from "../../lib/redis";


// ============================================================
// Middleware: authMiddleware
// Goal:       Prove the caller holds a valid, unrevoked access token.
// Reads:      req.headers.authorization ("Bearer <token>")
// Attaches:   req.user = { id, role } (fresh from the database)
// Rejects:    401 missing header / bad scheme / invalid or expired token /
//             blacklisted token / token without a user id / deleted user
//             403 account is not ACTIVE
// Effects:    one Redis read per request (blacklist:<token>)
// Flow:
//   1. Router         -> Mounted on every route that needs a logged-in user.
//   2. authMiddleware -> Reads the header, verifies the JWT, loads the user.
//   3. Controller     -> Only runs once req.user is attached.
// ============================================================

async function authMiddleware(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Extract the Authorization header from the incoming request

        /*
            Expected Authorization Header Format:
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsInJvbGUiOiJVU0VSIiwiZXhwIjoxNjk1..."
                              └─────┘ └─────────────────────────────────────────────────────────────────────────────────┘
                              Index 0                                     Index 1 (Raw JWT Token)

            When we do: authHeader.split(" ")
            - authHeader.split(" ")[0] => "Bearer" (the authorization scheme)
            - authHeader.split(" ")[1] => "eyJhbGci..." (the cryptographic JWT token we extract and verify)
        */

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Authorization header not found"
            });
        }

        // Step 2: Split the header string into two parts: ["Bearer", "<token>"]

        const authParts = authHeader.split(" ");

        if (authParts.length !== 2) {

            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Authorization header must contain Bearer and one token"
            });
        }


        // Step 3: Check that the scheme is Bearer.

        const authScheme = authParts[0];

        if (authScheme !== "Bearer") {

            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Authorization scheme must be Bearer"
            });
        }

        // Step 4: Read the token from the second element of the split array

        const token = authParts[1];

        if (!token) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Token is required"
            });
        }

        // Step 5: Verify cryptographic signature and decode the JWT payload

        const decodedToken = jwt.verify(
            token,
            env.JWT_SECRET
        );

        /*
            In-memory type validation on the decoded payload

            When jwt.verify() succeeds, it returns either a primitive string or a JwtPayload object:

            Why does jwt.verify() return 'string | JwtPayload'?
            - In jsonwebtoken, you can sign a primitive string literal: jwt.sign("hello", secret).
                If someone does that, jwt.verify() decodes and returns the raw primitive string "hello".
            - But when signing an object dictionary (like we do: jwt.sign({ id, role }, secret)),
                jwt.verify() parses the JSON and returns a structured JwtPayload object.

            Expected Decoded Shape (JwtPayload):
            {
                id: "550e8400-e29b-41d4-a716-446655440000",  // string (User's PostgreSQL UUID)
                role: "USER",                                // string (User's Role enum: "USER" | "ADMIN")
                iat: 1727870000,                             // number (Issued-at timestamp)
                exp: 1728474800                              // number (Expiration timestamp)
            }
        */

        // Step 6: Reject if the decoded token returned a primitive string instead of an object

        if (typeof decodedToken === "string") {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Invalid token"
            });
        }

        // Step 7: Check that the token contains a user ID as a string.

        if (typeof decodedToken.id !== "string") {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Token does not contain user ID"
            });
        }

        // Step 8: Check if the token has been revoked/blacklisted in Redis

        const isRevoked = await redis.get(`blacklist:${token}`);

        if (isRevoked) {

            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Token has been revoked. Please log in again."
            });
        }

        // Step 9: Query the database to confirm that a real user account exists with that ID.
        //         The role comes from the database, not the token, so a demotion takes
        //         effect immediately.

        const existingUser = await prisma.user.findUnique(
            {
                where: {
                    id: decodedToken.id
                },
                select: {
                    id: true,
                    role: true,
                    status: true
                }
            }
        );

        // Step 10: No such account (deleted after the token was issued)

        if (!existingUser) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User account no longer exists"
            });
        }

        // Step 11: Any status other than ACTIVE is refused

        if (existingUser.status !== UserStatus.ACTIVE) {
            return sendError({
                res,
                resCode: 403,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Account is " + existingUser.status.toLowerCase()
            });
        }

        // Step 12: Attach verified user credentials to Express request object for downstream controllers

        req.user = {
            id: existingUser.id,
            role: existingUser.role
        };

        // Step 13: Proceed to next middleware or route controller

        return next();
    }
    catch (error) {

        // Handle expected JWT client errors (expired, malformed, or tampered token)

        if (error instanceof jwt.JsonWebTokenError) {

            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "Invalid or expired token"
            });

        }

        // Pass unexpected server errors to centralized error middleware

        return next(error);
    }

}

export { authMiddleware };
