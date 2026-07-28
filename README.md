# CDS LangGraph/LangChain/Deep Agents Plugins

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This is a monorepo containing CAP CDS Plugins for building **production-ready** LangGraph/LangChain/Deep Agents based AI-Agents with SAP CAP framework.

## Plugins

Documentation for each plugin can be found in the respective package folder.

| Status | Plugin                                                                     | Version                                                                                                                                                                                                                                                                                            | Description                 | Used for                                                                                                                  |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ✅     | [`@mi8y/cds-langgraph-persistence`](./packages/cds-langgraph-persistence/) | [![npm version](https://img.shields.io/npm/v/@mi8y/cds-langgraph-persistence)](https://www.npmjs.com/package/@mi8y/cds-langgraph-persistence) [![monthly downloads](https://img.shields.io/npm/dm/@mi8y/cds-langgraph-persistence)](https://www.npmjs.com/package/@mi8y/cds-langgraph-persistence) | Checkpointer & Memory Store | Durability, Fault-tolerance, Time-travel, Retention, Short-term memory, Long-term memory, User preferences, Self-learning |
| 🚧     | [`@mi8y/cds-langgraph-vectorstore`](./packages/cds-langgraph-vectorstore/) |                                                                                                                                                                                                                                                                                                    | Vector Store                | RAG, Semantic Search, Embeddings Storage, Retrieval                                                                       |
| 🚧     | [`@mi8y/cds-langgraph-telemetry`](./packages/cds-langgraph-telemetry/)     |                                                                                                                                                                                                                                                                                                    | Telemetry                   | Observability, Auditing, Monitoring                                                                                       |

## License

[MIT License](./LICENSE)
