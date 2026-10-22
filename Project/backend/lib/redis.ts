// ============================================================
// Layer:      Library
// File:       redis.ts
// Purpose:    The one Redis connection the whole backend shares.
// Exports:    redis
// Used by:    authTokens.ts, cache.ts, rateLimiter.middleware.ts,
//             auth.controller.ts, user.controller.ts, auth.middleware.ts
// Effects:    opens one TCP connection when this module is first imported
// ============================================================

/**
 * Redis Client Configuration & Lifecycle Management
 * 
 * This module exports a shared Redis singleton instance used across the backend for:
 * 1. JWT token revocation / blacklisting (logout)
 * 2. Response caching
 * 3. Rate limiting
 */

import Redis from "ioredis";
import { env } from "../src/config/env";

// Step 1: Create the client from the already-validated env values
// Note: Initialize Redis client using validated environment configuration
const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT
});

// Step 2: Attach the lifecycle listeners (all four only log)

// Note: Emitted when connection is established to the Redis server
redis.on("connect", () => {
    console.log("Redis connected successfully!");
});

// Note: Emitted when an error occurs during connection or command execution
redis.on("error", (error) => {
    console.error("Redis connection error:", error.message);
});

// Note: Emitted when the client attempts to reconnect after a lost connection
redis.on("reconnecting", () => {
    console.log("Redis is reconnecting...");
});

// Note: Emitted when the connection is permanently closed
redis.on("end", () => {
    console.log("Redis connection closed.");
});

export { redis };
