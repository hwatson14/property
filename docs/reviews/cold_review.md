# Cold Review

## What a fresh reviewer would likely conclude

### What is strong
- The product is now clearly a buying-decision tool, not a property portal.
- The semantic model is clean.
- The workflow state model is practical.
- The map-first requirement is incorporated without letting the map become fake authority.
- The repo runtime is still lean.

### What still requires discipline
- Scoring formulas must be implemented exactly as specified.
- The Verification tab cannot become an afterthought.
- The one-page UI must use dialogs/expanders to avoid turning into a form wall.
- Compare view must default to trustworthy ranking only.

### Most likely implementation mistakes
1. Using one price field for everything
2. Ranking incomplete properties
3. Saving session tweaks as shared defaults
4. Hiding missing-input reasons
5. Letting app.py accumulate business logic

### Fresh-review conclusion
The design is strong enough for Codex **if** the implementation is controlled by the docs plus acceptance tests. Without those tests, it is still vulnerable to plausible-but-wrong implementation.
