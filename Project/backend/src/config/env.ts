// ============================================================
// Layer:      Config
// File:       env.ts
// Purpose:    Read and validate the environment before anything else runs.
// Exports:    env
// Used by:    lib/prisma.ts, lib/redis.ts, app.ts, server.ts, authTokens.ts
// ============================================================

// Imported by server.ts first, so a missing DATABASE_URL or JWT_SECRET
// throws at import time — the server never starts half-configured.

import "dotenv/config";


// Step 1: Read the required variables from the environment.
const DATABASE_URL = process.env.DATABASE_URL;

const JWT_SECRET = process.env.JWT_SECRET;

const PORT = process.env.PORT || "5000";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";

const REDIS_PORT = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5500";

// Step 2: Stop startup if DATABASE_URL is missing.
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
}

// Step 3: Stop startup if JWT_SECRET is missing.
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
}

// Step 4: REDIS_PORT must be a real port number, not "abc" or 70000.
if (Number.isNaN(REDIS_PORT) || !Number.isInteger(REDIS_PORT) || REDIS_PORT < 1 || REDIS_PORT > 65535) {
    throw new Error("REDIS_PORT must be a valid port number between 1 and 65535. Received: " + process.env.REDIS_PORT);
}

// Step 5: Export the checked values for the rest of the backend.
export const env = {
    DATABASE_URL,
    JWT_SECRET,
    PORT,
    REDIS_HOST,
    REDIS_PORT,
    FRONTEND_ORIGIN
};
