import { DocumentInterface } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { SyntheticEmbeddings } from "@langchain/core/utils/testing";
import cds from "@sap/cds";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import {
  DocumentMetadata_,
  Documents,
} from "#cds-models/plugin/langchain/vectorstore";
import { CDSVectorStore } from "@/cds-vectorstore";

beforeAll(async () => {
  cds.root = fileURLToPath(
    import.meta.resolve("@mi8y/cds-langchain-vectorstore"),
  );

  const cdsFilePath = fileURLToPath(
    import.meta.resolve("@mi8y/cds-langchain-vectorstore/index.cds"),
  );

  const csn = await cds.load(cdsFilePath).then(cds.minify);
  cds.model = cds.compile.for.nodejs(csn);

  cds.requires.db = {
    kind: "sqlite",
    impl: "@cap-js/sqlite",
    credentials: { url: ":memory:" },
  };

  cds.db = await cds.connect.to("db");
  // @ts-ignore
  await cds.deploy(cdsFilePath, {}).to(cds.db);
});

afterAll(async () => {
  // @ts-ignore
  await cds.db.disconnect?.();
});

beforeEach(async () => {
  await DELETE.from(Documents).where({ storeName: "test" });
  await DELETE.from(DocumentMetadata_).where({ document_storeName: "test" });
  await DELETE.from(Documents).where({ storeName: "empty-store" });
  await DELETE.from(DocumentMetadata_).where({
    document_storeName: "empty-store",
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
  expect(results[0].pageContent).toBe("hello");
});

test("CDSVectorStore stores and retrieves document IDs", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });
  const store = new CDSVectorStore(embeddings, { name: "test" });

  const retriever = store.asRetriever({
    k: 2,
    filter: {
      namespace: { $lte: 2 },
    },
  });

  await retriever.addDocuments([
    { pageContent: "hello", metadata: { namespace: 1 }, id: "1" },
    { pageContent: "hello", metadata: { namespace: 2 }, id: "2" },
    { pageContent: "hello", metadata: { namespace: 3 }, id: "3" },
    { pageContent: "hello", metadata: { namespace: 4 }, id: "4" },
  ]);

  const results = await retriever.invoke("hello");

  expect(results).toHaveLength(2);
  const resultIds = results.map((r) => r.id).sort();
  expect(resultIds).toEqual(["1", "2"]);
});

test("CDSVectorStore as retriever can filter metadata", async () => {
  const embeddings = new SyntheticEmbeddings({
    vectorSize: 1536,
  });
  const store = new CDSVectorStore(embeddings, { name: "test" });

  const retriever = store.asRetriever({
    k: 2,
    filter: {
      namespace: { $lte: 2 },
    },
  });

  await retriever.addDocuments([
    { pageContent: "hello", metadata: { namespace: 1 } },
    { pageContent: "hello", metadata: { namespace: 2 } },
    { pageContent: "hello", metadata: { namespace: 3 } },
    { pageContent: "hello", metadata: { namespace: 4 } },
  ]);

  const results = await retriever.invoke("hello");

  expect(results).toHaveLength(2);
  const resultNamespaces = results
    .map((r) => r.metadata.namespace)
    .sort((a: number, b: number) => a - b);
  expect(resultNamespaces).toEqual([1, 2]);
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

    await DELETE.from(Documents).where({ storeName: "test" });
    await DELETE.from(DocumentMetadata_).where({ document_storeName: "test" });

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

    // B and C have similarity 1, A has similarity 0
    // A should not be present, B and C should be first (in any order since tied)
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
