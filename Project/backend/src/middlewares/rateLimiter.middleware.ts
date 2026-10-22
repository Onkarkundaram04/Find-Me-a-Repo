// ============================================================
// Layer:      Middleware
// File:       rateLimiter.middleware.ts
// Purpose:    Throttle brute-force logins and application spam.
// Exports:    authRateLimiter, applyRateLimiter
// Used by:    auth.routes.ts (login/register), application.routes.ts (apply)
// ============================================================

/**
 * Authentication Rate Limiter Middleware (Redis-Powered)
 * 
 * -----------------------------------------------------------------------------------------
 * WHAT IS RATE LIMITING?
 * -----------------------------------------------------------------------------------------
 * Think of rate limiting like an ATM card pin security feature:
 * - If you enter the wrong PIN 3 times, the ATM locks your card for 24 hours.
 * - Without rate limiting, a hacker could write a computer script that tries 10,000 different 
 *   passwords every second until they crack your account (called a Brute-Force Attack).
 * 
 * -----------------------------------------------------------------------------------------
 * HOW DOES THIS REDIS IMPLEMENTATION WORK? (REAL-WORLD EXAMPLE)
 * -----------------------------------------------------------------------------------------
 * Suppose a user from IP "192.168.1.5" attempts to log in:
 * 
 * 1. Request #1:
 *    - Redis runs: INCR rateLimit:192.168.1.5 -> Count becomes 1.
 *    - Because Count is 1 (first attempt), we start a 15-minute countdown (900 seconds).
 *    - Request is allowed to proceed to loginUser controller.
 * 
 * 2. Request #2 to #5:
 *    - Redis runs: INCR rateLimit:192.168.1.5 -> Count becomes 2, 3, 4, 5.
 *    - All 5 attempts are within the limit, so they are allowed.
 * 
 * 3. Request #6 (Exceeds limit):
 *    - Redis runs: INCR rateLimit:192.168.1.5 -> Count becomes 6.
 *    - 6 > 5! The request is immediately BLOCKED with HTTP status 429 (Too Many Requests).
 *    - We fetch TTL (Time-To-Live) from Redis to tell the user how many minutes to wait.
 * 
 * 4. After 15 minutes:
 *    - Redis automatically deletes the key "rateLimit:192.168.1.5".
 *    - The user starts fresh with 0 attempts.
 */

import { Request, Response, NextFunction } from "express";
import { redis } from "../../lib/redis";
import { sendError } from "../utils/response";
import { ErrorMessage } from "../utils/messages.headlines";
import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS } from "../config/limits";


// ============================================================
// Middleware: authRateLimiter
// Goal:       Cap login/register attempts per IP address.
// Reads:      req.ip (falls back to the socket address)
// Rejects:    429 once the IP passes LOGIN_MAX_ATTEMPTS in the window
// Effects:    INCR "rateLimit:<ip>", EXPIRE on the first hit, TTL read on block
// Flow:
//   1. authRateLimiter -> Blocks more than 5 attempts per IP per 15 minutes.
//   2. Controller      -> Never runs for a blocked caller.
// ============================================================

async function authRateLimiter(req: Request, res: Response, next: NextFunction) {
    try {
        // Step 1: Identify the caller by their network IP address
        // (req.ip works behind proxies; fallback to socket remote address)
        const clientIpAddress = req.ip || req.socket.remoteAddress || "UNKNOWN_IP";

        // Step 2: Unique Redis key for this specific IP address
        // Example key in Redis: "rateLimit:127.0.0.1"
        const key = `rateLimit:${clientIpAddress}`;

        // Step 3: Increment the counter in Redis by 1.
        // If the key does not exist yet, Redis creates it with value = 1.
        const requestCount = await redis.incr(key);

        console.log(`[RateLimiter] IP: ${clientIpAddress} | Attempt: ${requestCount} / ${LOGIN_MAX_ATTEMPTS}`);

        // Step 4: If this is the client's first request, start the expiration timer
        if (requestCount === 1) {
            await redis.expire(key, LOGIN_WINDOW_SECONDS);
        }

        // Step 5: Check if the client exceeded the allowed threshold
        if (requestCount > LOGIN_MAX_ATTEMPTS) {
            // Get the remaining seconds until Redis auto-deletes this key
            const ttl = await redis.ttl(key);

            // Convert remaining seconds to minutes (rounded up)
            const remainingMinutes = Math.ceil(ttl / 60);

            return sendError({
                res,
                resCode: 429, // 429 = Too Many Requests
                resMessage: ErrorMessage.RATE_LIMIT_EXCEEDED,
                resError: `Too many requests. Please try again after ${remainingMinutes} minute(s).`
            });
        }

        // Step 6: Client is within limit -> forward to the next middleware/controller
        return next();

    } catch (error) {
        // Pass any unexpected errors to our centralized error middleware
        return next(error);
    }
}


// Per-user limit for submitting applications (anti-spam)
const APPLY_LIMIT_MAX = 20;

// 3 hours in seconds
const APPLY_LIMIT_WINDOW_SECONDS = 3 * 60 * 60;


// ============================================================
// Middleware: applyRateLimiter
// Goal:       Cap how many applications one user can send.
// Reads:      req.user (from authMiddleware)
// Rejects:    401 no user / 429 once the user passes APPLY_LIMIT_MAX
// Effects:    INCR "applyLimit:<uuid>", EXPIRE on the first hit,
//             TTL read on block
// Flow:
//   1. authMiddleware   -> Verifies JWT, attaches req.user.
//   2. applyRateLimiter -> Blocks more than 20 applications per 3 hours.
//   3. Controller       -> Never runs for a blocked caller.
// ============================================================

async function applyRateLimiter(req: Request, res: Response, next: NextFunction) {

    try {

        // Step 1: Identify the caller by user id (set by authMiddleware)
        const userId = req.user?.id;

        if (!userId) {
            return sendError({
                res,
                resCode: 401,
                resMessage: ErrorMessage.AUTHENTICATION_ERROR,
                resError: "User not authenticated"
            });
        }

        // Step 2: Unique Redis key for this user
        // Example key in Redis: "applyLimit:550e8400-e29b-41d4-a716-446655440000"

        const key = `applyLimit:${userId}`;

        // Step 3: Increment the counter (creates it at 1 on the first apply)
        const requestCount = await redis.incr(key);

        // Step 4: Start the 3-hour window on the first apply
        if (requestCount === 1) {

            await redis.expire(key, APPLY_LIMIT_WINDOW_SECONDS);
        }

        // Step 5: Block once the limit is exceeded
        if (requestCount > APPLY_LIMIT_MAX) {

            const ttl = await redis.ttl(key);

            const remainingMinutes = Math.ceil(ttl / 60);

            return sendError({
                res,
                resCode: 429,
                resMessage: ErrorMessage.RATE_LIMIT_EXCEEDED,
                resError: `Too many applications. Please try again after ${remainingMinutes} minute(s).`
            });
        }

        // Step 6: Within limit -> forward to the controller

        return next();

    }
    catch (error) {

        return next(error);
    }
}

export { authRateLimiter, applyRateLimiter };
