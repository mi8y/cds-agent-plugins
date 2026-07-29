/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DocumentMetadata_ as CdsDocumentMetadata,
  Documents as CdsDocuments,
  Document as CdsDocument,
} from "#cds-models/plugin/langchain/vectorstore";
import { Document, DocumentInterface } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { maximalMarginalRelevance } from "@langchain/core/utils/math";
import {
  MaxMarginalRelevanceSearchOptions,
  VectorStore,
} from "@langchain/core/vectorstores";
import cds from "@sap/cds";
import * as utils from "./utils";

const LOG = cds.log("cds-langchain-vectorstore");

export type CdsVectorStoreConfig = {
  name: string;
  threshold?: number;
};

export class CDSVectorStore extends VectorStore {
  declare FilterType: utils.MetadataFilter;

  #storeName: string;

  #searchThreshold: number;

  constructor(embeddings: EmbeddingsInterface, config: CdsVectorStoreConfig) {
    super(embeddings, config);
    this.#storeName = config.name;
    this.#searchThreshold = config.threshold ?? 0.75;
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
    const documentIds = cdsDocuments.map((doc) => doc.id as string);

    // first delete any existing document metadata
    await DELETE.from(CdsDocumentMetadata).where({
      document_storeName: this.#storeName,
      document_id: { in: documentIds },
    });

    // then update/insert the documents
    await UPSERT.into(CdsDocuments).entries(cdsDocuments);

    // explicitly insert the composition metadata
    const allMetadata = cdsDocuments.flatMap((doc) => doc.metadata ?? []);
    if (allMetadata.length > 0) {
      await INSERT.into(CdsDocumentMetadata).entries(allMetadata);
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

    let query = DELETE.from(CdsDocuments).where({ storeName: this.#storeName });

    // If documentIds are provided, add a condition to delete only those documents
    if (documentIds) {
      query = query.where({
        id: { in: documentIds },
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
  ): Promise<{ document: CdsDocument; similarity: number }[]> {
    // @ts-expect-error: The `expr` function is not recognized by TypeScript, but it is available in the runtime environment.
    const { expand, expr, ref, columns } = cds.ql;

    // build the embedding string for the query
    let embeddingStr = utils.serializeEmbedding(embedding);
    if (cds.requires.db.kind === "hana") {
      embeddingStr = `to_real_vector(${embeddingStr})`;
    }

    let query = SELECT.from(CdsDocuments)
      .columns([
        "storeName",
        "id",
        "pageContent",
        "embedding",
        expand(ref`metadata`, columns`name,value`),
        expr`cosine_similarity(embedding, ${embeddingStr})`,
      ])
      .where(
        expr`storeName = ${this.#storeName} and cosine_similarity(embedding, ${embeddingStr}) > ${this.#searchThreshold}`,
      )
      .limit(k);

    if (filter) {
      const cdsFilter = utils.mapMetadataFilterToCdsExpr(filter);
      query = query.where(`${cdsFilter}`);
    }

    const res = await query;
    if (!res || res.length === 0) {
      return [];
    }

    return res
      .map((cdsDoc) => ({
        document: cdsDoc,
        // @ts-expect-error alias property added during runtime
        similarity: cdsDoc["cosine_similarity"],
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: this["FilterType"],
  ): Promise<[Document, number][]> {
    const res = await this.#query(query, k, filter);
    return res.map(({ document: cdsDoc, similarity }) => [
      utils.mapDocumentFromCds(cdsDoc),
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

    return mmrIndexes.map((idx) => utils.mapDocumentFromCds(res[idx].document));
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
