// ============================================================
// Layer:      Entry
// File:       app.ts
// Purpose:    Builds the Express app: security, parsing, routes, errors.
// Exports:    app
// Used by:    server.ts
// ============================================================

// Everything below runs top to bottom, in this order, on every request:
//   helmet -> cors -> json -> cookieParser -> route -> 404 -> errorMiddleware
// So the position of each app.use() is the order it executes in. Mount a
// router above helmet and it runs before the security headers are set.
//
// Nothing here starts a server — server.ts does that. This file only builds
// and exports the app, which is what makes it testable on its own.

import express, { Request, Response } from 'express';
import { sendError, sendSuccess } from './utils/response';
import { ErrorMessage, SuccessMessage } from './utils/messages.headlines';
import { errorMiddleware } from './middlewares/error.middleware';
import { authRouter } from './routes/auth.routes';
import { projectRouter } from './routes/project.routes';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { REQUEST_BODY_LIMIT } from './config/limits';
import { applicationRouter } from './routes/application.routes';
import { userRouter } from './routes/user.routes';
import { searchRouter } from './routes/search.routes';
import { adminRouter } from './routes/admin.routes';
import { metaRouter } from './routes/meta.routes';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();

// Step 1: Security headers on every response
// CSP stays on, but "upgrade-insecure-requests" is removed: this app is served
// over plain http in development, and that directive would rewrite our own
// asset URLs to https, where nothing is listening.

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "upgrade-insecure-requests": null
        }
    }
}));

// Step 2: CORS — only the frontend origin may call this API, cookies allowed

app.use(
    cors(
        {
            origin: env.FRONTEND_ORIGIN,
            credentials: true
        }
    ));

// Step 3: Parse JSON bodies (sized in config/limits.ts, above the max description length)

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));


// Step 4: Parse cookies (the refresh token travels in one)

app.use(cookieParser());


// Step 5: Liveness check — proves the process is up, no DB or Redis touched

app.get("/health", (req: Request, res: Response) => {

    return sendSuccess(
        {
            res,
            resCode: 200,
            resMessage: SuccessMessage.API_HEALTHY,
            resData: null
        }
    );
});

// Step 6: Serve the frontend from this same server
// http://localhost:5000 now opens the app itself: no second server, no CORS,
// no FRONTEND_ORIGIN to keep in sync. express.static answers "/" with
// index.html and every page/asset by its real path.

const frontendDir = fileURLToPath(new URL("../../frontend", import.meta.url));

app.use(express.static(frontendDir, {
    // A long cache in production; zero in development, where a stale file
    // would look like a broken build.
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    etag: true
}));

// Step 7: Mount the routers — each file owns its own URLs and guards

app.use("/api/auth", authRouter);

app.use("/api/projects", projectRouter);

app.use("/api/applications", applicationRouter);

app.use("/api/users", userRouter);

app.use("/api/search", searchRouter);

app.use("/api/admin", adminRouter);

// Public vocabulary for the frontend's filter UI
app.use("/api/meta", metaRouter);

// Step 8: Nothing matched.
// API callers get a JSON 404. A browser navigating to a bad URL gets the app
// shell back, so a typo in the address bar shows a page instead of raw JSON.
// A missing asset (/assets/x.css) must NOT get HTML back, hence the extension check.

app.use((req: Request, res: Response) => {

    const looksLikeFile = /\.[a-z0-9]+$/i.test(req.path);
    const wantsHtml = req.accepts("html") && !req.path.startsWith("/api") && !looksLikeFile;

    if (wantsHtml) {
        return res.status(404).sendFile(path.join(frontendDir, "index.html"));
    }

    return sendError({
        res,
        resCode: 404,
        resMessage: ErrorMessage.ROUTE_NOT_FOUND,
        resError: `The requested URL ${req.originalUrl} was not found`
    });
});

// Step 9: Anything thrown upstream lands here — must stay last

app.use(errorMiddleware);

export { app };
