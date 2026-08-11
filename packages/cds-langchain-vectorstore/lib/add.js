const cds = require("@sap/cds");

const LOG = cds.log("cds-langchain-vectorstore");

const DEFAULT_CDS_CONTENT = `namespace plugin.langchain.vectorstore;

using { managed } from '@sap/cds/common';
using { VectorDocument, VectorDocumentMetadata } from '@mi8y/cds-langchain-vectorstore';

entity Documents : managed, VectorDocument {
    embedding   : Vector(1536); // IMPORTANT: The field name must be "embedding". // NOTE: The vector dimension must match the embedding model used
    metadata    : Composition of many DocumentMetadata // IMPORTANT: The composition must be named "metadata"
                      on metadata.document = $self;
}

entity DocumentMetadata : VectorDocumentMetadata {
    key document : Association to Documents;
}
`;

class AddLangChainVectorstorePlugin extends cds.add.Plugin {
  static help() {
    return "LangChain vector store — checkpoint & memory storage";
  }

  async run() {
    const dbRelPath = cds.env.folders?.db || "db/";

    const cdsFileRelPath = cds.utils.path.join(
      dbRelPath,
      "langchain-vectorstore.cds",
    );
    const cdsFileAbsPath = cds.utils.path.join(cds.root, cdsFileRelPath);

    if (!cds.utils.fs.existsSync(cdsFileAbsPath)) {
      await cds.utils.write(DEFAULT_CDS_CONTENT).to(cdsFileAbsPath);
      LOG.info(`Added LangChain vector store entities: '${cdsFileRelPath}'`);
    } else {
      LOG.info(
        `CDS file with LangChain vector store entities already exists: '${cdsFileRelPath}'`,
      );
    }
  }
}
module.exports = { AddLangChainVectorstorePlugin };
