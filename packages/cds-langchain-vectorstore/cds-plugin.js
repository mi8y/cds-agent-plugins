const cds = require("@sap/cds");

const LOG = cds.log("cds-langchain-vectorstore");

// Register the 'langchain-vectorstore' plugin for the 'cds add' command
cds.add?.register(
  "langchain-vectorstore",
  require("./lib/add").AddLangChainVectorstorePlugin,
);

cds.on("loaded", (model) => {
  if (!model.definitions["plugin.langchain.vectorstore.Documents"]) {
    LOG.warn(
      `Detected '@mi8y/cds-langchain-vectorstore' CDS plugin installation, but no default entities found in the model. ` +
        `Did you forget to run 'cds add langchain-vectorstore' after installing the package? ` +
        `If using custom entity names, pass them via 'CdsVectorStoreConfig'.`,
    );
  }
});
