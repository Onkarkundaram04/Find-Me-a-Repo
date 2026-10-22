// ============================================================
// Layer:      Utils
// File:       cache.ts
// Purpose:    Read, fill and clear the cached project listing.
// Exports:    getCachedProjects, setCachedProjects, clearProjectsCache
// Used by:    project.controller.ts, admin.controller.ts
// Effects:    Redis key "cache:projects:default" (read / setex / del)
// ============================================================

/*
--------------------------------------------------------------------------------
WHAT DOES THIS FILE DO?
--------------------------------------------------------------------------------
Small cache helpers for the "all projects" listing.

Cache-aside flow:
  1. READ  -> try getCachedProjects() first. Hit = return it (no DB query).
  2. MISS  -> controller queries Postgres, then calls setCachedProjects().
  3. WRITE -> any project create/update/delete calls clearProjectsCache().

One key, one TTL, no key explosion.
--------------------------------------------------------------------------------
*/

import { redis } from "../../lib/redis";


// Note: One shared key for the default (unfiltered) project listing

const PROJECTS_CACHE_KEY = "cache:projects:default";

// Note: How long the cached listing stays fresh (in seconds)

const PROJECTS_CACHE_TTL = 60;


// ============================================================
// Function: getCachedProjects
// Input:    none
// Returns:  the cached listing object — or null on a miss / expired key
// Effects:  Redis GET "cache:projects:default"
// ============================================================

// Note 1: Read the cached listing (returns null if missing or expired)

async function getCachedProjects() {

    const cachedValue = await redis.get(PROJECTS_CACHE_KEY);

    if (!cachedValue) {

        return null;
    }

    // Step 1: Stored as JSON -> parse it back into the response shape

    const cachedProjects = JSON.parse(cachedValue);

    return cachedProjects;
}


// ============================================================
// Function: setCachedProjects
// Input:    the response data to remember
// Returns:  nothing
// Effects:  Redis SETEX "cache:projects:default" for PROJECTS_CACHE_TTL
// ============================================================

// Note 2: Store the listing for the TTL window

async function setCachedProjects(projectsData: unknown) {

    // Step 1: JSON keeps the exact shape the controller sends

    const value = JSON.stringify(projectsData);

    // Step 2: One key, one TTL -> Redis drops it on its own

    await redis.setex(PROJECTS_CACHE_KEY, PROJECTS_CACHE_TTL, value);

}


// ============================================================
// Function: clearProjectsCache
// Input:    none
// Returns:  nothing
// Effects:  Redis DEL "cache:projects:default"
// ============================================================

// Note 3: Throw the cache away after any project write

async function clearProjectsCache() {

    // Step 1: The next read rebuilds it from Postgres

    await redis.del(PROJECTS_CACHE_KEY);
}


export {
    PROJECTS_CACHE_KEY,
    PROJECTS_CACHE_TTL,
    getCachedProjects,
    setCachedProjects,
    clearProjectsCache
};
