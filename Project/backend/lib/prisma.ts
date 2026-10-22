// ============================================================
// Layer:      Library
// File:       prisma.ts
// Purpose:    The one Prisma client the whole backend shares.
// Exports:    prisma
// Used by:    every controller, server.ts
// ============================================================

// Prisma 7 needs a driver adapter: the connection string goes to the
// Postgres driver, and the client is built on top of it. One client per
// process means one connection pool — creating one per request would
// exhaust Postgres connections.

import { env } from "../src/config/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Step 1: Take the validated connection string from config/env.ts

const connectionString = `${env.DATABASE_URL}`;

// Step 2: Wrap it in the Postgres driver adapter

const adapter = new PrismaPg({ connectionString });

// Step 3: Build the single shared client

const prisma = new PrismaClient({ adapter });

export { prisma };
