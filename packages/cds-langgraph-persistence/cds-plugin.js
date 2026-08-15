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
  "langgraph-memorystore",
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
  let hasCdsCheckpointAspectApplied,
    hasCdsCheckpointWriteAspectApplied = false;
  let hasCdsStoreItemAspectApplied,
    hasCdsStoreItemFieldAspectApplied = false;

  // check if model has implemented persistence related aspects in their entities
  for (const entityName in model.definitions) {
    const entity = model.definitions[entityName];
    if (entity.kind === "entity" && entity.includes) {
      hasCdsCheckpointAspectApplied ||= entity.includes.includes("Checkpoint");
      hasCdsCheckpointWriteAspectApplied ||=
        entity.includes.includes("CheckpointWrite");
      hasCdsStoreItemAspectApplied ||= entity.includes.includes("StoreItem");
      hasCdsStoreItemFieldAspectApplied ||=
        entity.includes.includes("StoreItemField");
    }
  }

  if (!(hasCdsCheckpointAspectApplied && hasCdsCheckpointWriteAspectApplied)) {
    LOG.warn(
      `Detected '@mi8y/cds-langgraph-persistence' installation, but no entities which implements the aspects 'Checkpoint' or 'CheckpointWrite', found in the model. ` +
        `Run 'cds add langgraph-checkpointer' to add the default checkpoint entities.`,
    );
  }

  if (!(hasCdsStoreItemAspectApplied && hasCdsStoreItemFieldAspectApplied)) {
    LOG.warn(
      `Detected '@mi8y/cds-langgraph-persistence' installation, but no entities which implements the aspects 'StoreItem' or 'StoreItemField', found in the model. ` +
        `Run 'cds add langgraph-memorystore' to add the default memory store entities.`,
    );
  }
});
