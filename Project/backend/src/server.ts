// ============================================================
// Layer:      Entry
// File:       server.ts
// Purpose:    Start the API: connect to Postgres, listen, shut down cleanly.
// Exports:    nothing (this file is the process entry point)
// Run by:     npm run dev  (tsx watch src/server.ts)
// ============================================================

// Startup order:  env -> app -> prisma.$connect -> listen
// Shutdown order: SIGINT/SIGTERM -> close Prisma + Redis -> exit
//
// The app is only allowed to listen after the database answers, so the
// first request never meets a half-ready server.

// Step 1: Load and validate environment variables.
import { env } from "./config/env";

// Step 2: Load the Express app, the Prisma client and the Redis client.
import { app } from "./app";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

async function startServer() {
    try {

        // Step 3: Try connecting to PostgreSQL.
        await prisma.$connect();

        // Step 4: Start accepting requests after the connection succeeds.
        app.listen(env.PORT, () => {
            console.log(`Server is running at http://localhost:${env.PORT}`);
        });

    }
    catch (error) {

        // Step 5: Log the startup failure and stop the process.
        console.error("Failed to start the server", error);

        process.exit(1);
    }
}


// Step 6: Close the database and cache connections before the process exits.
// SIGINT  = Ctrl+C in the terminal.
// SIGTERM = a shutdown request from the OS or a hosting platform.

async function shutdown() {

    console.log("Shutting down: closing Prisma and Redis connections...");

    await prisma.$disconnect();

    redis.disconnect();

    process.exit(0);
}

process.on("SIGINT", shutdown);

process.on("SIGTERM", shutdown);


startServer();
