# Fieldwork Flow Deployment

This project currently runs as a static web app. That means it can be deployed free on Vercel before the Supabase cloud-sync work is added.

## What You Do

1. Create a GitHub account if needed.
2. Create a Vercel account.
3. Create a Supabase account.
4. In Supabase, create a project named `fieldwork-flow`.
5. Send these values from Supabase Project Settings > API:
   - Project URL
   - Anon public key

## What I Do

1. Put this folder in a GitHub repo.
2. Push the app to GitHub.
3. Connect the repo to Vercel.
4. Deploy the static MVP first.
5. Add Supabase auth and database sync next.
6. Add the Supabase environment values in Vercel.
7. Test the live site on desktop and mobile.

## Free Setup

- GitHub Free: stores the code.
- Vercel Hobby: hosts the app.
- Supabase Free: provides auth and database.

The free Supabase project may pause after low activity. For a personal MVP, that is usually acceptable. It can be restored from the Supabase dashboard.

## Local Commands

Run a local server:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

Check JavaScript syntax:

```bash
npm run check
```
