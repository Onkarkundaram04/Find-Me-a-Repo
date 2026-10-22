// ============================================================
// Layer:      Config
// File:       cookies.ts
// Purpose:    The one definition of the refresh cookie.
// Exports:    REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH,
//             REFRESH_COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS
// Used by:    auth.controller.ts, user.controller.ts
// ============================================================

import { CookieOptions } from "express";
import { REFRESH_TOKEN_TTL_SECONDS } from "../utils/authTokens";

// Note: The refresh token travels in an httpOnly cookie, so browser JavaScript can never read it.
const REFRESH_COOKIE_NAME = "refreshToken";

// Note: Only the auth routes need to receive this cookie.
const REFRESH_COOKIE_PATH = "/api/auth";

// Note: One shared options object, so register, login, refresh, logout, password change
// and account deactivation all set the cookie exactly the same way.
const REFRESH_COOKIE_OPTIONS: CookieOptions = {

    httpOnly: true,
    secure: false,      // set to true in production (HTTPS only)
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000 // 7 days
};

// Note: Same settings without maxAge, used when the cookie must be removed.
// Passing maxAge to clearCookie re-sends Max-Age, and the browser keeps the cookie.
const CLEAR_COOKIE_OPTIONS: CookieOptions = {

    httpOnly: true,
    secure: false,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH
};

export {
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
    REFRESH_COOKIE_OPTIONS,
    CLEAR_COOKIE_OPTIONS
};
