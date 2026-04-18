# T1B Free Deployment Notes

## Purpose

T1B deploys the accepted T1A Streamlit shell for shared use without changing the product contract.

This free-hosting pivot stops the paid Render persistent-disk path.

## Target

- App host: Streamlit Community Cloud
- Hosted DB: Supabase free Postgres
- App entrypoint: `app.py`
- Dependency file: `requirements.txt`
- Storage model: hosted Postgres for deployment, local SQLite fallback for development/tests

No providers, auth, formula changes, new pages, or workflow changes are part of T1B.

## Required Secret

Set this Streamlit Community Cloud secret:

```toml
PROPERTY_COCKPIT_DATABASE_URL = "postgresql://postgres.PROJECT_REF:PASSWORD@HOST:PORT/postgres"
```

Use the Supabase pooled connection string from Project Settings -> Database -> Connection string.

The app reads this value as the environment variable:

```text
PROPERTY_COCKPIT_DATABASE_URL
```

If the variable is absent, the app falls back to local SQLite at:

```text
data/property_cockpit.sqlite3
```

That fallback is for local development and tests only, not shared hosted persistence.

## Deployment Procedure

1. Create a Supabase project on the free plan.
2. In Supabase, open Project Settings -> Database -> Connection string.
3. Copy the pooled Postgres connection string and replace the password placeholder.
4. Push this repo to GitHub.
5. In Streamlit Community Cloud, create a new app from the repo.
6. Set the main file path to:

```text
app.py
```

7. In Streamlit app secrets, add:

```toml
PROPERTY_COCKPIT_DATABASE_URL = "postgresql://postgres.PROJECT_REF:PASSWORD@HOST:PORT/postgres"
```

8. Deploy the app.

The app creates the `listings` and `settings` tables on first startup.

## Smoke Checklist

Before accepting T1B in the hosted environment:

1. Open the deployed Streamlit app as Harry.
2. Open the same deployed app as Candace.
3. Confirm the app is still one page with Map / Compare / Verification tabs.
4. Add a manual property and reload the app.
5. Confirm the property remains after reload.
6. Restart/reboot the Streamlit app.
7. Confirm listings and settings survive restart.
8. Import `tests/fixtures/golden_listings.csv`.
9. Confirm CSV export includes the imported listings.
10. Confirm default Compare excludes `house_morningside_incomplete`.
11. Confirm Map, Compare, and Verification behaviours match local T1A.
12. Change a sidebar setting, save it, reload, and confirm the setting persists.
13. Confirm no provider, auth, formula, tab, or workflow change is present.

## Non-Goals

T1B does not add:

- provider connectors
- custom auth in app code
- new pages or tabs
- formula changes
- workflow redesign
- T2 or T3 behaviour
