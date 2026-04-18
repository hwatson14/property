# T1B Render Deployment Notes

## Purpose

T1B deploys the accepted T1A Streamlit shell for shared use without changing the product contract.

## Target Host

- Host: Render
- Service type: Web Service
- Runtime: Python
- Plan: `starter` or higher
- Storage: Render persistent disk
- Storage model: SQLite, unchanged from T1A

Render requirements used here:

- Persistent disks require a paid Render web service, private service, or background worker.
- Only files under the disk mount path survive deploys/restarts.
- A Render web service must bind to `0.0.0.0` and should use the `PORT` environment variable.

## Runtime

- App entrypoint: `app.py`
- Build command: `pip install -r requirements.txt`
- Start command: `streamlit run app.py --server.address 0.0.0.0 --server.port $PORT`
- Python: 3.11+
- Dependencies: `requirements.txt`

The repo includes `render.yaml` for the fastest path:

```yaml
services:
  - type: web
    runtime: python
    name: brisbane-property-cockpit
    plan: starter
    buildCommand: pip install -r requirements.txt
    startCommand: streamlit run app.py --server.address 0.0.0.0 --server.port $PORT
    disk:
      name: property-cockpit-data
      mountPath: /var/data
      sizeGB: 5
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.9
      - key: PROPERTY_COCKPIT_DB_PATH
        value: /var/data/property_cockpit.sqlite3
```

## Persistence

The app still persists exactly two logical tables:

- `listings`
- `settings`

DB access remains isolated to `storage/db.py`.

By default, local/dev mode uses:

```text
data/property_cockpit.sqlite3
```

For the Render deployment, use this exact persistent disk mount path:

```text
/var/data
```

Use this exact environment variable value:

```text
PROPERTY_COCKPIT_DB_PATH=/var/data/property_cockpit.sqlite3
```

Do not point this at ephemeral container storage if persistence across restart/redeploy is required.

## Render Setup

1. Push the repo with `render.yaml` to GitHub.
2. In Render, create a new Blueprint from the repo. Do not create a static site.
3. Confirm service name: `brisbane-property-cockpit`.
4. Confirm service type: Web Service.
5. Confirm runtime: Python.
6. Confirm plan: `starter` or higher. Do not use the free plan because persistent disks are required.
7. Confirm instance count remains one. Render persistent disks attach to one running service instance.
8. Confirm build command:

```text
pip install -r requirements.txt
```

9. Confirm start command:

```text
streamlit run app.py --server.address 0.0.0.0 --server.port $PORT
```

10. Confirm persistent disk:
    - name: `property-cockpit-data`
    - mount path: `/var/data`
    - size: `5 GB`
11. Confirm environment variables:
    - `PYTHON_VERSION=3.11.9`
    - `PROPERTY_COCKPIT_DB_PATH=/var/data/property_cockpit.sqlite3`
12. Deploy.

The SQLite file is created at runtime. The disk is not needed during the build command.

## Access Control

T1B does not add app-code auth. Keep access control at the deployment/platform layer unless a future tranche explicitly changes that contract.

## Smoke Checklist

Before accepting T1B in a hosted environment:

1. Open the deployed `.onrender.com` app as Harry.
2. Open the same deployed app as Candace.
3. Confirm the app is still one page with Map / Compare / Verification tabs.
4. Add a manual property and reload the app.
5. Confirm the property remains after reload.
6. Restart or redeploy the app.
7. Confirm listings and settings survive restart/redeploy.
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
