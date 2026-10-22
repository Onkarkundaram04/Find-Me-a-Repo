// ============================================================
// Layer:      Utils
// File:       messages.headlines.ts
// Purpose:    Every error and success headline in one place.
// Exports:    ErrorMessage, SuccessMessage
// Used by:    every controller and middleware (the resMessage field)
// ============================================================

// resMessage is always one of these, never an inline string — so the
// same wording shows up on every endpoint that hits the same case.


// ----------------- ERROR MESSAGES -----------------
enum ErrorMessage {
    BAD_REQUEST = "Bad Request",
    VALIDATION_ERROR = "Validation Error",
    AUTHENTICATION_ERROR = "Authentication Error",
    FORBIDDEN_ERROR = "Forbidden Error",
    RESOURCE_NOT_FOUND = "Resource Not Found",
    ROUTE_NOT_FOUND = "Route Not Found",
    CONFLICT_ERROR = "Conflict Error",
    RATE_LIMIT_EXCEEDED = "Rate Limit Exceeded",
    DATABASE_ERROR = "Database Error",
    INTERNAL_SERVER_ERROR = "Internal Server Error"
}

// ----------------- SUCCESS MESSAGES -----------------
enum SuccessMessage {
    // System
    API_HEALTHY = "Project API is healthy & running",

    // User Operations
    USER_REGISTERED = "User registered successfully",
    USER_LOGGED_IN = "Login successful",
    USER_PROFILE_FETCHED = "User profile retrieved successfully",
    USER_PROFILE_UPDATED = "User profile updated successfully",
    USER_DELETED = "User account deleted successfully",
    USER_LOGGED_OUT = "Logout successful",
    USERS_FETCHED = "Users retrieved successfully",
    USER_STATUS_UPDATED = "User status updated successfully",
    USER_ROLE_UPDATED = "User role updated successfully",
    USER_DEACTIVATED = "User account deactivated successfully",
    PLATFORM_STATS_FETCHED = "Platform statistics retrieved successfully",


    // Project Operations
    PROJECT_CREATED = "Project created successfully",
    PROJECT_UPDATED = "Project updated successfully",
    PROJECT_DELETED = "Project deleted successfully",
    PROJECTS_FETCHED = "Projects retrieved successfully",
    PROJECT_DETAILS_FETCHED = "Project details retrieved successfully",
    META_FETCHED = "Metadata retrieved successfully",

    // Application Operations
    APPLICATION_SUBMITTED = "Application submitted successfully",
    APPLICATIONS_FETCHED = "Applications retrieved successfully",
    APPLICATION_STATUS_UPDATED = "Application status updated successfully",
    APPLICATION_WITHDRAWN = "Application withdrawn successfully",

    // Auth Operations
    TOKEN_REFRESHED = "Access token refreshed successfully"
}

export { ErrorMessage, SuccessMessage };
