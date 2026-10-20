# API guide — reading and testing the API

This guide is for everyone who builds or uses the API: backend developers, frontend developers and testers.
No prior knowledge of the project is needed.

## 1. Start the API on your machine

```bash
npm run db:up        # starts the local database (Docker Desktop must be running)
npm run start:dev    # starts the API on http://localhost:3001
```

If this is your first time, follow the Quick start in the [README](../README.md) first.

## 2. Two tools — when to use which

| Tool           | Use it for                                                                            | Install                                              |
| -------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Swagger UI** | Reading what each endpoint does and trying it once                                    | Nothing — open http://localhost:3001/api/docs        |
| **Bruno**      | Saved requests you run again and again; testing a whole flow; switching roles quickly | Free desktop app: https://www.usebruno.com/downloads |

**Why Bruno and not Postman?** Bruno stores the requests as plain files inside this repository (`bruno/`), so the
whole team shares the same requests through git, and nothing (URLs, ids, test data) is uploaded to a cloud
account. Postman syncs collections to its cloud by default, which we avoid for an HR system.

## 3. Swagger UI — read and try

Open **http://localhost:3001/api/docs**.

Every endpoint shows:

- **Summary and description** — what it does and **who is allowed** to call it
- **Request body** — every field with an example; required fields are marked
- **Responses** — the success shape, and every error it can return with what the error means

### Sign in (needed for most endpoints)

1. Open **Auth → POST /api/auth/dev/login** → **Try it out**.
2. Body: `{ "employeeCode": "GS-120" }` → **Execute**. You should get **204**.
3. Now every other **Try it out** in this browser tab is signed in as that person.

| Code   | Role         | Good for testing                                       |
| ------ | ------------ | ------------------------------------------------------ |
| GS-120 | Super Admin  | everything                                             |
| GS-119 | HR           | HR screens; cannot delete in Administration            |
| GS-101 | Office Admin | admin screens without delete                           |
| GS-058 | Team Lead    | own team only                                          |
| GS-087 | Employee     | own data only — use it to check that access is refused |

To switch role, run the sign-in again with another code.

## 4. Bruno — saved requests for the team

1. Install the Bruno app and open it.
2. **Open Collection** → choose the `bruno/` folder of this repository.
3. Top right: choose the environment **Local**.
4. Run **Auth → Sign in as persona**. The role comes from the `persona` variable in the environment
   (environment settings → change `GS-120` to another code to switch role).
5. Run any request. To run everything in order: right-click the collection → **Run**.

Each request has a **Docs** tab (who can call it, what to send) and **Tests** (green = the response is as expected).

### Command line (optional)

```bash
cd bruno && npx @usebruno/cli run --env Local
```

## 5. Reading responses

**Success:** the status code tells you what happened.

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 200  | OK — data returned                   |
| 201  | Created — the new record is returned |
| 204  | Done — nothing to return             |

**Errors** always look the same:

```json
{ "statusCode": 403, "code": "auth.forbidden", "message": "You do not have access to this", "requestId": "12" }
```

| Code                     | Usual reason                                                         | What to do                                        |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------- |
| 400 `request.invalid`    | A field is missing or wrong; `details.fields` lists them             | Fix the body                                      |
| 400 other code           | A business rule failed, e.g. `company.unknown_location`              | Read `message`                                    |
| 401                      | Not signed in, or the session expired (30 min idle)                  | Sign in again                                     |
| 403 `auth.forbidden`     | This role may not do this                                            | Expected for some roles — try another persona     |
| 403 `request.bad_origin` | A write request without the right `Origin` header                    | Send `Origin: http://localhost:3000` (Bruno does) |
| 404                      | Not found — or you may not see it                                    | Check the id and the role                         |
| 409                      | Duplicate value or the record is in a state that does not allow this | Read `message`                                    |
| 429                      | Too many requests                                                    | Wait a minute                                     |
| 500                      | Bug                                                                  | Send the `requestId` to the backend team          |

## 6. When you add an endpoint (developers)

Every endpoint must have, before the PR is merged:

1. **Swagger docs** — `@ApiOperation({ summary, description })` (say who may call it), the success response
   (`@ApiOkResponse` / `@ApiCreatedResponse` / `@ApiNoContentResponse` with `type`), and `@ApiErrors(...)` with
   every error status it can return. DTO fields need `@ApiProperty({ example })`. CI fails if any is missing
   (`test/docs/api-docs.e2e-spec.ts`).
2. **A Bruno request** in `bruno/<module>/` with `Origin` header for writes, a Docs tab and at least one test.
3. **The contract** — run `npm run openapi:export` and commit `docs/api/openapi.json`.
4. **The flow** — if the endpoint changes a business flow, update `flow/src/<module>.html` and run `npm run flow:pdf`.

The `new-endpoint` Claude skill does all four.
