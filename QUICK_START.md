# Movido — Quick Start Guide

## Problem: `pnpm dev` → "Command dev not found"

This happens when you run `pnpm dev` in the WRONG folder.
The `package.json` must be in the same folder where you run the command.

---

## Step-by-step fix:

### 1. Find the right folder
After unzipping, your structure is probably:

```
movido_app/
  └── movido-migrated/     ← THIS is the project root
        ├── package.json   ← pnpm needs THIS file
        ├── client/
        ├── .env           ← your keys go here
        ├── vite.config.ts
        └── ...
```

### 2. Navigate to the correct folder
```bash
cd movido_app/movido-migrated
```

Or if you want a cleaner name, move everything up:
```bash
# Option A: rename
mv movido_app/movido-migrated movido_app_clean
cd movido_app_clean

# Option B: move contents up
mv movido_app/movido-migrated/* movido_app/
mv movido_app/movido-migrated/.* movido_app/ 2>/dev/null
cd movido_app
```

### 3. Make sure .env is in the project root
Your `.env` file must be in the SAME folder as `package.json`:

```
movido-migrated/
  ├── .env              ← HERE (same level as package.json)
  ├── package.json
  ├── client/
  └── ...
```

If your `.env` is somewhere else, move it:
```bash
mv /path/to/your/.env .
```

### 4. Install dependencies
```bash
pnpm install
```

This will download all packages (~2-3 minutes).

### 5. Run the dev server
```bash
pnpm dev
```

You should see:
```
  VITE v7.x.x  ready in XXXms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

### 6. Open in browser
Go to: **http://localhost:5173**

---

## .env file contents (must have these 3 keys):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
VITE_TOMTOM_API_KEY=your-tomtom-consumer-key
```

---

## Supabase SQL Setup

Before using the app, run the schema in Supabase:

1. Go to https://supabase.com/dashboard
2. Open your project
3. Go to **SQL Editor**
4. Copy the ENTIRE contents of `supabase/migrations/001_initial_schema.sql`
5. Click **Run**

This creates all tables, enums, indexes, and RLS policies.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Command "dev" not found` | You're in the wrong folder. `cd` to where `package.json` is |
| `vite: command not found` | Run `pnpm install` first |
| `Cannot find module @supabase/supabase-js` | Run `pnpm install` first |
| Blank page / console errors | Check `.env` keys are correct |
| `supabase.co` 401 error | Check `VITE_SUPABASE_ANON_KEY` is the **anon** key (not service role) |
| Map not loading | Check `VITE_TOMTOM_API_KEY` is valid |
| Login not working | Make sure you ran the SQL migration in Supabase first |
