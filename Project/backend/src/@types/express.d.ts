// ============================================================
// Layer:      Types
// File:       express.d.ts
// Purpose:    Teach TypeScript about the fields our middlewares attach
//             to the Express request (req.user, req.project).
// Exports:    nothing — it only augments existing Express types
// Used by:    every controller and middleware that reads req.user / req.project
// ============================================================

// A .d.ts file holds no runtime code. It exists so that req.user and
// req.project are known to TypeScript, instead of needing casts.

import { Project, Role } from "../../generated/prisma/client";

declare global {

    // ----------------- ENVIRONMENT VARIABLES -----------------

    // Note: The keys NodeJS.ProcessEnv already knows about.
    // PORT is listed because env.ts reads it for the listen() call.
    // DATABASE_URL and JWT_SECRET are commented out on purpose: they are
    // validated at runtime by config/env.ts, and typing them as string
    // would hide the "possibly undefined" case that check exists for.

    namespace NodeJS {
        interface ProcessEnv {
            // DATABASE_URL: string;
            // JWT_SECRET: string;
            PORT?: string;
        }
    }

    // ----------------- EXPRESS REQUEST -----------------

    // Note: These two fields are not part of Express by default — our
    // middlewares add them at runtime:
    //   - authMiddleware  -> req.user  = { id, role }
    //   - verifyOwner     -> req.project = the Prisma Project row
    // Both are optional (?) because a route without those middlewares
    // never receives them, and the controllers guard for that.

    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: Role;
            };
            project?: Project;
        }
    }
}

export { };
