// ============================================================
// Layer:      Middleware
// File:       error.middleware.ts
// Purpose:    Turn anything thrown in the pipeline into one JSON error body.
// Exports:    errorMiddleware
// Used by:    app.ts (mounted last, after the 404 catch-all)
// ============================================================

import { Request, Response, NextFunction } from "express";
import { ErrorMessage } from "../utils/messages.headlines";
import { sendError } from "../utils/response";


// ============================================================
// Error handler: errorMiddleware
// Trigger:    Any next(error) call, or a thrown/rejected handler.
// Reads:      err.resCode, err.resMessage, err.message, err.stack
// Returns:    { success: false, resMessage, resError } with err.resCode
//             (500 when the error carries no resCode/resMessage)
// ============================================================

// Data coming from the outside functions for custom messages (sending from outside the messages)
/*
    err.resCode => sends the status Code

    err.resMessage => sends the error headline(e.g: ErrorMessage.INTERNAL_SERVER_ERROR)

    err.message => sends the custom actual error details (this .message is internal property)

    err.stack => sends the error stack trace (for debugging purposes)
*/

function errorMiddleware(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) {

    // Step 1: Default to a generic 500

    let errResCode: number = 500;

    let errResMessage: string | null = null;

    let errResError: string | null = null;


    // Step 2: check if the error is a custom error (coming from the outside functions)

    if (err.resCode && err.resMessage) {

        errResCode = err.resCode;

        errResMessage = err.resMessage;

        // Step 2a: Only expose the message when the thrower supplied one

        if (err.message) {

            errResError = err.message;
        }
        else {
            errResError = null;
        }
    }
    else {

        // Step 3: Unexpected error -> never leak internals to the client

        errResCode = 500;

        errResMessage = ErrorMessage.INTERNAL_SERVER_ERROR;

        errResError = null;
    }


    // Step 4: printing the error stack trace (for debugging purposes)

    if (err.stack) {
        console.error(err.stack);
    }
    else {
        console.error(err);
    }

    // Step 5: Send the single error body every client already expects

    return sendError({
        res,
        resCode: errResCode,
        resMessage: errResMessage,
        resError: errResError
    });
}

export { errorMiddleware };
