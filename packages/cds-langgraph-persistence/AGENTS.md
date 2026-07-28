# CDS Persistence Plugin for LangGraph Checkpoint & Memory

This project builds a CDS Plugin for SAP CAP applications to build LangGraph/LangChain/Deep Agents based applications with Checkpoint and Memory persistence.

## Project Structure

<root>
├── package.json
├── AGENTS.md <- You are here
├── lib
│. └── add.js // helper lib for CDS plugin
├── src
│ ├── checkpoint
│ │ ├── cds-checkpointer.ts
│ │ └── index.ts
│ └── memory
│ . ├── cds-memory.ts
│ . └── index.ts
├── tests // unit tests
│ . ├── checkpoint
│ . └── memory
└── cds-plugin.js // CDS plugin entry point

## Commands

- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md)
