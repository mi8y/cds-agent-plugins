# CDS Persistence Plugin for LangGraph Checkpoint & Memory

This is a CDS Plugin NPM package for SAP CAP applications to enable adding Checkpoint & Memory-Store persistence for LangGraph/LangChain/Deep Agents.

## Project Structure

<package-root>
├── package.json
├── AGENTS.md <- You are here
├── lib
│  └── add.js // helper lib for CDS plugin
├── src
│ ├── checkpoint
│ │ ├── cds-checkpointer.ts
│ │ └── index.ts
│ └── memory
│   ├── cds-memory.ts
│   └── index.ts
├── tests // unit tests
│   ├── checkpoint
│   └── memory
└── cds-plugin.js // CDS plugin entry point

## Commands

- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`
