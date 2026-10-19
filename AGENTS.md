<!-- Tool-neutral project memory. Never put local paths, costs or personal data here. -->
# Image Gallery

## Project goal

A single drop-in React component for a Next.js app: a masonry gallery with endless random scroll, tag search and a full-screen viewer, backed by a Supabase table of image links and tags.

## Stack

- Language / framework: JavaScript (JSX) client component for Next.js + Tailwind CSS; `framer-motion`, `lucide-react`, `next/image`
- Services: Supabase (`Gallery` table + `get_random_media` RPC), reached directly from the browser through the host app's `@/lib/supabaseClient`; images hosted anywhere with a public URL
- Test: none (no package.json or test suite in this repo); verify by dropping `client.jsx` into a Next.js app as the README's Install section describes

## File layout

- `client.jsx` — the whole component (masonry grid, infinite loading, debounced tag search, viewer)

## Constraints

- The component stays a single self-contained file that a user can copy into their app; it only imports `@/lib/supabaseClient` and the listed packages.
- No server code and no keys in this repo; the host app provides the Supabase client, env vars and `images.remotePatterns`.
- Path-type constraints are mirrored in `kit.toml [protected]`; keep the two in sync (one glob per line).

## Conventions

- Conventional commits. Keep the README's SQL (table + RPC) in sync with what `client.jsx` queries.
- GitHub Actions: top-level `permissions: contents: read`, raised per job only when needed.
- GitHub Actions: pin every `uses:` to a 40-character commit SHA with a trailing `# vX.Y.Z` comment.

## Where to look

- `README.md` — install steps, the table and RPC SQL
