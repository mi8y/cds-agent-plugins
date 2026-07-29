# CAP CDS Plugin for building LangGraph/LangChain/Deep Agents within CAP framework

This is a turbo-based monorepo containing CDS plugins for building production-ready LangGraph/LangChain/Deep Agents within SAP CAP framework.

## Project Structure

<root>
├── AGENTS.md <- You are here
├── package.json
├── packages
│ . ├── cds-langgraph-integration-tests
│ . │ . ├── AGENTS.md <- Read this for integration test setup
│ . │ . └── ...
│ . ├── cds-langgraph-persistence
│ . │ . ├── AGENTS.md <- Read this for persistence plugin (checkpoint & memory) setup
│ . │ . └── ...
│ . ├── cds-langchain-vectorstore
│ . │ . ├── AGENTS.md <- Read this for vectorstore plugin setup
│ . │ . └── ...
│ . └── cds-langgraph-telemetry
│ . . ├── AGENTS.md <- Read this for telemetry plugin setup
│ . . └── ...
├── examples
│ . └── ...
├── tests
│ . ├── checkpoint
│ . └── memory
└── cds-plugin.js

## Development

- **`pnpm`** package manager. `npm install -g pnpm` if not already installed.
- Install - `pnpm install`
- Build - `pnpm build`
- Format - `pnpm format`
- Lint - `pnpm lint`
- Clean - `pnpm clean`

## Testing

- Uses Vitest framework and follows `*.test.ts` naming convention.
- Unit Test - `pnpm test:unit`
- Integration Test - `pnpm test:integration`
- Do not run `pnpm test` as it is meant for CI workflow

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md)
