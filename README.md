# Brisbane Property Decision Cockpit

Private Streamlit decision cockpit for comparing Brisbane properties for purchase.

## Purpose
Help two users decide where to buy by combining:
- map-first spatial review
- ranked comparison
- verification of missing or weak inputs

## T1A scope
- Map / Compare / Verification tabs on one page
- manual add/edit
- CSV import/export
- listings + settings persistence
- structured manual commute inputs
- manual land-value estimate/confidence inputs
- computed scores
- rankability gating

## T1B free deployment
Run locally with:

```powershell
streamlit run app.py
```

For free shared deployment, use Streamlit Community Cloud plus Supabase free Postgres.

Set this Streamlit secret:

```toml
PROPERTY_COCKPIT_DATABASE_URL = "postgresql://postgres.PROJECT_REF:PASSWORD@HOST:PORT/postgres"
```

See `docs/deployment_t1b.md`.

## Authority
See:
- `AGENTS.md`
- `docs/handoff.md`
- `docs/formulas_and_rules.md`
- `docs/schema_and_ui_contract.md`
- `docs/tranches/tranche_1.md`
