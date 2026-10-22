// ============================================================
// Layer:      Script
// File:       prisma/seed.ts
// Purpose:    Creates real database rows to test the app with: 8 accounts,
//             20 projects owned by them, and ~40 applications between them.
//
//             Nothing here is mocked. Every record is a normal row in the same
//             tables a real signup writes to, linked by the same foreign keys,
//             so the API cannot tell a seeded user from a registered one.
//
// Run:        npx tsx prisma/seed.ts
// Start clean: npx tsx prisma/seed.ts --reset
//
// Every seeded account ends in @findmearepo.local. --reset deletes exactly
// those users, and onDelete: Cascade takes their projects and applications
// with them. Your own account never matches that pattern, so it is never
// touched.
// ============================================================

import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { BCRYPT_SALT_ROUNDS } from "../src/config/limits";
import { ApplicationStatus, ProjectStatus } from "../generated/prisma/enums";

// The one password every seeded account shares.
const PASSWORD = "Password@123";

// Every seeded account lives on this domain — that is what --reset matches.
const DOMAIN = "@findmearepo.local";

// Domains this project used before it was renamed. --reset clears these too,
// so an old set of demo accounts cannot survive the rename as duplicates.
const LEGACY_DOMAINS = ["@devboard.local"];


// ---- 1. The eight accounts ----

const USERS = [
    ["Priya Nair", "priya"],
    ["Marcos Silva", "marcos"],
    ["Yuki Tanaka", "yuki"],
    ["Lena Fischer", "lena"],
    ["Tunde Okafor", "tunde"],
    ["Sofia Ramos", "sofia"],
    ["Daniel Kim", "daniel"],
    ["Aisha Rahman", "aisha"]
] as const;


// ---- 2. Twenty projects ----
// owner: 0 = your own account, 1..8 = the accounts above (in order).
// age:   how many days ago it was posted, so the board has a real timeline.
// Tags are lowercase because that is how the app stores and filters them.

type SeedProject = {
    owner: number;
    age: number;
    title: string;
    description: string;
    githubUrl: string;
    techStack: string[];
    status: "OPEN" | "CLOSED";
};

const PROJECTS: SeedProject[] = [
    { owner: 1, age: 3, title: "Supabase Auth Visualizer", description: "Replays a Supabase auth flow step by step: sign-up, email confirmation, session refresh and JWT decoding on one screen. Each step shows the request, the response and the token state, so you can see exactly where a flow breaks.", githubUrl: "https://github.com/priyanair/supabase-auth-visualizer", techStack: ["react", "typescript", "supabase", "postgres"], status: "OPEN" },
    { owner: 2, age: 8, title: "Rust Log Tailer for Containers", description: "A single-binary CLI that tails logs across Docker containers and multiplexes them into one filtered stream. Handles reconnects, follows renamed containers and keeps CPU under 2% on a 40-container host.", githubUrl: "https://github.com/marcossilva/rust-log-tailer", techStack: ["rust", "docker", "cli"], status: "OPEN" },
    { owner: 0, age: 12, title: "Design Token Sync", description: "Keeps CSS custom properties, Figma variables and a Tailwind config in sync from one tokens.json. Changing a brand colour becomes a one-line diff instead of a hunt through five files.", githubUrl: "https://github.com/findmearepo/design-token-sync", techStack: ["typescript", "node", "figma-api"], status: "OPEN" },
    { owner: 3, age: 15, title: "Kafka Event Playground", description: "A browser UI for producing and consuming Kafka events without writing a producer. Define a topic, a schema and a payload, then watch consumer lag update live. Built for teaching juniors how event flow actually works.", githubUrl: "https://github.com/yukitanaka/kafka-playground", techStack: ["go", "kafka", "docker", "react"], status: "OPEN" },
    { owner: 1, age: 21, title: "Svelte Analytics Dashboard", description: "Self-hosted, cookie-free analytics with a sub-1KB tracking snippet. Charts are drawn with plain SVG instead of a chart library to keep the bundle small.", githubUrl: "https://github.com/priyanair/svelte-analytics", techStack: ["svelte", "typescript", "d3", "postgres"], status: "OPEN" },
    { owner: 0, age: 26, title: "Prisma Schema Linter", description: "Catches the schema mistakes that only hurt later: missing indexes on foreign keys, string columns that should be enums, relations without cascade rules. Runs as a CLI and a pre-commit hook, one rule per file.", githubUrl: "https://github.com/findmearepo/prisma-schema-linter", techStack: ["node", "typescript", "prisma"], status: "OPEN" },
    { owner: 2, age: 33, title: "Postgres Query Profiler", description: "Wraps pg_stat_statements in a readable UI: slowest queries, call counts and worst-case plans grouped by fingerprint. Answers 'what got slower since last week' in one screen.", githubUrl: "https://github.com/marcossilva/pg-profiler", techStack: ["go", "postgres", "react", "grafana"], status: "OPEN" },
    { owner: 4, age: 38, title: "React Native Offline Sync", description: "A drop-in sync layer for apps that must work on a train: local SQLite writes, conflict-free merges and a queue that survives restarts. Last-write-wins per field today, CRDTs eventually.", githubUrl: "https://github.com/lenafischer/rn-offline-sync", techStack: ["react-native", "typescript", "sqlite"], status: "OPEN" },
    { owner: 1, age: 44, title: "CI Cache Orchestrator", description: "Shares build caches between CI runners instead of rebuilding dependencies on every job. Hashes lockfiles, uploads to object storage and restores by hash. Took our pipeline from 11 minutes to 4.", githubUrl: "https://github.com/priyanair/ci-cache", techStack: ["python", "fastapi", "redis"], status: "OPEN" },
    { owner: 0, age: 51, title: "Edge Screenshot API", description: "Renders a URL to a PNG at the edge and caches it by content hash, so repeated requests never hit a browser. Handles dark mode, custom viewports and full-page capture.", githubUrl: "https://github.com/findmearepo/edge-screenshot", techStack: ["typescript", "cloudflare-workers", "playwright"], status: "OPEN" },
    { owner: 2, age: 58, title: "Terraform Diff Viewer", description: "A human-readable diff of a terraform plan instead of 900 lines of coloured JSON: what is added, what is destroyed, and which resources are being replaced — the expensive case.", githubUrl: "https://github.com/marcossilva/tf-diff-viewer", techStack: ["python", "flask", "terraform"], status: "OPEN" },
    { owner: 3, age: 63, title: "Redis Pub/Sub Debugger", description: "A desktop app that subscribes to Redis channels and shows message flow as a live timeline, with payload inspection and replay. Useful when six services publish to the same channel and nobody knows which one is spamming.", githubUrl: "https://github.com/yukitanaka/redis-pubsub-debugger", techStack: ["rust", "tauri", "redis", "typescript"], status: "OPEN" },
    { owner: 5, age: 70, title: "WASM Image Pipeline", description: "Resize, crop and convert images in the browser with no upload and no server cost. Rust compiled to WebAssembly, with a worker pool so the main thread stays responsive. Handles HEIC input.", githubUrl: "https://github.com/tundeokafor/wasm-image-pipeline", techStack: ["rust", "wasm", "typescript"], status: "OPEN" },
    { owner: 6, age: 79, title: "GraphQL Cost Analyser", description: "Scores every query in a schema by how expensive it is to resolve, then fails CI when a new field blows up the budget. Lets you sleep at night after someone adds a nested list to a public API.", githubUrl: "https://github.com/sofiaramos/graphql-cost", techStack: ["graphql", "node", "typescript"], status: "OPEN" },
    { owner: 7, age: 88, title: "Nomad Job Dashboard", description: "A read-only view over the Nomad API: allocations, restarts and resource pressure per job, refreshed without a page reload. Written because the CLI output is unreadable on a phone.", githubUrl: "https://github.com/danielkim/nomad-dashboard", techStack: ["go", "nomad", "kubernetes"], status: "OPEN" },
    { owner: 4, age: 96, title: "Postgres Migration Linter", description: "Flags migrations that will lock a table in production: adding a column with a default, changing a type, building an index without CONCURRENTLY. Runs on the file before it ever reaches a database.", githubUrl: "https://github.com/lenafischer/pg-migration-linter", techStack: ["python", "postgres", "cli"], status: "OPEN" },
    { owner: 8, age: 104, title: "Rust GraphQL Server Starter", description: "An opinionated template for a GraphQL server in Rust with async-graphql and SQLx: connection pooling, request tracing and a working CI pipeline already wired up.", githubUrl: "https://github.com/aisharahman/rust-graphql-starter", techStack: ["rust", "graphql", "postgres"], status: "OPEN" },
    { owner: 0, age: 131, title: "OpenAPI Mock Server", description: "Serves realistic mocked responses from an OpenAPI file, with per-endpoint latency and error-rate controls so you can test failure states on purpose. Archived: superseded by a rewrite that never shipped.", githubUrl: "https://github.com/findmearepo/openapi-mock", techStack: ["node", "express", "openapi"], status: "CLOSED" },
    { owner: 2, age: 152, title: "Kubernetes Cost Radar", description: "Attributes cluster spend to namespaces and workloads, then flags idle replicas, oversized requests and deployments that have not served traffic in a month. Closed while we wait for billing API access.", githubUrl: "https://github.com/marcossilva/k8s-cost-radar", techStack: ["go", "kubernetes", "prometheus"], status: "CLOSED" },
    { owner: 6, age: 178, title: "Tauri Desktop Chat", description: "A minimal desktop chat client in Tauri that speaks to a WebSocket backend. Shipped as a learning project and archived once the server was rewritten around a different protocol.", githubUrl: "https://github.com/sofiaramos/tauri-chat", techStack: ["rust", "tauri", "svelte"], status: "CLOSED" }
];


// ---- 3. Application notes ----
// Picked by index, so the same run always produces the same dataset.

const NOTES = [
    "I have worked on something very similar and can start this week. Happy to take the parts nobody else wants.",
    "Your approach to the data layer caught my attention. I have run this kind of service in production and can help with the harder edge cases.",
    "Mostly interested in the frontend, but I am comfortable enough with the backend to not be a burden there.",
    "I am learning this stack and would rather contribute to a real project than another tutorial. Ready to start small.",
    "I maintain a library in the same ecosystem and know the test setup well. Would like to pair on the core work.",
    "The edge cases are the part I would enjoy fixing. I have opinions about idempotency and I can defend them."
];


// ---- Small helpers ----

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const daysAgo = (days: number) => new Date(NOW - days * DAY);

const pick = <T,>(list: readonly T[], index: number): T => list[index % list.length];

const demoEmails = USERS.map(([, handle]) => `${handle}${DOMAIN}`);


// ---- Seed steps ----

async function resetSeededAccounts() {
    const removed = await prisma.user.deleteMany({
        where: {
            OR: [DOMAIN, ...LEGACY_DOMAINS].map((domain) => ({
                email: { endsWith: domain }
            }))
        }
    });

    if (removed.count > 0) {
        console.log(`Removed ${removed.count} seeded account(s) and everything they owned`);
    }
}

async function ensureUsers() {
    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const users = [];

    for (let index = 0; index < USERS.length; index += 1) {
        const [name, handle] = USERS[index];
        const email = `${handle}${DOMAIN}`;

        const existing = await prisma.user.findUnique({ where: { email } });

        if (existing) {
            users.push(existing);
            continue;
        }

        users.push(
            await prisma.user.create({
                data: {
                    name: name,
                    email: email,
                    password: passwordHash,
                    role: "USER",
                    status: "ACTIVE",
                    // Staggered joins, so "member since" is not all today
                    createdAt: daysAgo(200 + index * 23)
                }
            })
        );
    }

    return users;
}

// Owner index 0 is the account that was already here, so the dashboard you log
// into has projects and applications of its own to show.
async function findYou() {
    return prisma.user.findFirst({
        where: { email: { notIn: demoEmails } },
        orderBy: { createdAt: "asc" }
    });
}

async function ensureProjects(owners: { id: string }[]) {
    const projects = [];

    for (const definition of PROJECTS) {
        const owner = owners[definition.owner] || owners[0];

        const existing = await prisma.project.findFirst({
            where: { title: definition.title, ownerId: owner.id }
        });

        if (existing) {
            projects.push(existing);
            continue;
        }

        projects.push(
            await prisma.project.create({
                data: {
                    title: definition.title,
                    description: definition.description,
                    githubUrl: definition.githubUrl,
                    techStack: definition.techStack,
                    status: definition.status as ProjectStatus,
                    ownerId: owner.id,
                    createdAt: daysAgo(definition.age)
                }
            })
        );
    }

    return projects;
}

// Two applications per open project, one per closed one, from accounts that do
// not own it. Statuses are mixed so Accept/Reject has something to act on.
async function ensureApplications(projects: { id: string; ownerId: string; createdAt: Date; status: string }[], users: { id: string }[], you: { id: string } | null) {
    const candidates = [...users, ...(you ? [you] : [])];
    let saved = 0;

    for (let index = 0; index < projects.length; index += 1) {
        const project = projects[index];
        const wanted = project.status === "CLOSED" ? 1 : 2;

        for (let offset = 0; offset < wanted; offset += 1) {
            const applicant = candidates[(index * 3 + offset) % candidates.length];

            if (!applicant || applicant.id === project.ownerId) continue;

            const position = index + offset;

            const status = position % 7 === 0
                ? "ACCEPTED"
                : position % 5 === 0
                    ? "REJECTED"
                    : "PENDING";

            await prisma.application.upsert({
                where: {
                    userId_projectId: { userId: applicant.id, projectId: project.id }
                },
                update: {},
                create: {
                    userId: applicant.id,
                    projectId: project.id,
                    note: pick(NOTES, position),
                    githubProfile: `https://github.com/user-${applicant.id.slice(0, 6)}`,
                    status: status as ApplicationStatus,
                    createdAt: new Date(project.createdAt.getTime() + (offset + 1) * 2 * DAY)
                }
            });

            saved += 1;
        }
    }

    return saved;
}


// ---- Run ----

async function main() {
    if (process.argv.includes("--reset")) {
        await resetSeededAccounts();
    }

    const users = await ensureUsers();
    const you = await findYou();
    const owners = you ? [you, ...users] : [...users];

    console.log(`\nAccounts seeded: ${users.length}${you ? ` (+ your own account, ${you.email})` : ""}`);

    const projects = await ensureProjects(owners);
    const applications = await ensureApplications(projects, users, you);

    const open = projects.filter((project) => project.status === ProjectStatus.OPEN).length;
    const closed = projects.length - open;

    console.log(`Projects: ${projects.length} (${open} open, ${closed} closed)`);
    console.log(`Applications: ${applications}`);

    console.log(`\nLog in as any of them — password for all: ${PASSWORD}`);
    for (const [name, handle] of USERS) {
        console.log(`  ${handle}${DOMAIN}  ${name}`);
    }
    console.log("");
}

main()
    .catch((error) => {
        console.error("\nSeed failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
