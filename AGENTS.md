<!-- Tool-neutral project memory. Never put local paths, costs or personal data here. -->
# Image Gallery

## Project goal

A single drop-in React component for a Next.js app: a masonry gallery with endless random scroll, tag search and a full-screen viewer, backed by a Supabase table of image links and tags.

## Stack

- Language / framework: JavaScript (JSX) client component for Next.js + Tailwind CSS; `framer-motion`, `lucide-react`, `next/image`
- Services: Supabase (`Gallery` table + `get_random_media` RPC with a required `p_seed` and a keyset cursor), reached directly from the browser through the supabase-js client the host passes in as the `supabase` prop; images hosted anywhere with a public URL
- Test: none (no package.json or test suite in this repo); verify by dropping `client.jsx` into a Next.js app as the README's Install section describes

## File layout

- `client.jsx` — the whole component (masonry grid, infinite loading, debounced tag search, viewer)

## Constraints

- The component stays a single self-contained file that a user can copy into their app; it imports only `react`, `framer-motion`, `next/image` and `lucide-react`. The host passes its supabase-js client in through the `supabase` prop; no `@/...` alias imports.
- No server code and no keys in this repo; the host app provides the Supabase client, env vars and `images.remotePatterns`.
- Path-type constraints are mirrored in `kit.toml [protected]`; keep the two in sync (one glob per line).

## Conventions

- Conventional commits. Keep the README's SQL (table + RPC) in sync with what `client.jsx` queries.
- GitHub Actions: top-level `permissions: contents: read`, raised per job only when needed.
- GitHub Actions: pin every `uses:` to a 40-character commit SHA with a trailing `# vX.Y.Z` comment.
- `README.md` (Traditional Chinese, default) and `README.en.md` (English) mirror each other; update both in the same commit, including the SQL.

## Where to look

- `README.md` — install steps, the props table, the table and RPC SQL
