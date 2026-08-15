# @mi8y/cds-langgraph-persistence

[![npm version](https://img.shields.io/npm/v/@mi8y/cds-langgraph-persistence)](https://www.npmjs.com/package/@mi8y/cds-langgraph-persistence)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![monthly downloads](https://img.shields.io/npm/dm/@mi8y/cds-langgraph-persistence)](https://www.npmjs.com/package/@mi8y/cds-langgraph-persistence)

Persistence for LangGraph on SAP CAP. This CDS plugin gives your CAP application two durable building blocks backed by the same CAP database:

- `CdsCheckpointSaver` for LangGraph checkpoints
- `CdsMemoryStore` for LangGraph memory storage

Use it when you want agent state to survive restarts, stay tenant-aware, and live in your existing CAP data layer without adding another persistence service.

## What you get

- Durable checkpoint persistence for LangGraph, LangChain agents, and Deep Agents
- Durable memory storage through LangGraph's `BaseStore` API
- CAP-managed database access and tenant isolation
- Works with CAP-supported databases such as SQLite, SAP HANA, and PostgreSQL
- Reusable CDS aspects plus add commands to generate default concrete entities

## Installation

```bash
npm install @mi8y/cds-langgraph-persistence
```

Register the CDS entities in your CAP project:

```bash
cds add langgraph-checkpointer
cds add langgraph-memorystore
```

This creates `srv/langgraph-checkpointer.cds` and `srv/langgraph-memorystore.cds` so the persistence entities are part of your project model at build time.

For backward compatibility, `cds add langgraph-persistence` remains available as an alias that runs both generators.

Requires `@sap/cds >= 9`.

## Quick Start

The package exports both persistence primitives:

```ts
import {
  CdsCheckpointSaver,
  CdsMemoryStore,
} from "@mi8y/cds-langgraph-persistence";
```

The package exports these reusable CDS aspects:

- `Checkpoint`
- `CheckpointWrite`
- `StoreItem`
- `StoreItemField`

The add commands generate these default CDS entities:

- `Checkpoints`
- `CheckpointWrites`
- `StoreItems`
- `StoreItemFields`

## Customizing entities

The generated files are just defaults. You can define your own concrete entities implementing the exported aspects while keeping the runtime APIs.

```cds
using plugin.langgraph.persistence as persistence from '@mi8y/cds-langgraph-persistence';

namespace my.app.persistence;

entity AgentCheckpoints : persistence.Checkpoint {
    parent : Association to one AgentCheckpoints;
    writes : Composition of many AgentCheckpointWrites
                 on writes.checkpoint = $self;
}

entity AgentCheckpointWrites : persistence.CheckpointWrite {
    checkpoint : Association to AgentCheckpoints
                     on  checkpoint.graphName = $self.checkpoint_graphName
                     and checkpoint.namespace = $self.checkpoint_namespace
                     and checkpoint.threadId  = $self.checkpoint_threadId
                     and checkpoint.id        = $self.checkpoint_id;
}
```

```ts
const saver = new CdsCheckpointSaver({
  name: "support-agent",
  fqnCheckpointsEntity: "my.app.persistence.AgentCheckpoints",
  fqnCheckpointWritesEntity: "my.app.persistence.AgentCheckpointWrites",
});
```

```cds
using plugin.langgraph.persistence as persistence from '@mi8y/cds-langgraph-persistence';

namespace my.app.persistence;

entity AgentStoreItems : persistence.StoreItem {
    fields : Composition of many AgentStoreItemFields
                 on fields.item = $self;
}

entity AgentStoreItemFields : persistence.StoreItemField {
    item      : Association to AgentStoreItems
                    on  item.graphName = $self.graphName
                    and item.namespace = $self.namespace
                    and item.id        = $self.id;
    embedding : Vector(3072);
}
```

```ts
const store = new CdsMemoryStore({
  name: "support-memory",
  fqnStoreItemsEntity: "my.app.persistence.AgentStoreItems",
  fqnStoreItemFieldsEntity: "my.app.persistence.AgentStoreItemFields",
});
```

## Checkpoint Persistence

Use `CdsCheckpointSaver` when you want LangGraph runs to resume from saved state.

```ts
import cds from "@sap/cds";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { CdsCheckpointSaver } from "@mi8y/cds-langgraph-persistence";

const State = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

const graph = new StateGraph(State)
  .addNode("reply", async (state) => ({
    messages: [...state.messages, "Hello from LangGraph"],
  }))
  .addEdge("__start__", "reply")
  .addEdge("reply", "__end__")
  .compile({
    checkpointer: new CdsCheckpointSaver({ name: "support-agent" }),
  });

export default class AgentService extends cds.ApplicationService {
  async init() {
    this.on("invoke", async (req) => {
      const result = await graph.invoke(
        { messages: [req.data.message] },
        { configurable: { thread_id: req.user.id } },
      );

      return result.messages.at(-1) ?? "";
    });

    return super.init();
  }
}
```

### Checkpoint API

```ts
new CdsCheckpointSaver(config, serde?)
```

Config:

| Option                      | Type     | Required | Description                                                                                                                        |
| --------------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | `string` | Yes      | Logical graph name stored with each checkpoint. Use a different name per graph or agent.                                           |
| `ttl`                       | `number` | No       | Checkpoint TTL in milliseconds. The saver stores `expiresAt`; use `purgeExpiredCheckpoints()` to remove expired completed threads. |
| `fqnCheckpointsEntity`      | `string` | No       | Fully qualified CDS entity name for checkpoint records. Defaults to `plugin.langgraph.persistence.Checkpoints`.                    |
| `fqnCheckpointWritesEntity` | `string` | No       | Fully qualified CDS entity name for pending writes. Defaults to `plugin.langgraph.persistence.CheckpointWrites`.                   |

Main methods:

- `getTuple(config)`
- `list(config, options?)`
- `put(config, checkpoint, metadata, newVersions)`
- `putWrites(config, writes, taskId)`
- `deleteThread(threadId)`

### When to use checkpoints

- Resume long-running workflows after crashes or redeploys
- Pause for human approval and continue later
- Keep per-thread execution history
- Support time-travel and replay flows in LangGraph

### Thread IDs

Use `configurable.thread_id` to separate conversations or workflow runs.

```ts
{
  configurable: {
    thread_id: req.user.id;
  }
}
```

Typical patterns:

- Per-user thread: `req.user.id`
- Per-session thread: `crypto.randomUUID()`

## Memory Store

Use `CdsMemoryStore` when you want durable memory or document storage through LangGraph's store interface.

```ts
import { CdsMemoryStore } from "@mi8y/cds-langgraph-persistence";

const store = new CdsMemoryStore({ name: "support-memory" });

await store.put(["users", "alice"], "profile", {
  preferredTone: "concise",
  lastTopic: "travel",
});

const profile = await store.get(["users", "alice"], "profile");

const matches = await store.search(["users"], {
  query: "travel",
  limit: 5,
});
```

### Memory API

```ts
new CdsMemoryStore(config);
```

Config:

| Option                     | Type         | Required | Description                                                                                                        |
| -------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `name`                     | `string`     | Yes      | Logical memory store name used to isolate records in shared CDS tables.                                            |
| `embeddings`               | `Embeddings` | No       | LangChain embeddings implementation used for vector-assisted search.                                               |
| `fqnStoreItemsEntity`      | `string`     | No       | Fully qualified CDS entity name for store items. Defaults to `plugin.langgraph.persistence.StoreItems`.            |
| `fqnStoreItemFieldsEntity` | `string`     | No       | Fully qualified CDS entity name for store item fields. Defaults to `plugin.langgraph.persistence.StoreItemFields`. |

Common methods:

- `put(namespace, key, value)`
- `get(namespace, key)`
- `delete(namespace, key)`
- `search(namespacePrefix, options?)`
- `listNamespaces(options?)`
- `batch(operations)`

### Namespaces

Namespaces are string arrays, for example:

```ts
["users", req.user.id];
```

Rules:

- Namespace cannot be empty
- Namespace labels must be non-empty strings
- Namespace labels cannot contain `.`
- The root namespace label `langgraph` is reserved

### Search

`search(namespacePrefix, options?)` supports:

- `query` for text search
- `filter` for additional filtering on the parent `StoreItems` query
- `limit`
- `offset`

Stored payload fields are persisted in `StoreItemFields`, so `filter` does not currently apply field-level predicates to the stored JSON payload.

Without embeddings, search matches against stored field values within the requested namespace prefix.

With embeddings configured, the store also generates vectors for stored fields and query text.

```ts
import { OpenAIEmbeddings } from "@langchain/openai";
import { CdsMemoryStore } from "@mi8y/cds-langgraph-persistence";

const store = new CdsMemoryStore({
  name: "support-memory",
  embeddings: new OpenAIEmbeddings(),
});
```

### When to use memory

- Store user preferences or profiles
- Save retrieved documents or tool outputs
- Build namespace-scoped long-term memory
- Support hybrid text and embedding-based lookup

## TTL Cleanup

If you configure `ttl` on `CdsCheckpointSaver`, the plugin stores an `expiresAt` timestamp on checkpoints. Expired threads are not deleted automatically unless you call the cleanup utility yourself.

Use `purgeExpiredCheckpoints()` from a scheduled job or service endpoint. It deletes expired threads only when the latest checkpoint has no pending writes, and skips interrupted or in-progress threads:

```ts
import cds from "@sap/cds";
import { purgeExpiredCheckpoints } from "@mi8y/cds-langgraph-persistence";

cds.spawn({ every: 60 * 60 * 1000 }, async () => {
  const result = await purgeExpiredCheckpoints();
  console.log(result);
});
```

## CAP Notes

- The plugin works best when used inside CAP request handlers, where CDS already has the active database and tenant context.
- In multi-tenant CAP applications, CDS routes persistence queries to the current tenant automatically.
- Checkpoint writes run in their own root transactions so saved agent state is not lost if the enclosing service transaction rolls back.

## Supported Databases

Any CAP-supported database adapter should work. Typical setups are:

- SQLite for local development and tests
- SAP HANA for production
- PostgreSQL for production

## License

[MIT License](./LICENSE)
