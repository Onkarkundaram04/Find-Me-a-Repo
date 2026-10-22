// ============================================================
// Layer:      Utils
// File:       authTokens.ts
// Purpose:    Create and rotate the access + refresh token pair.
// Exports:    ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_SECONDS, signAccessToken,
//             generateRefreshToken, hashRefreshToken, saveRefreshToken,
//             issueTokenPair, isRefreshFamilyRevoked, revokeRefreshFamily,
//             rotateRefreshToken, revokeRefreshSession
// Used by:    auth.controller.ts, user.controller.ts, config/cookies.ts
// Effects:    Redis keys "refresh:<hash>" and "refreshFamilyRevoked:<familyId>"
// ============================================================

/*
-----------------------------------------------------------------------------------------
WHAT DOES THIS FILE DO?
-----------------------------------------------------------------------------------------
Central place for creating the two auth tokens used by the app:

1. Access Token  -> short-lived JWT (15 minutes). Sent on every request as "Bearer <token>".
2. Refresh Token -> long-lived random string (7 days). Stored HASHED in Redis and used
                    only to get a new access token from POST /api/auth/refresh.

Why a separate file? registerUser and loginUser issue the exact same pair, so this keeps
that logic in one place instead of repeating it.
-----------------------------------------------------------------------------------------
*/

import jwt from "jsonwebtoken";
import { randomBytes, randomUUID, createHash } from "crypto";
import { env } from "../config/env";
import { redis } from "../../lib/redis";


// ----------------- TOKEN LIFETIMES -----------------

// Note: How long each token stays valid
const ACCESS_TOKEN_TTL = "15m";     // 15 Minutes

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;     // 7 Days


// ============================================================
// Function: signAccessToken
// Input:    userId, userRole
// Returns:  a signed JWT string (id + role inside, expires in ACCESS_TOKEN_TTL)
// ============================================================

// Note 1: Create a short-lived access token (JWT) carrying the user's id and role.
function signAccessToken(userId: string, userRole: string): string {

    // Step 1: Only id and role go in the payload — nothing secret

    const payload = {
        id: userId,
        role: userRole
    };

    // Step 2: Sign it with the secret and the short TTL

    const accessToken = jwt.sign(
        payload,
        env.JWT_SECRET,
        {
            expiresIn: ACCESS_TOKEN_TTL
        }
    );

    return accessToken;
}


// ============================================================
// Function: generateRefreshToken
// Input:    none
// Returns:  an 80-character random hex string (not a JWT)
// ============================================================

// Note 2: Create a long-lived refresh token as a plain random string (NOT a JWT).
// 40 random bytes -> 80 hex characters. Impossible to guess.

function generateRefreshToken(): string {

    const refreshToken = randomBytes(40).toString("hex");

    return refreshToken;
}


// ============================================================
// Function: hashRefreshToken
// Input:    the raw refresh token
// Returns:  its sha256 hex hash — the only form ever stored
// ============================================================

// Note 3: Hash the refresh token before storing it in Redis.
// We never store the raw token, so a leaked Redis dump cannot be reused to log in.

function hashRefreshToken(refreshToken: string): string {

    const hash = createHash("sha256").update(refreshToken).digest("hex");

    return hash;
}


// ============================================================
// Function: saveRefreshToken
// Input:    hashedToken, userId, familyId
// Returns:  nothing
// Effects:  SETEX "refresh:<hash>" for REFRESH_TOKEN_TTL_SECONDS
// ============================================================

// Note 4: Store the hashed refresh token in Redis under its own key.
// Key format: "refresh:<hash>"
// Value: JSON with the owner's id, the token family id, and a "used" flag.

async function saveRefreshToken(hashedToken: string, tokenUserId: string, tokenFamilyId: string) {

    // Step 1: The stored value carries who owns it and whether it is spent

    const value = JSON.stringify(
        {
            userId: tokenUserId,
            familyId: tokenFamilyId,
            used: false
        }
    );

    // Step 2: Write it with the refresh TTL so Redis cleans up on its own

    await redis.setex(`refresh:${hashedToken}`, REFRESH_TOKEN_TTL_SECONDS, value);
}


// ============================================================
// Function: issueTokenPair
// Input:    userId, userRole, familyId? (omit to start a new family)
// Returns:  { accessToken, refreshToken, familyId }
// Effects:  stores the hashed refresh token in Redis
// ============================================================

// Note 5: Issue a full token pair (access + refresh) for a user.
// If a familyId is passed in, the new refresh token joins that family (used during rotation).
// Otherwise a brand new family is created (used during register / login).

async function issueTokenPair(userId: string, userRole: string, familyId?: string) {

    // Step 1: Reuse the family on rotation, or start a new one

    const activeFamilyId = familyId || randomUUID();

    // Step 2: Build both tokens

    const generatedAccessToken = signAccessToken(userId, userRole);

    const generatedRefreshToken = generateRefreshToken();

    // Step 3: Store the hash and return the raw pair to the caller

    const hashedToken = hashRefreshToken(generatedRefreshToken);

    await saveRefreshToken(hashedToken, userId, activeFamilyId);

    return {
        accessToken: generatedAccessToken,
        refreshToken: generatedRefreshToken,
        familyId: activeFamilyId
    };
}


// The result of trying to rotate a refresh token.
// One flat shape: every field is always present, so the controller can just read
// rotationResult.success and rotationResult.failureReason with no guesswork.

type RefreshRotationResult = {
    success: boolean;
    userId: string | null;
    familyId: string | null;
    failureReason: string | null;
};


// ============================================================
// Helper:   buildRefreshFailure
// Input:    the reason string
// Returns:  a RefreshRotationResult with success: false
// ============================================================

// Note: Small helper that builds a "failed" rotation result, so we don't rewrite the same
// four fields every time a refresh is rejected.

function buildRefreshFailure(reason: string): RefreshRotationResult {

    const failureResult: RefreshRotationResult = {

        success: false,
        userId: null,
        familyId: null,
        failureReason: reason
    };

    return failureResult;
}


// ============================================================
// Function: isRefreshFamilyRevoked
// Input:    familyId
// Returns:  true when this family was revoked earlier
// Effects:  Redis GET "refreshFamilyRevoked:<familyId>"
// ============================================================

// Note 6: Check whether an entire token family has already been revoked.
// Key format: "refreshFamilyRevoked:<familyId>"

async function isRefreshFamilyRevoked(familyId: string): Promise<boolean> {

    const revokedMarker = await redis.get(`refreshFamilyRevoked:${familyId}`);

    if (revokedMarker === null) {
        return false;
    }

    return true;
}


// ============================================================
// Function: revokeRefreshFamily
// Input:    familyId
// Returns:  nothing
// Effects:  SETEX "refreshFamilyRevoked:<familyId>" for REFRESH_TOKEN_TTL_SECONDS
// ============================================================

// Note 7: Revoke every token that belongs to a family.
// Called when theft is detected, so both the attacker AND the victim must log in again.

async function revokeRefreshFamily(familyId: string) {

    // Step 1: Drop a marker that rotateRefreshToken will refuse

    const revokedKey = `refreshFamilyRevoked:${familyId}`;

    const revokedValue = "1";

    await redis.setex(revokedKey, REFRESH_TOKEN_TTL_SECONDS, revokedValue);
}


// ============================================================
// Function: rotateRefreshToken
// Input:    the hashed refresh token
// Returns:  { success, userId, familyId, failureReason }
// Effects:  reads "refresh:<hash>", marks it used, may revoke the whole family
// ============================================================

// Note 8: Rotate a refresh token (the heart of theft identification).
//
//   a. Look the hashed token up in Redis.
//   b. Not found      -> INVALID (expired or never existed).
//   c. Family revoked -> INVALID (a previous theft already killed this family).
//   d. Already used   -> REUSED  (theft!) -> revoke the whole family.
//   e. Still unused   -> mark it used, keep its TTL, and report success so the
//                        controller can issue a fresh pair.

async function rotateRefreshToken(hashedToken: string): Promise<RefreshRotationResult> {

    const refreshKey = `refresh:${hashedToken}`;

    // Note a: Fetch the stored token data
    const storedValue = await redis.get(refreshKey);

    // Note b: Unknown token -> reject
    if (!storedValue) {

        return buildRefreshFailure("INVALID");
    }

    const tokenData = JSON.parse(storedValue);

    // Note c: Family already revoked -> reject
    const familyIsRevoked = await isRefreshFamilyRevoked(tokenData.familyId);

    if (familyIsRevoked) {

        return buildRefreshFailure("INVALID");
    }

    // Note d: This token was already spent once -> it has been replayed -> theft
    if (tokenData.used === true) {

        await revokeRefreshFamily(tokenData.familyId);

        return buildRefreshFailure("REUSED");
    }

    // Note e: Token is still valid and unused -> mark it as used, keeping its remaining TTL
    const remainingTtl = await redis.ttl(refreshKey);

    let safeTtl = remainingTtl;

    if (safeTtl <= 0) {

        safeTtl = REFRESH_TOKEN_TTL_SECONDS;
    }

    const usedTokenData = {
        userId: tokenData.userId,
        familyId: tokenData.familyId,
        used: true
    };

    await redis.setex(refreshKey, safeTtl, JSON.stringify(usedTokenData));


    const successResult: RefreshRotationResult = {

        success: true,
        userId: tokenData.userId,
        familyId: tokenData.familyId,
        failureReason: null
    };

    return successResult;
}


// ============================================================
// Function: revokeRefreshSession
// Input:    the raw refresh token (from the cookie)
// Returns:  nothing
// Effects:  DEL "refresh:<hash>" + revokes the whole family
// ============================================================

// Note 9: Fully end a session on logout.
// Deletes the current token AND revokes its family (kills any rotated siblings too).

async function revokeRefreshSession(refreshToken: string) {

    // Step 1: Turn the raw token back into the key we stored

    const hashedToken = hashRefreshToken(refreshToken);

    const refreshKey = `refresh:${hashedToken}`;

    const storedValue = await redis.get(refreshKey);

    // Note: Nothing to revoke if the token is already gone/expired
    if (!storedValue) {
        return;
    }

    // Step 2: Kill the family, then the token itself

    const tokenData = JSON.parse(storedValue);

    await revokeRefreshFamily(tokenData.familyId);

    await redis.del(refreshKey);
}


export {
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL_SECONDS,
    signAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    saveRefreshToken,
    issueTokenPair,
    isRefreshFamilyRevoked,
    revokeRefreshFamily,
    rotateRefreshToken,
    revokeRefreshSession
};
