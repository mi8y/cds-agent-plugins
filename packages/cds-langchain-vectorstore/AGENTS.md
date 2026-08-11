# CDS Vector Store Plugin for LangGraph Checkpoint & Memory

This project builds a CDS Plugin for SAP CAP applications to build LangGraph/LangChain/Deep Agents based applications with Checkpoint and Memory persistence.

## Project Structure

<root>
├── package.json
├── AGENTS.md <- You are here
├── lib
│. └── add.js // helper lib for CDS plugin
├── src
│ ├── index.ts
│ └── cds-vectorstore.ts
├── tests // unit tests
│ . └── ...
└── cds-plugin.js // CDS plugin entry point

## Commands

- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md)
