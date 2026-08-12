const cds = require("@sap/cds");

const LOG = cds.log("cds-langgraph-persistence");

const CHECKPOINTER_CDS_CONTENT = `namespace plugin.langgraph.persistence;

using {
    Checkpoint,
    CheckpointWrite
} from '@mi8y/cds-langgraph-persistence';

entity Checkpoints : Checkpoint {
    writes : Composition of many CheckpointWrites
                 on writes.checkpoint = $self;
}

entity CheckpointWrites : CheckpointWrite {
    checkpoint : Association to Checkpoints
                     on  checkpoint.graphName = $self.checkpoint_graphName
                     and checkpoint.namespace = $self.checkpoint_namespace
                     and checkpoint.threadId  = $self.checkpoint_threadId
                     and checkpoint.id        = $self.checkpoint_id;
}
`;

const MEMORY_STORE_CDS_CONTENT = `namespace plugin.langgraph.persistence;

using { StoreItem, StoreItemField } from '@mi8y/cds-langgraph-persistence';

entity StoreItems : StoreItem {
    fields : Composition of many StoreItemFields
                 on fields.item = $self;
}

entity StoreItemFields : StoreItemField {
    item      : Association to StoreItems
                    on  item.graphName = $self.graphName
                    and item.namespace = $self.namespace
                    and item.id = $self.id;
    embedding : Vector(1536); // IMPORTANT: The field name must be "embedding". // NOTE: configure the embedding size based on the model used for generating embeddings
}
`;

async function writeCdsFile(cdsFileRelPath, cdsContent, description) {
  const cdsFileAbsPath = cds.utils.path.join(cds.root, cdsFileRelPath);

  if (!cds.utils.fs.existsSync(cdsFileAbsPath)) {
    await cds.utils.write(cdsContent).to(cdsFileAbsPath);
    LOG.info(`Added ${description}: '${cdsFileRelPath}'`);
  } else {
    LOG.info(`${description} already exists: '${cdsFileRelPath}'`);
  }
}

async function addCheckpointerEntities() {
  const srvRelPath = cds.env.folders?.srv || "srv/";
  const cdsFileRelPath = cds.utils.path.join(
    srvRelPath,
    "langgraph-checkpointer.cds",
  );
  await writeCdsFile(
    cdsFileRelPath,
    CHECKPOINTER_CDS_CONTENT,
    "LangGraph checkpointer entities",
  );
}

async function addMemoryStoreEntities() {
  const srvRelPath = cds.env.folders?.srv || "srv/";
  const cdsFileRelPath = cds.utils.path.join(
    srvRelPath,
    "langgraph-memory-store.cds",
  );
  await writeCdsFile(
    cdsFileRelPath,
    MEMORY_STORE_CDS_CONTENT,
    "LangGraph memory store entities",
  );
}

class AddLangGraphCheckpointerPlugin extends cds.add.Plugin {
  static help() {
    return "LangGraph checkpointer storage";
  }

  async run() {
    await addCheckpointerEntities();
  }
}

class AddLangGraphMemoryStorePlugin extends cds.add.Plugin {
  static help() {
    return "LangGraph memory store";
  }

  async run() {
    await addMemoryStoreEntities();
  }
}

class AddLangGraphPersistencePlugin extends cds.add.Plugin {
  static help() {
    return "LangGraph persistence alias; adds checkpointer and memory store";
  }

  async run() {
    await addCheckpointerEntities();
    await addMemoryStoreEntities();
  }
}

module.exports = {
  AddLangGraphCheckpointerPlugin,
  AddLangGraphMemoryStorePlugin,
  AddLangGraphPersistencePlugin,
};
