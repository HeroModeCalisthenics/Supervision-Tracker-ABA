# Fieldwork Flow

Static MVP for the Perfect Supervision Tracker spec.

Open `index.html` in a browser to use it. Data is saved locally in the browser with `localStorage`.

Run it locally with a browser server:

```bash
npm start
```

Then open `http://127.0.0.1:4173`.

Included:
- Quick activity logging with auto-classification
- Manual classification override
- Split mixed-session entry
- Monthly and cumulative dashboard summaries
- Supervisor profiles and local profile settings
- Filterable entry review
- CSV export
- Excel-compatible `.xls` export
- Printable monthly summary with compliance disclaimer

Not included in this static MVP:
- Supabase authentication
- Cloud database sync
- Real `.xlsx` generation
- Supervisor sign-off portal

Deployment prep:
- `vercel.json` is ready for Vercel static hosting.
- `supabase/schema.sql` contains the first-pass cloud database schema and row-level security policies.
- `.env.example` lists the Supabase values needed for the cloud version.
- `docs/DEPLOYMENT.md` has the dead-simple setup checklist.
