# SpecVault

Simple hardware data lookup and maintenance application built with React and PocketBase.

## Run

1. Copy `.env.example` to `.env` and set the PocketBase superuser credentials.
2. `npm install && npm run setup:pocketbase && npm run dev`
3. Open PocketBase Admin at `http://127.0.0.1:8090/_/` to create user records; enable the `admin` toggle for catalog administrators.

For Docker: `docker compose up --build`. The web app is on port 3000 and PocketBase on 8090.

## PocketBase setup

`npm run setup:pocketbase` creates the full schema and API rules. It is safe to rerun: it preserves records while refreshing permission rules and adding the `admin` field when needed. The command reads `POCKETBASE_URL` (optional), `POCKETBASE_SUPERUSER_EMAIL`, and `POCKETBASE_SUPERUSER_PASSWORD`.

After the first admin account is enabled in PocketBase, sign in through the application. Administrators can create user accounts and promote or revoke administrator access from the **Users & access** panel.

## PocketBase collections

Create these collections (all viewable publicly):

| Collection | Fields |
| --- | --- |
| `users` (auth) | `name` (text), `admin` (boolean) |
| `manufacturers` | `name` (text, required) |
| `categories` | `name` (text, required), `manufacturer` (relation → manufacturers) |
| `series` | `name` (text, required), `manufacturer` (relation → manufacturers), `category` (relation → categories) |
| `products` | `model` (text, required), `summary` (text), `series` (relation → series), `sections` (relation → sections, multiple) |
| `sections` | `title` (text), `description` (text), `subsections` (relation → subsections, multiple) |
| `subsections` | `title` (text), `content` (JSON) |

Set list/view access rules to public. Set create/update/delete rules on products, sections and subsections to `@request.auth.id != ''`. For manufacturers, categories, series and products creation, use `@request.auth.admin = true`; keep the same admin rule for catalog update/delete.

`content` is an array of blocks, for example:

```json
[
  {"type":"pairs","value":[{"key":"Processor","value":"Intel Core i7"}]},
  {"type":"text","value":"Supports two NVMe SSDs."},
  {"type":"table","value":[["Port","Count"],["USB-C","2"]]},
  {"type":"image","value":"https://example.com/image.jpg"}
]
```
