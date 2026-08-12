const cds = require("@sap/cds");

const LOG = cds.log("cds-langgraph-persistence");

/**
 * `cds add` plugin for adding the default entities for the LangGraph persistence plugin.
 */

// adds short-term memory - Checkpointer
cds.add?.register(
  "langgraph-checkpointer",
  require("./lib/add").AddLangGraphCheckpointerPlugin,
);

// adds long-term memory - Memory Store
cds.add?.register(
  "langgraph-memory-store",
  require("./lib/add").AddLangGraphMemoryStorePlugin,
);

// adds both short-term and long-term memory
cds.add?.register(
  "langgraph-persistence",
  require("./lib/add").AddLangGraphPersistencePlugin,
);

/**
 * Check for the presence of entities if not already added via `cds add` and log a warning if not found.
 */

cds.on("loaded", (model) => {
  const hasCheckpointer = Boolean(
    model.definitions["plugin.langgraph.persistence.Checkpoints"],
  );
  const hasMemoryStore = Boolean(
    model.definitions["plugin.langgraph.persistence.StoreItems"],
  );

  if (!hasCheckpointer && !hasMemoryStore) {
    LOG.warn(
      `Detected '@mi8y/cds-langgraph-persistence' CDS plugin installation, but no entities found in the model. ` +
        `Did you forget to run 'cds add langgraph-checkpointer' and/or 'cds add langgraph-memory-store' after installing the package?`,
    );
    return;
  }

  if (!hasCheckpointer) {
    LOG.warn(
      `Detected '@mi8y/cds-langgraph-persistence' installation, but no checkpoint entities found in the model. ` +
        `Run 'cds add langgraph-checkpointer' to add the default checkpoint entities.`,
    );
  }

  if (!hasMemoryStore) {
    LOG.warn(
      `Detected '@mi8y/cds-langgraph-persistence' installation, but no memory store entities found in the model. ` +
        `Run 'cds add langgraph-memory-store' to add the default memory store entities.`,
    );
  }
});
