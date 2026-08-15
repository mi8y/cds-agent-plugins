import type { VectorDocument, VectorDocumentMetadata } from "#cds-models/index";
import { Document, DocumentInterface } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { maximalMarginalRelevance } from "@langchain/core/utils/math";
import {
  MaxMarginalRelevanceSearchOptions,
  VectorStore,
} from "@langchain/core/vectorstores";
import { readParentsWithChildren } from "@mi8y/cds-agent-utils";
import cds from "@sap/cds";
import * as utils from "./utils";

const LOG = cds.log("cds-langchain-vectorstore");

export const DEFAULT_FQN_ENTITY_DOCUMENTS =
  "plugin.langchain.vectorstore.Documents";
export const DEFAULT_FQN_ENTITY_DOCUMENT_METADATA =
  "plugin.langchain.vectorstore.DocumentMetadata";

export type CdsVectorStoreConfig = {
  name: string;
  threshold?: number;
  fqnDocumentsEntity?: string;
  fqnDocumentMetadataEntity?: string;
};

export class CDSVectorStore extends VectorStore {
  declare FilterType: utils.MetadataFilter;

  // Name of the vector store - used to differentiate between multiple vector stores in the same table
  #storeName: string;

  #searchThreshold: number;

  // Fully qualified name of the vector document entity
  #fqnVectorDocument: string;

  // Fully qualified name of the vector document metadata entity
  #fqnVectorDocumentMetadata: string;

  constructor(embeddings: EmbeddingsInterface, config: CdsVectorStoreConfig) {
    super(embeddings, config);
    this.#storeName = config.name;
    this.#searchThreshold = config.threshold ?? 0.75;
    this.#fqnVectorDocument =
      config.fqnDocumentsEntity ?? DEFAULT_FQN_ENTITY_DOCUMENTS;
    this.#fqnVectorDocumentMetadata =
      config.fqnDocumentMetadataEntity ?? DEFAULT_FQN_ENTITY_DOCUMENT_METADATA;
  }

  _vectorstoreType(): string {
    return "cds";
  }

  async addVectors(
    vectors: number[][],
    documents: DocumentInterface[],
  ): Promise<string[]> {
    if (vectors.length !== documents.length) {
      throw new Error("Vectors and documents must have the same length");
    }

    const cdsDocuments = documents.map((doc, idx) =>
      utils.mapDocumentToCds(doc, vectors[idx], this.#storeName),
    );

    const documentIds = cdsDocuments.map((doc) => doc.documentId as string);
    const allMetadata = documents.flatMap((doc, idx) =>
      utils.mapDocumentMetadataToCds(
        doc.metadata ?? {},
        documentIds[idx],
        this.#storeName,
      ),
    );

    // first delete any existing document metadata
    await DELETE.from(this.#fqnVectorDocumentMetadata).where({
      storeName: this.#storeName,
      documentId: { in: documentIds },
    });

    // then update/insert the documents
    await UPSERT.into(this.#fqnVectorDocument).entries(cdsDocuments);

    // insert the composition metadata
    if (allMetadata.length > 0) {
      await INSERT.into(this.#fqnVectorDocumentMetadata).entries(allMetadata);
    }

    LOG.debug(
      `Added ${cdsDocuments.length} documents to store ${this.#storeName}`,
    );

    return documentIds;
  }

  async addDocuments(documents: DocumentInterface[]): Promise<string[]> {
    const texts = documents.map(({ pageContent }) => pageContent);
    return this.addVectors(
      await this.embeddings.embedDocuments(texts),
      documents,
    );
  }

  async delete(params?: { documentIds: string[] }): Promise<void> {
    const { documentIds } = params ?? {};

    let query = DELETE.from(this.#fqnVectorDocument).where({
      storeName: this.#storeName,
    });

    // If documentIds are provided, add a condition to delete only those documents
    if (documentIds) {
      query = query.where({
        documentId: { in: documentIds },
      });
    }

    // Execute the query
    await query;

    LOG.debug(
      `Deleted documents from store ${this.#storeName} with ids: ${documentIds?.join(", ")}`,
    );
  }

  async #query(
    embedding: number[],
    k: number,
    filter?: this["FilterType"],
  ): Promise<
    {
      document: VectorDocument;
      metadata: VectorDocumentMetadata[];
      similarity: number;
    }[]
  > {
    // @ts-expect-error: The `expr` function is not recognized by TypeScript, but it is available in the runtime environment.
    const { expr } = cds.ql;

    // build the embedding string for the query
    let embeddingStr = utils.serializeEmbedding(embedding);
    if (cds.requires.db.kind === "hana") {
      embeddingStr = `to_real_vector(${embeddingStr})`;
    }

    const metadataWhere = utils.mapMetadataFilterToCdsWhere(
      this.#fqnVectorDocumentMetadata,
      filter,
      this.#storeName,
    );

    const relationProperty = "metadata" as const;
    type ParentDocument = VectorDocument & {
      cosine_similarity?: number;
    };
    type MetadataEntry = VectorDocumentMetadata;
    type HydratedDocument = ParentDocument & {
      [relationProperty]: MetadataEntry[];
    };

    const { result } = await readParentsWithChildren<
      ParentDocument,
      MetadataEntry
    >({
      match: [
        { parent: "storeName", child: "storeName" },
        { parent: "documentId", child: "documentId" },
      ],
      readParents: async () =>
        SELECT.from(this.#fqnVectorDocument)
          .columns([
            "storeName",
            "documentId",
            "pageContent",
            "embedding",
            expr`cosine_similarity(embedding, ${embeddingStr})`,
          ])
          .where(
            expr`storeName = ${this.#storeName} and cosine_similarity(embedding, ${embeddingStr}) > ${this.#searchThreshold}`,
          )
          .where(metadataWhere ? expr(metadataWhere) : undefined)
          .limit(k)
          .orderBy("cosine_similarity desc"),
      readChildren: async ({ where }) => {
        return await SELECT.from(this.#fqnVectorDocumentMetadata).where(where);
      },
      relationProperty,
    });

    return (result as unknown as HydratedDocument[]).map(
      (cdsDoc: HydratedDocument) => ({
        document: cdsDoc,
        metadata: cdsDoc[relationProperty] ?? [],
        similarity: cdsDoc["cosine_similarity"] ?? 0,
      }),
    );
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: this["FilterType"],
  ): Promise<[Document, number][]> {
    const res = await this.#query(query, k, filter);
    return res.map(({ document: cdsDoc, metadata, similarity }) => [
      utils.mapDocumentFromCds(cdsDoc, metadata),
      similarity,
    ]);
  }

  async maxMarginalRelevanceSearch(
    query: string,
    options: MaxMarginalRelevanceSearchOptions<this["FilterType"]>,
  ): Promise<DocumentInterface[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);

    const res = await this.#query(
      queryEmbedding,
      options.fetchK ?? options.k + 20,
      options.filter,
    );

    const embeddingList = res.map(({ document }) =>
      utils.deserializeEmbedding(document.embedding),
    );

    const mmrIndexes = maximalMarginalRelevance(
      queryEmbedding,
      embeddingList,
      options.lambda,
      options.k,
    );

    return mmrIndexes.map((idx) =>
      utils.mapDocumentFromCds(res[idx].document, res[idx].metadata),
    );
  }

  static async fromTexts(
    texts: string[],
    metadatas: object[] | object,
    embeddings: EmbeddingsInterface,
    config: CdsVectorStoreConfig,
  ): Promise<CDSVectorStore> {
    const docs: Document[] = texts.map((text, idx) => {
      const metadata = Array.isArray(metadatas) ? metadatas[idx] : metadatas;
      return new Document({
        pageContent: text,
        metadata,
      });
    });
    return CDSVectorStore.fromDocuments(docs, embeddings, config);
  }

  static async fromDocuments(
    docs: DocumentInterface[],
    embeddings: EmbeddingsInterface,
    config: CdsVectorStoreConfig,
  ): Promise<CDSVectorStore> {
    const instance = new this(embeddings, config);
    await instance.addDocuments(docs);
    return instance;
  }

  static async fromExistingIndex(
    embeddings: EmbeddingsInterface,
    config: CdsVectorStoreConfig,
  ): Promise<CDSVectorStore> {
    return new this(embeddings, config);
  }
}
