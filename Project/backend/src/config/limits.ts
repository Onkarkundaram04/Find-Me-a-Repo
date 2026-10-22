// ============================================================
// Layer:      Config
// File:       limits.ts
// Purpose:    Every validation number in one place.
// Exports:    name / email / password / project / application limits,
//             BCRYPT_SALT_ROUNDS, REQUEST_BODY_LIMIT, rate-limit window
// Used by:    auth.controller.ts, user.controller.ts, project.controller.ts,
//             application.controller.ts, app.ts, rateLimiter middleware
// ============================================================

// Note: Shared limits for the whole backend. Change a number here once and every
// endpoint that validates that field follows automatically.

// ----------------- NAME -----------------

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 50;

// ----------------- EMAIL -----------------

const EMAIL_MIN_LENGTH = 3;
const EMAIL_MAX_LENGTH = 254;

// ----------------- PASSWORD -----------------

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

// Note: How expensive the password hash is (higher = slower to crack, slower to login)
const BCRYPT_SALT_ROUNDS = 10;

// ----------------- PROJECT -----------------

const PROJECT_TITLE_MIN_LENGTH = 1;
const PROJECT_TITLE_MAX_LENGTH = 500;

const PROJECT_DESCRIPTION_MIN_LENGTH = 1;
const PROJECT_DESCRIPTION_MAX_LENGTH = 10000;

const PROJECT_TECH_STACK_MAX_ITEMS = 20;

// Note: Must stay comfortably above PROJECT_DESCRIPTION_MAX_LENGTH,
// otherwise a max-length description dies with a 413 before validation.
const REQUEST_BODY_LIMIT = "100kb";

// ----------------- APPLICATION -----------------

const APPLICATION_NOTE_MIN_LENGTH = 1;
const APPLICATION_NOTE_MAX_LENGTH = 500;

// ----------------- AUTH RATE LIMITING -----------------

const LOGIN_MAX_ATTEMPTS = 25;
const LOGIN_WINDOW_SECONDS = 15 * 60;   // 15 minutes * 60 seconds = 900 seconds

export {
    NAME_MIN_LENGTH,
    NAME_MAX_LENGTH,
    EMAIL_MIN_LENGTH,
    EMAIL_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    BCRYPT_SALT_ROUNDS,
    PROJECT_TITLE_MIN_LENGTH,
    PROJECT_TITLE_MAX_LENGTH,
    PROJECT_DESCRIPTION_MIN_LENGTH,
    PROJECT_DESCRIPTION_MAX_LENGTH,
    PROJECT_TECH_STACK_MAX_ITEMS,
    REQUEST_BODY_LIMIT,
    APPLICATION_NOTE_MIN_LENGTH,
    APPLICATION_NOTE_MAX_LENGTH,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_SECONDS
};
