const cds = require("@sap/cds");

const LOG = cds.log("cds-langchain-vectorstore");

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
      await cds.utils
        .write(
          `
          using from '@mi8y/cds-langchain-vectorstore';
          `,
        )
        .to(cdsFileAbsPath);
      LOG.info(
        `Added import of LangChain vector store entities: '${cdsFileRelPath}'`,
      );
    } else {
      LOG.info(
        `CDS file importing LangChain vector store entities already exists: '${cdsFileRelPath}'`,
      );
    }
  }
}
module.exports = { AddLangChainVectorstorePlugin };
