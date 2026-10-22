// ============================================================
// Layer:      Utils
// File:       pagination.ts
// Purpose:    One place for the page/limit rules.
// Exports:    buildPagination
// Used by:    every paginated controller
// ============================================================

// Note: Shared pagination rules. Change the defaults or the max here,
// and every endpoint that uses this helper follows.

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;


// ============================================================
// Function: buildPagination
// Input:    req.query.page, req.query.limit (both might be undefined)
// Returns:  { page, limit, skip }  — or { error } when the input is junk
// ============================================================

function buildPagination(rawPage: unknown, rawLimit: unknown) {

    let page = DEFAULT_PAGE;

    let limit = DEFAULT_LIMIT;

    // Step 1: Page (if given). Garbage or arrays become NaN and fail here.

    if (rawPage !== undefined) {

        page = Number(rawPage);

        if (Number.isInteger(page) === false || page < 1) {

            return {
                error: "Page must be a whole number of 1 or more",
                page: DEFAULT_PAGE,
                limit: DEFAULT_LIMIT,
                skip: 0
            };
        }
    }

    // Step 2: Limit (if given). Same NaN trick.

    if (rawLimit !== undefined) {

        limit = Number(rawLimit);

        if (Number.isInteger(limit) === false || limit < 1 || limit > MAX_LIMIT) {

            return {
                error: "Limit must be a whole number no greater than " + MAX_LIMIT,
                page: DEFAULT_PAGE,
                limit: DEFAULT_LIMIT,
                skip: 0
            };
        }
    }

    // Step 3: How many rows to skip

    const skip = (page - 1) * limit;

    return {
        error: null,
        page: page,
        limit: limit,
        skip: skip
    };

}

export { buildPagination };
