// ============================================================
// Layer:      Utils
// File:       response.ts
// Purpose:    The one JSON shape every endpoint answers with.
// Exports:    sendSuccess, sendError
// Used by:    every controller, app.ts, error.middleware.ts
// ============================================================

import { Response } from "express";

// What sendSuccess accepts
type SuccessResponse = {
    res: Response;
    resCode: number;
    resMessage?: string | null;
    resData?: unknown;
};

// What sendError accepts
type ErrorResponse = {
    res: Response;
    resCode: number;
    resMessage?: string | null;
    resError?: string | null;
};


// ============================================================
// Function: sendSuccess
// Input:    { res, resCode, resMessage?, resData? }
// Returns:  { success: true, resMessage, resData } sent with resCode
// ============================================================

function sendSuccess(
    {
        res,
        resCode,
        resMessage = null,
        resData = null

    }: SuccessResponse

) {

    // Step 1: Build the success body and send it with the status code

    return res.status(resCode).json(
        {
            success: true,
            resMessage,
            resData
        }
    );
}


// ============================================================
// Function: sendError
// Input:    { res, resCode, resMessage?, resError? }
// Returns:  { success: false, resMessage, resError } sent with resCode
// ============================================================

function sendError(
    {
        res,
        resCode,
        resMessage = null,
        resError = null

    }: ErrorResponse

) {

    // Step 1: Build the error body and send it with the status code

    return res.status(resCode).json({
        success: false,
        resMessage,
        resError
    });
}

export {
    sendSuccess,
    sendError
};
