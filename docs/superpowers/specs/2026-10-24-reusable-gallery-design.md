# Reusable gallery component — design

Date: 2026-10-24. Status: approved design for the refactor of `client.jsx`.

## Intent

`client.jsx` is meant to be dropped into several Next.js apps (today: `~/portfolio`,
`app/gallery/client.jsx`, already diverged from this repo). It must become the single
source of truth: one file, configured by props, with the known logic/performance bugs
fixed once.

## Goals

1. Host apps configure the component with props instead of editing it.
2. Random pagination shows every image exactly once per browsing session.
3. Searching while a page request is in flight never corrupts the list.
4. A network error is recoverable without changing the search term.
5. Rendering cost does not grow with the number of loaded images on unrelated state
   changes (modal open, loading flag, scroll-top button).

## Non-goals

- No TypeScript, no package.json, no test runner in this repo (verification happens in
  a host app — see Verification).
- No change to the visual design; Tailwind classes stay as they are.
- No virtualization of the grid.
- No change to image hosting; `gcs_url` stays the column name.

## Anti-goals

- Breaking a host app that still runs the old 3-argument RPC must not happen silently:
  the README must carry an explicit migration note.
- Non-ASCII characters in code comments (byte-sensitive contexts).

## Public interface (decided)

```jsx
<GalleryClient
  supabase={supabase}                 // required: a supabase-js client instance
  rpc="get_random_media"              // RPC name
  pageSize={14}                       // images per request
  title="My Image Gallery"            // heading text; null/'' hides the <h1>
  unoptimizedThumbnails               // default true: grid <Image unoptimized>; the viewer is always optimized
  entrance={{ delay: 0.8, duration: 0.4, ease: 'easeIn' }} // root fade-in transition
  motionProps={{}}                    // spread onto the root motion.div (host-specific flags)
  className="min-h-[100vh] p-4 sm:p-6 lg:p-8" // root container classes
/>
```

The component no longer imports `@/lib/supabaseClient`. Its only imports are `react`,
`framer-motion`, `next/image`, `lucide-react`.

## Database contract (decided)

```
get_random_media(
  p_seed text,                      -- required, first, no default: old 3-key callers fail loudly
  p_search_term text DEFAULT '',
  p_limit int DEFAULT 14,
  p_after_key text DEFAULT NULL,    -- keyset cursor: sort_key of the last row received
  p_after_id bigint DEFAULT NULL    --                 id of the last row received
) RETURNS TABLE (id, tags, width, height, source, gcs_url, created_at, sort_key text)
```

`sort_key = md5(id::text || p_seed)`; rows are ordered by `(sort_key, id)` and filtered by
`(sort_key, id) > (p_after_key, p_after_id)` when a cursor is given. The browser generates
a fresh seed per search and carries the last row's `(sort_key, id)` as the cursor. Keyset
pagination never repeats a row and never skips one that existed at session start;
rows inserted mid-session appear only if their key sorts after the cursor (acceptable).
The old 3-argument function is dropped in the same SQL block. A GIN index on `tags`
backs the `@>` filter. Function is `LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''` with the table schema-qualified.

Both READMEs carry the new SQL plus a short "upgrading from the previous version" note.

## Behaviour (decided)

- **Request bookkeeping** lives in one ref `{ seed, term, afterKey, afterId, requestId }`.
  A new search bumps `requestId`; a response whose `requestId` differs from the current
  one is discarded. A `pending` ref holds the `requestId` whose request is in flight and
  is set synchronously before the RPC call, so two same-tick triggers issue one request.
- **Pagination end**: `data.length < pageSize` means no more pages. The client no longer
  dedupes by id (keyset pagination makes it unnecessary).
- **Errors**: status becomes `'error'`; the sentinel area shows the message and a Retry
  button that re-issues the same page. `hasMore` is untouched.
- **Masonry**: each image goes to the currently shortest column, measured as the sum of
  `height / width` (fallback 1 when either is missing). Appending images never moves
  earlier ones; changing the column count reflows everything.
- **Grid** is a `React.memo` component (`MasonryGrid`) taking the memoized columns, the
  thumbnail mode and a stable select callback, so viewer/status/scroll-button state
  changes do not re-run the column/item JSX. Each item is a `React.memo` `GalleryItem`;
  `layoutId` is removed. The click handler is stable and receives the flat index.
- **Viewer** state is the selected flat index (`selectedIndex`, `null` when closed).
- **Resize** updates layout state only when `columns` or `isMobile` actually changed.
- **Body scroll lock** restores the previous `overflow` value instead of forcing `auto`.
- Missing `tags` yields title `'Untitled'`; missing `width`/`height` falls back to
  `1 x 1` so `next/image` never throws in development.

## Left to the builder

Exact hook decomposition inside the file, Tailwind class names for the error/retry
block, and comment wording (English only, comments only for invariants and non-obvious
why).

## Verification

Build and lint in `~/portfolio` after swapping its copy for the new file. Its
`app/gallery/page.jsx` is a server component (cookie gate), so a `'use client'` wrapper
`GalleryShell.jsx` owns the supabase client and the motion flags and renders
`GalleryClient`; the user confirms in the browser. The SQL runs on the user's Supabase project before the browser check.
