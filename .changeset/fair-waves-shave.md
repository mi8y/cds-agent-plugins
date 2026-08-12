---
"@mi8y/cds-langgraph-persistence": minor
---

- Replace shipped concrete persistence entities with reusable CDS aspects.
- Add `cds add langgraph-checkpointer` and `cds add langgraph-memory-store` for generating default entities.
- Retain `cds add langgraph-persistence` as a compatibility alias that runs both generators.
