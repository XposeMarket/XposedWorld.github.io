
# AutoNews — Supabase Setup (Step-by-step)

## 0) Files you have
- `index (18).html` — homepage
- `login.html` — login/register
- `admin.html` — admin-only editor
- `post.html` — article template
- `styles.css` — styles
- `app.js` — logic (now Supabase-enabled)

## 1) Open each HTML and paste your Supabase values
Near the top you will see:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  window.SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";   // <-- replace
  window.SUPABASE_ANON = "YOUR_PUBLIC_ANON_KEY";              // <-- replace
</script>
```

Replace with your project URL and anon key (Supabase → Project Settings → API).

## 2) Create tables & policies (SQL)
In Supabase → SQL Editor → run this:

```sql
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image text,
  topic text not null,
  tags text[] default '{}',
  byline text default 'AutoNews Desk',
  author_email text not null,
  ts timestamptz not null default now(),
  content text not null
);

create table if not exists user_profiles (
  email text primary key,
  role text not null default 'user'
);

-- Make YOUR email the admin:
insert into user_profiles(email, role)
values ('you@yourdomain.com','admin')
on conflict (email) do update set role='admin';

alter table posts enable row level security;
alter table user_profiles enable row level security;

create policy "read posts" on posts
for select using (true);

create policy "admin writes" on posts
for all using (
  exists (select 1 from user_profiles up where up.email = auth.email() and up.role='admin')
)
with check (
  exists (select 1 from user_profiles up where up.email = auth.email() and up.role='admin')
);

create policy "read my profile" on user_profiles
for select using (email = auth.email());
```

## 3) Enable Realtime for `posts`
Supabase → Database → Replication → Realtime → enable for table **posts**.

## 4) Turn on Email/Password auth
Supabase → Authentication → Providers → Email: **Enabled**.

## 5) Try it
1. Open `login.html` in your browser; register using the **admin email** you inserted above.
2. Open `admin.html`, publish a post.
3. Open `index (18).html` — the post appears. Try from another device/browser too.
4. Click a card; it opens `post.html?id=...` with the full article.

## Notes
- The homepage shows **5 posts**, then a **Load more** button (paged).
- Posting/deleting triggers **live updates** via Realtime.
- Only the email you marked as **admin** can insert/delete (enforced by RLS).
