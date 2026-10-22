// ============================================================
// Layer:      Config
// File:       regex.ts
// Purpose:    Every pattern the backend validates against.
// Exports:    GITHUB_URL_REGEX, UUID_REGEX, GITHUB_PROFILE_REGEX,
//             PASSWORD_REGEX, EMAIL_REGEX
// Used by:    project.controller.ts, application.controller.ts,
//             auth.controller.ts, user.controller.ts, auth middleware, search
// ============================================================

// One pattern per rule, so a change here reaches every endpoint that
// validates that field. A regex is only weak if it is copied everywhere.

const GITHUB_URL_REGEX = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+$/;

// Note: Matches a standard UUID (Prisma uses uuid() for ids)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Note: Matches a GitHub *profile* URL (github.com/<username>) — one path segment
const GITHUB_PROFILE_REGEX = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9-]+\/?$/;

// Note: Password must contain at least one lowercase letter, one uppercase letter,
// one number, and one special character
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_\-+=\[\]{}|;:,.<>])/;

// Note: Email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export {
    GITHUB_URL_REGEX,
    UUID_REGEX,
    GITHUB_PROFILE_REGEX,
    PASSWORD_REGEX,
    EMAIL_REGEX
};
