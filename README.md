<div align="center">
  <img src="Assets/coding_cat_white_bg_rounded.png" width="84" alt="" />
  <h1>Find Me a Repo</h1>
  <p><strong>Post the repository you are building. Meet the people who want to work on it.</strong></p>
  <p>
    <code>TypeScript</code> <code>Express 5</code> <code>Prisma 7</code>
    <code>PostgreSQL</code> <code>Redis</code> <code>Vanilla JS</code>
  </p>
</div>

![Browse and filter projects](Assets/Explore-projects-page.png)

## What it does

Two sides of one board.

**You have a repository.** Post it with its stack and its GitHub link. Every applicant sends a note and their profile, so you accept a person you can trust — not a résumé.

**You want to contribute.** Filter the board by technology, search by title, developer name or project ID, and apply with a note about what you bring.

An admin keeps it honest: roles and account status, project state, platform stats.

## Screenshots

| | | |
|:--:|:--:|:--:|
| <img src="Assets/Project-info-page.png" width="300" alt="Project detail"><br><sub><b>Project detail</b><br>description, stack, owner</sub> | <img src="Assets/Create-project-page.png" width="300" alt="Create a project"><br><sub><b>Post a project</b><br>title, stack, repository</sub> | <img src="Assets/Applications-review-page.png" width="300" alt="Review applications"><br><sub><b>Review applications</b><br>accept, reject, undo</sub> |
| <img src="Assets/My-projects-dashboard.png" width="300" alt="My projects"><br><sub><b>Your projects</b><br>state, applicants, edit</sub> | <img src="Assets/My-applications-dashboard.png" width="300" alt="My applications"><br><sub><b>Your applications</b><br>status, repo, withdraw</sub> | <img src="Assets/Profile-page.png" width="300" alt="Profile"><br><sub><b>Profile</b><br>name, email, password</sub> |
| <img src="Assets/Admin-overview-page.png" width="300" alt="Admin overview"><br><sub><b>Admin overview</b><br>live platform numbers</sub> | <img src="Assets/Admin-users-page.png" width="300" alt="Admin users"><br><sub><b>Admin users</b><br>role, status, delete</sub> | <img src="Assets/Admin-projects-page.png" width="300" alt="Admin projects"><br><sub><b>Admin projects</b><br>open or close any project</sub> |

## Run it

Requires **Node 20+**, **PostgreSQL** and **Redis**.

**1. Environment** — create `Project/backend/.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/findmearepo"
JWT_SECRET="any-long-random-string"
```

**2. Install, migrate, start**

```bash
cd Project/backend
npm install
npx prisma migrate dev --name init
npm run dev
```

Open **http://localhost:5000** — the API serves the frontend, so that one URL is the whole app. No second dev server, no CORS.

**3. Optional demo data** — 8 accounts, 20 projects, ~40 applications, password `Password@123`:

```bash
npx tsx prisma/seed.ts --reset
```

## Layout

```
Project/
├── backend/          Express 5 + Prisma 7 API, also serves the frontend
│   ├── src/          routes → middlewares → controllers → database
│   ├── prisma/       schema and seed script
│   └── generated/    Prisma client (generated, never edited)
└── frontend/         plain HTML, CSS and ES modules — no build step
    └── assets/
        ├── css/      tokens → base → components → pages
        └── js/       core (no DOM) → ui (DOM, no fetch) → pages
```

Every file opens with a header saying what it does and who uses it.

---

<details>
<summary><b>API reference</b></summary>

All routes are prefixed with `/api`. Every response is
`{ success, resMessage, resData }` or `{ success, resMessage, resError }`.

**Auth**

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Create an account |
| POST | `/auth/login` | public | Get an access token |
| POST | `/auth/refresh` | cookie | Rotate the refresh token |
| POST | `/auth/logout` | token | Revoke the session |
| GET | `/auth/me` | token | Current user |

**Projects**

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/projects/all-projects` | public | List projects |
| GET | `/projects/project-details/:id` | public | One project + application count |
| POST | `/projects/create-project` | token | Create a project |
| GET | `/projects/my-projects` | token | Projects you own |
| GET | `/projects/project-applications/:id` | owner | Applications for your project |
| PATCH | `/projects/update-project/:id` | owner / admin | Update fields or status |
| DELETE | `/projects/delete-project/:id` | owner / admin | Delete (applications cascade) |

**Applications**

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/applications/apply` | token | Apply to an open project |
| GET | `/applications/my-applications` | token | Your applications |
| PATCH | `/applications/update-status/:id` | owner / admin | Accept, reject, or set pending |
| DELETE | `/applications/delete-application/:id` | applicant / admin | Withdraw |

**Users**

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/users/update-profile` | Change name or email |
| PATCH | `/users/update-password` | Change password (revokes the session) |
| PATCH | `/users/deactivate-account` | Soft-deactivate |
| DELETE | `/users/delete-account` | Hard delete |

**Search and metadata**

| Method | Path | Purpose |
|---|---|---|
| GET | `/search` | `?q=` searches title, developer name and id. Also `?techStack=`, `?status=`, `?page=`, `?limit=` |
| GET | `/meta` | The vocabularies every filter is built from |

`?techStack=` and `?status=` accept repeated parameters
(`?techStack=react&techStack=node`) and match **any** of them.

**Admin**

| Method | Path | Permission |
|---|---|---|
| GET | `/admin/all-users` | `MANAGE_USERS` |
| GET | `/admin/user-details/:id` | `MANAGE_USERS` |
| PATCH | `/admin/update-user-status/:id` | `MANAGE_USERS` |
| PATCH | `/admin/update-user-role/:id` | `MANAGE_USERS` |
| DELETE | `/admin/delete-user/:id` | `MANAGE_USERS` |
| DELETE | `/admin/delete-project/:id` | `MANAGE_PROJECTS` |
| GET | `/admin/platform-stats` | `MANAGE_SYSTEM` |

</details>

<details>
<summary><b>How authentication works</b></summary>

1. `POST /login` returns an **access token** (15 min, sent as `Authorization: Bearer`) and sets a **refresh token** in an httpOnly cookie (7 days, scoped to `/api/auth`).
2. `POST /refresh` rotates the cookie: the old token is marked used, a new one is issued in the same *family*. If an already-used token returns, the whole family is revoked — that is how a stolen refresh token is detected.
3. `POST /logout` blacklists the access token for its remaining lifetime and revokes the family.

Only a sha256 hash of the refresh token is stored in Redis.

</details>

<details>
<summary><b>Suspended users are hidden, not deleted</b></summary>

A `SUSPENDED` account loses its content everywhere it was public, and gets it back
the moment it is reactivated. No rows are touched.

| Surface | Behaviour |
|---|---|
| `GET /api/search` | Their projects leave the results **and** the total |
| `GET /api/projects` | Same filter on the public list |
| `GET /api/projects/project-details/:id` | **404**, so a direct link cannot reach it |
| `POST /api/applications` | Refuses to apply to a hidden project |
| `GET /api/meta` | Their tags are not counted |
| `GET /api/admin/*` | Admins still see everything — moderation needs the whole picture |

</details>

<details>
<summary><b>Design notes</b></summary>

- **Nothing is hardcoded in the frontend.** Statuses, roles and technologies all come from `GET /api/meta`, which reads the Prisma enums and the tags actually in use. Add an enum member and the filters update with no client change.
- **One palette, two themes.** `base/tokens.css` declares every colour twice — in `:root` and in `[data-theme="dark"]` — under the same names. No component knows which theme is active, and no literal colour exists outside that file.
- **`main.css` is imports only.** Native `@import` loads sequentially, which costs a few round trips on a deployed site. Kept deliberately: one file per concern. If this ships, concatenate once and link the output.
- **Rate limits:** 5 login/register attempts per IP per 15 minutes, 20 applications per user per 3 hours.
- **Caching:** the default project listing is cached for 60 seconds and cleared on every write.
- **No tests yet** — the next thing to add.

</details>

---

## About

A personal project of mine, built to be read.

> [!WARNING]
> **Not production-ready — and that is on purpose.** I am a fresher backend developer, and each project I build is how I learn the next thing. Expect rough edges, missing tests, and decisions a more experienced engineer would make differently. I am getting closer to industry standard with every build, not starting there.
>
> **A note for recruiters:** If you are reviewing my work and see potential, I would genuinely appreciate the opportunity to interview and prove what I can do on your team.

**Backend — written by me.** The data model, the auth flow, the permission system, the validation and the caching are my own work. That is the part worth reviewing.

**Frontend — built with AI assistance.** I designed the product, the flows and the data contract; the markup, CSS and DOM code were produced with AI tools. It is a working interface, not the part I am asking you to judge.

If you are reviewing the backend, start here:

| File | What it shows |
|---|---|
| [`prisma/schema.prisma`](Project/backend/prisma/schema.prisma) | The data model and every relation |
| [`src/middlewares/`](Project/backend/src/middlewares) | Auth, ownership, admin guard, rate limits |
| [`src/controllers/`](Project/backend/src/controllers) | The business rules, one file per resource |
| [`src/utils/`](Project/backend/src/utils) | Response shape, tokens, pagination, cache |

**No license.** There is no `LICENSE` file — all rights reserved. You are welcome to read it and learn from it; please ask before reusing it somewhere else.

