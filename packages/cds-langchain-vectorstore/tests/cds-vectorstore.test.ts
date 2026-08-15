import { Embeddings } from "@langchain/core/embeddings";
import { SyntheticEmbeddings } from "@langchain/core/utils/testing";
import cds from "@sap/cds";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { CDSVectorStore } from "@/cds-vectorstore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const DOCUMENTS_ENTITY = "plugin.langchain.vectorstore.Documents";
const DOCUMENT_METADATA_ENTITY =
  "plugin.langchain.vectorstore.DocumentMetadata";

const CUSTOM_DOCUMENTS_ENTITY = "my.custom.vectorstore.CustomDocuments";
const CUSTOM_DOCUMENT_METADATA_ENTITY =
  "my.custom.vectorstore.CustomDocumentMetadata";

beforeAll(async () => {
  cds.root = pkgRoot;

  const defaultFile = resolve(__dirname, "model.cds");
  const customFile = resolve(__dirname, "model-custom.cds");

  const defaultCsn = cds.minify(await cds.load(defaultFile));
  const customCsn = cds.minify(await cds.load(customFile));

  cds.model = cds.compile.for.nodejs({
    definitions: { ...defaultCsn.definitions, ...customCsn.definitions },
  });

  cds.requires.db = {
    kind: "sqlite",
    impl: "@cap-js/sqlite",
    credentials: { url: ":memory:" },
  };

  cds.db = await cds.connect.to("db");

  // @ts-expect-error - The `deploy` method is not recognized by TypeScript, but it is available in the runtime environment.
  await cds.deploy(defaultFile, {}).to(cds.db);
  // @ts-expect-error - The `deploy` method is not recognized by TypeScript, but it is available in the runtime environment.
  await cds.deploy(customFile, {}).to(cds.db);
});

afterAll(async () => {
  // @ts-expect-error - The `disconnect` method is not recognized by TypeScript, but it is available in the runtime environment.
  await cds.db.disconnect?.();
});

beforeEach(async () => {
  await DELETE.from(DOCUMENTS_ENTITY).where({ storeName: "test" });
  await DELETE.from(DOCUMENT_METADATA_ENTITY).where({
    storeName: "test",
  });
  await DELETE.from(DOCUMENTS_ENTITY).where({ storeName: "empty-store" });
  await DELETE.from(DOCUMENT_METADATA_ENTITY).where({
    storeName: "empty-store",
  });
  await DELETE.from(CUSTOM_DOCUMENTS_ENTITY).where({ storeName: "test" });
  await DELETE.from(CUSTOM_DOCUMENT_METADATA_ENTITY).where({
    storeName: "test",
  });
});

test("CDSVectorStore with external ids", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { a: 1 } },
    { pageContent: "hi", metadata: { a: 1 } },
    { pageContent: "bye", metadata: { a: 1 } },
    { pageContent: "what's this", metadata: { a: 1 } },
  ]);

  const results = await store.similaritySearch("hello", 1);

  expect(results).toHaveLength(1);
  expect(results[0].metadata.a).toBe(1);
});

test("CDSVectorStore stores and retrieves document IDs", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });
  const store = new CDSVectorStore(embeddings, { name: "test" });

  const retriever = store.asRetriever({
    k: 2,
    filter: {
      namespace: { $eq: 1 },
    },
  });

  await retriever.addDocuments([
    { pageContent: "hello", metadata: { namespace: 1 }, id: "1" },
    { pageContent: "hello", metadata: { namespace: 1 }, id: "2" },
    { pageContent: "hello", metadata: { namespace: 3 }, id: "3" },
    { pageContent: "hello", metadata: { namespace: 3 }, id: "4" },
  ]);

  const results = await retriever.invoke("hello");

  expect(results).toHaveLength(2);
  const resultIds = results.map((r) => r.id).sort();
  expect(resultIds).toEqual(["1", "2"]);
  results.forEach((result) => {
    expect(result.metadata.namespace).toBe(1);
  });
});

test("CDSVectorStore as retriever can filter metadata", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });
  const store = new CDSVectorStore(embeddings, { name: "test" });

  const retriever = store.asRetriever({
    k: 2,
    filter: {
      namespace: { $ne: 3 },
    },
  });

  await retriever.addDocuments([
    { pageContent: "hello", metadata: { namespace: 1 } },
    { pageContent: "hello", metadata: { namespace: 1 } },
    { pageContent: "hello", metadata: { namespace: 3 } },
    { pageContent: "hello", metadata: { namespace: 3 } },
  ]);

  const results = await retriever.invoke("hello");

  expect(results).toHaveLength(2);
  const resultNamespaces = results
    .map((r) => r.metadata.namespace)
    .sort((a: number, b: number) => a - b);
  expect(resultNamespaces).toEqual([1, 1]);
});

test("CDSVectorStore with max marginal relevance", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });
  const store = new CDSVectorStore(embeddings, {
    name: "test",
  });

  await store.addDocuments([
    { pageContent: "hello", metadata: { a: 1 } },
    { pageContent: "hi", metadata: { a: 1 } },
    { pageContent: "bye", metadata: { a: 1 } },
    { pageContent: "what's this", metadata: { a: 1 } },
  ]);

  const results = await store.maxMarginalRelevanceSearch("hello", { k: 3 });

  expect(results).toHaveLength(2);
});

test("CDSVectorStore sorts results in descending order of similarity", async () => {
  const embeddings = new Map<string, number[]>([
    ["Document A", [0]],
    ["Document B", [1]],
    ["Document C", [2]],
    ["Document D", [3]],
  ]);

  class ContrivedEmbeddings extends Embeddings {
    async embedDocuments(documents: string[]): Promise<number[][]> {
      return documents.map((text) => embeddings.get(text)!);
    }

    async embedQuery(text: string): Promise<number[]> {
      if (!embeddings.has(text)) {
        throw new Error(`Document ${text} not found`);
      }
      return embeddings.get(text)!;
    }
  }

  function* permutations<T>(items: T[]): Generator<T[]> {
    if (items.length <= 1) {
      yield [...items];
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const rest = [...items.slice(0, i), ...items.slice(i + 1)];
      for (const perm of permutations(rest)) {
        yield [items[i], ...perm];
      }
    }
  }

  for (const documentOrdering of permutations([
    "Document A",
    "Document B",
    "Document C",
  ])) {
    const store = new CDSVectorStore(new ContrivedEmbeddings({}), {
      name: "test",
    });

    await DELETE.from(DOCUMENTS_ENTITY).where({ storeName: "test" });
    await DELETE.from(DOCUMENT_METADATA_ENTITY).where({
      storeName: "test",
    });

    for (const document of documentOrdering) {
      await store.addDocuments([{ pageContent: document, metadata: { a: 1 } }]);
    }

    const results = await store.similaritySearchWithScore("Document D", 3);

    const resultOrder = results.map(([doc]) =>
      doc.pageContent === "Document A"
        ? "Document A"
        : doc.pageContent === "Document B"
          ? "Document B"
          : "Document C",
    );

    expect(resultOrder).not.toContain("Document A");
    expect(resultOrder).toContain("Document B");
    expect(resultOrder).toContain("Document C");
  }
});

test("CDSVectorStore delete by ids", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  const ids = await store.addDocuments([
    { pageContent: "hello", metadata: { a: 1 }, id: "doc1" },
    { pageContent: "hi", metadata: { a: 1 }, id: "doc2" },
    { pageContent: "bye", metadata: { a: 1 }, id: "doc3" },
  ]);

  expect(ids).toHaveLength(3);

  await store.delete({ documentIds: ["doc1", "doc3"] });

  const results = await store.similaritySearch("hi", 2);
  expect(results).toHaveLength(1);
  expect(results[0].pageContent).toBe("hi");
  expect(results[0].id).toBe("doc2");
});

test("CDSVectorStore fromExistingIndex", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = await CDSVectorStore.fromExistingIndex(embeddings, {
    name: "empty-store",
  });

  const results = await store.similaritySearch("hello", 1);
  expect(results).toHaveLength(0);
});

test("CDSVectorStore fromTexts static method", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = await CDSVectorStore.fromTexts(
    ["hello", "world"],
    { a: 1 },
    embeddings,
    { name: "test", threshold: 0 },
  );

  const results = await store.similaritySearch("hello", 2);
  expect(results).toHaveLength(2);
  expect(results[0].metadata.a).toBe(1);
  expect(results[1].metadata.a).toBe(1);
});

test("CDSVectorStore fromTexts with per-document metadata array", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = await CDSVectorStore.fromTexts(
    ["hello", "world"],
    [{ a: 1 }, { a: 2 }],
    embeddings,
    { name: "test", threshold: 0 },
  );

  const results = await store.similaritySearch("hello", 2);
  expect(results).toHaveLength(2);
  const metaValues = results.map((r) => r.metadata.a).sort();
  expect(metaValues).toEqual([1, 2]);
});

test("CDSVectorStore fromDocuments static method", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = await CDSVectorStore.fromDocuments(
    [
      { pageContent: "hello", metadata: { a: 1 }, id: "doc-a" },
      { pageContent: "world", metadata: { a: 2 }, id: "doc-b" },
    ],
    embeddings,
    { name: "test", threshold: 0 },
  );

  const results = await store.similaritySearchWithScore("hello", 2);
  expect(results).toHaveLength(2);
  const ids = results.map(([doc]) => doc.id).sort();
  expect(ids).toEqual(["doc-a", "doc-b"]);
});

test("CDSVectorStore addVectors throws on length mismatch", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await expect(
    store.addVectors(
      [[1, 2, 3]],
      [
        { pageContent: "hello", metadata: {} },
        { pageContent: "world", metadata: {} },
      ],
    ),
  ).rejects.toThrow("Vectors and documents must have the same length");
});

test("CDSVectorStore _vectorstoreType", () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });
  expect(store._vectorstoreType()).toBe("cds");
});

test("CDSVectorStore with metadata filter $eq operator", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { priority: 3 } },
    { pageContent: "hi", metadata: { priority: 5 } },
    { pageContent: "hey", metadata: { priority: 3 } },
  ]);

  const results = await store.similaritySearch("hello", 3, {
    priority: { $eq: 3 },
  });
  expect(results).toHaveLength(2);
  results.forEach((r) => expect(r.metadata.priority).toBe(3));
});

test("CDSVectorStore with metadata filter $ne operator", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { priority: 3 } },
    { pageContent: "hi", metadata: { priority: 5 } },
    { pageContent: "hey", metadata: { priority: 3 } },
    { pageContent: "missing", metadata: { tier: "gold" } },
  ]);

  const results = await store.similaritySearch("hello", 3, {
    priority: { $ne: 3 },
  });
  expect(results).toHaveLength(1);
  expect(results[0].metadata.priority).toBe(5);
});

test("CDSVectorStore with metadata filter unsupported operator throws", async () => {
  const embeddings = new SyntheticEmbeddings({ vectorSize: 1536 });
  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { status: "active" } },
  ]);

  await expect(
    store.similaritySearch("hello", 1, {
      status: { $regex: "test" } as any,
    }),
  ).rejects.toThrow("Unsupported operator: $regex");
});

test("CDSVectorStore with metadata filter $in operator", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { priority: 1 } },
    { pageContent: "hi", metadata: { priority: 3 } },
    { pageContent: "hey", metadata: { priority: 5 } },
  ]);

  const results = await store.similaritySearch("hello", 3, {
    priority: { $in: [1, 5] },
  });
  expect(results).toHaveLength(2);
  const priorities = results.map((r) => r.metadata.priority).sort();
  expect(priorities).toEqual([1, 5]);
});

test("CDSVectorStore with metadata filter $notIn operator", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { priority: 1 } },
    { pageContent: "hi", metadata: { priority: 3 } },
    { pageContent: "hey", metadata: { priority: 5 } },
  ]);

  const results = await store.similaritySearch("hello", 3, {
    priority: { $notIn: [1, 5] },
  });
  expect(results).toHaveLength(1);
  expect(results[0].metadata.priority).toBe(3);
});

test("CDSVectorStore with unmatched metadata filters returns no results", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { priority: 1 } },
    { pageContent: "hi", metadata: { priority: 3 } },
    { pageContent: "hey", metadata: { priority: 5 } },
  ]);

  // multiple filter keys must all match the same document
  const results = await store.similaritySearch("hello", 3, {
    priority: { $eq: 1 },
    tier: "gold",
  });

  expect(results).toHaveLength(0);
});

test("CDSVectorStore with multiple metadata filters uses AND semantics", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { priority: 1, tier: "gold" } },
    { pageContent: "hi", metadata: { priority: 1, tier: "silver" } },
    { pageContent: "hey", metadata: { priority: 2, tier: "gold" } },
  ]);

  const results = await store.similaritySearch("hello", 3, {
    priority: { $eq: 1 },
    tier: "gold",
  });

  expect(results).toHaveLength(1);
  expect(results[0].metadata).toEqual({ priority: 1, tier: "gold" });
});

test("CDSVectorStore metadata filter matches string values stored as JSON", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { tier: "gold" } },
    { pageContent: "hi", metadata: { tier: "silver" } },
  ]);

  const results = await store.similaritySearch("hello", 2, {
    tier: "gold",
  });

  expect(results).toHaveLength(1);
  expect(results[0].metadata.tier).toBe("gold");
});

test("CDSVectorStore with custom threshold", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const trackConfig = { name: "test", threshold: 0 };
  const store = new CDSVectorStore(embeddings, trackConfig);

  await store.addDocuments([
    { pageContent: "hello", metadata: { a: 1 } },
    { pageContent: "hi", metadata: { a: 1 } },
    { pageContent: "hey", metadata: { a: 1 } },
  ]);

  const results = await store.similaritySearch("hello", 5);
  expect(results).toHaveLength(3);
});

test("CDSVectorStore delete all documents in store", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, { name: "test" });

  await store.addDocuments([
    { pageContent: "hello", metadata: { a: 1 }, id: "d1" },
    { pageContent: "hi", metadata: { a: 1 }, id: "d2" },
  ]);

  let results = await store.similaritySearch("hello", 5);
  expect(results).toHaveLength(2);

  await store.delete();

  results = await store.similaritySearch("hello", 5);
  expect(results).toHaveLength(0);
});

test("CDSVectorStore with custom entity names", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });

  const store = new CDSVectorStore(embeddings, {
    name: "test",
    fqnDocumentsEntity: CUSTOM_DOCUMENTS_ENTITY,
    fqnDocumentMetadataEntity: CUSTOM_DOCUMENT_METADATA_ENTITY,
  });

  await store.addDocuments([
    { pageContent: "hello", metadata: { a: 1 } },
    { pageContent: "hi", metadata: { a: 1 } },
    { pageContent: "bye", metadata: { a: 1 } },
  ]);

  const results = await store.similaritySearch("hello", 2);
  expect(results).toHaveLength(2);

  const ids = await store.addDocuments([
    { pageContent: "custom-doc", metadata: { a: 1 }, id: "custom-1" },
    { pageContent: "custom-doc-2", metadata: { a: 1 }, id: "custom-2" },
  ]);

  expect(ids).toHaveLength(2);

  await store.delete({ documentIds: ["custom-1"] });

  const afterDelete = await store.similaritySearch("custom-doc", 1);
  expect(afterDelete).toHaveLength(1);
  expect(afterDelete[0].id).toBe("custom-2");
});
