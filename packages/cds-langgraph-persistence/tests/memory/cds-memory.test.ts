/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  CdsMemoryStore,
  DEFAULT_FQN_ENTITY_STORE_ITEM_FIELDS,
  DEFAULT_FQN_ENTITY_STORE_ITEMS,
} from "@/memory/cds-memory";
import { Embeddings } from "@langchain/core/embeddings";
import { InvalidNamespaceError } from "@langchain/langgraph-checkpoint";
import cds from "@sap/cds";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Mock embeddings helper
// ---------------------------------------------------------------------------
const createMockEmbedding = (dims: number, asEmpty: boolean) => {
  const EMPTY_VECTOR = new Array(dims).fill(0);

  const makeVector = (text: string, index: number): number[] => {
    if (asEmpty) return [...EMPTY_VECTOR];
    return new Array(dims)
      .fill(0)
      .map((_, i) =>
        Math.sin((text.charCodeAt(i % text.length) + index) * 0.1),
      );
  };

  class MockEmbeddings extends Embeddings {
    calls: string[][] = [];

    async embedQuery(document: string): Promise<number[]> {
      this.calls.push([document]);
      return makeVector(document, 0);
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
      this.calls.push(documents);
      return documents.map((doc, idx) => makeVector(doc, idx));
    }
  }

  return new MockEmbeddings({}) as MockEmbeddings;
};

describe("CdsMemoryStore", () => {
  let store: CdsMemoryStore;

  beforeAll(async () => {
    const cdsFilePath = fileURLToPath(
      import.meta.resolve("./model.cds", import.meta.url),
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
    store = new CdsMemoryStore({ name: "test-store" });
    await DELETE.from(DEFAULT_FQN_ENTITY_STORE_ITEMS);
    await DELETE.from(DEFAULT_FQN_ENTITY_STORE_ITEM_FIELDS);
  });

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------
  describe("CRUD Operations", () => {
    it("should store and retrieve a simple item", async () => {
      const namespace = ["crud", "simple"];
      const key = "item1";
      const value = { foo: "bar", num: 42 };

      await store.put(namespace, key, value);
      const result = await store.get(namespace, key);

      expect(result).toEqual({
        value: { foo: "bar", num: 42 },
        key: "item1",
        namespace: ["crud", "simple"],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should update an existing item", async () => {
      const namespace = ["crud", "update"];
      const key = "item2";
      const originalValue = { foo: "bar" };
      const updatedValue = { foo: "baz", extra: 123 };

      await store.put(namespace, key, originalValue);
      const originalItem = await store.get(namespace, key);

      await store.put(namespace, key, updatedValue);
      const updatedItem = await store.get(namespace, key);

      expect(originalItem?.value).toEqual(originalValue);
      expect(updatedItem?.value).toEqual(updatedValue);
      expect(updatedItem?.updatedAt.getTime()).toBeGreaterThan(
        originalItem?.updatedAt.getTime() || 0,
      );
    });

    it("should delete an item", async () => {
      const namespace = ["crud", "delete"];
      const key = "item3";
      const value = { toDelete: true };

      await store.put(namespace, key, value);
      let item = await store.get(namespace, key);
      expect(item).toBeDefined();

      await store.delete(namespace, key);
      item = await store.get(namespace, key);
      expect(item).toBeNull();
    });

    it("should handle complex JSON values", async () => {
      const namespace = ["crud", "complex"];
      const key = "item4";
      const complexValue = {
        string: "test",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3, "four"],
        nested: {
          deep: {
            value: "nested data",
          },
        },
      };

      await store.put(namespace, key, complexValue);
      const retrieved = await store.get(namespace, key);

      expect(retrieved?.value).toEqual(complexValue);
    });

    it("should return null for non-existent items", async () => {
      const namespace = ["crud", "missing"];
      const key = "nope";

      const item = await store.get(namespace, key);

      expect(item).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Batch Operations
  // ---------------------------------------------------------------------------
  describe("Batch Operations", () => {
    it("should handle batch put and get operations", async () => {
      const operations = [
        { namespace: ["batch"], key: "item1", value: { data: "first" } },
        { namespace: ["batch"], key: "item2", value: { data: "second" } },
        { namespace: ["batch"], key: "item1" }, // get
      ];

      const results = await store.batch(operations);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeUndefined(); // put result
      expect(results[1]).toBeUndefined(); // put result
      expect(results[2]).toBeDefined(); // get result
      const getResult = results[2];
      if (getResult && typeof getResult === "object" && "value" in getResult) {
        expect(getResult.value).toEqual({ data: "first" });
      }
    });

    it("should handle batch with sequential put and delete operations", async () => {
      const operations = [
        { namespace: ["batch"], key: "item1", value: { data: "first" } },
        { namespace: ["batch"], key: "item2", value: { data: "second" } },
        { namespace: ["batch"], key: "item1", value: null }, // delete
      ];

      await store.batch(operations);

      const deleted = await store.get(["batch"], "item1");
      const kept = await store.get(["batch"], "item2");
      expect(deleted).toBeNull();
      expect(kept?.value).toEqual({ data: "second" });
    });

    it("should handle batch search operation", async () => {
      await store.put(["batch", "v1"], "doc1", { data: "hello" });
      await store.put(["batch", "v1"], "doc2", { data: "world" });

      const results = await store.batch([{ namespacePrefix: ["batch", "v1"] }]);

      expect(results).toHaveLength(1);
      const searchResults = results[0] as any[];
      expect(searchResults.length).toBe(2);
    });

    it("should handle batch listNamespaces operation", async () => {
      await store.put(["batch", "ns1"], "k1", { data: "a" });
      await store.put(["batch", "ns2"], "k2", { data: "b" });

      const results = await store.batch([
        {
          matchConditions: [],
          limit: 10,
          offset: 0,
        },
      ]);

      expect(results).toHaveLength(1);
      const namespaces = results[0] as string[][];
      expect(namespaces).toContainEqual(["batch", "ns1"]);
      expect(namespaces).toContainEqual(["batch", "ns2"]);
    });

    it("should handle batch delete operation", async () => {
      await store.put(["batch", "del"], "key1", { data: "to-delete" });
      const itemBefore = await store.get(["batch", "del"], "key1");
      expect(itemBefore).toBeDefined();

      await store.batch([
        { namespace: ["batch", "del"], key: "key1", value: null },
      ]);
      const itemAfter = await store.get(["batch", "del"], "key1");
      expect(itemAfter).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Namespace Listing
  // ---------------------------------------------------------------------------
  describe("Namespace Listing", () => {
    beforeEach(async () => {
      await store.put(["a", "b", "c"], "1", { value: 1 });
      await store.put(["a", "b", "d"], "2", { value: 2 });
      await store.put(["x", "y", "z"], "3", { value: 3 });
    });

    it("should list all namespaces", async () => {
      const result = await store.listNamespaces({});

      expect(result).toEqual([
        ["a", "b", "c"],
        ["a", "b", "d"],
        ["x", "y", "z"],
      ]);
    });

    it("should filter namespaces by prefix", async () => {
      const result = await store.listNamespaces({ prefix: ["a"] });

      expect(result).toEqual([
        ["a", "b", "c"],
        ["a", "b", "d"],
      ]);
    });

    it("should apply maxDepth to listNamespaces results", async () => {
      const result = await store.listNamespaces({ maxDepth: 2 });

      expect(result).toEqual([
        ["a", "b"],
        ["x", "y"],
      ]);
    });

    it("should filter namespaces by suffix", async () => {
      const result = await store.listNamespaces({ suffix: ["c"] });

      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("should return empty array when no namespaces match", async () => {
      const result = await store.listNamespaces({ prefix: ["nonexistent"] });

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------
  describe("Search", () => {
    beforeEach(async () => {
      await store.put(["docs"], "doc1", {
        title: "JavaScript Guide",
        content: "Complete guide to JavaScript programming",
        category: "programming",
        difficulty: "beginner",
      });

      await store.put(["docs"], "doc2", {
        title: "TypeScript Handbook",
        content: "Advanced TypeScript programming techniques",
        category: "programming",
        difficulty: "intermediate",
      });

      await store.put(["docs"], "doc3", {
        title: "Python Basics",
        content: "Introduction to Python programming language",
        category: "programming",
        difficulty: "beginner",
      });

      await store.put(["recipes"], "recipe1", {
        title: "Chocolate Cake",
        content: "Delicious chocolate cake recipe",
        category: "dessert",
        difficulty: "easy",
      });
    });

    it("should return all results within the requested namespace", async () => {
      const results = await store.search(["docs"]);

      expect(results.length).toBe(3);
      expect(results.every((item) => item.namespace[0] === "docs")).toBe(true);

      const keys = results.map((item) => item.key).sort();
      expect(keys).toEqual(["doc1", "doc2", "doc3"]);
    });

    it("should apply limit and offset", async () => {
      const page1 = await store.search(["docs"], { limit: 2, offset: 0 });
      const page2 = await store.search(["docs"], { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeGreaterThanOrEqual(0);

      const page1Keys = page1.map((item) => item.key);
      const page2Keys = page2.map((item) => item.key);
      const overlap = page1Keys.filter((key) => page2Keys.includes(key));
      expect(overlap).toHaveLength(0);
    });

    it("should return empty array for non-existent namespace", async () => {
      const results = await store.search(["nonexistent"]);
      expect(results).toEqual([]);
    });

    it("should search across multiple namespaces", async () => {
      const docsResults = await store.search(["docs"]);
      const recipesResults = await store.search(["recipes"]);

      expect(docsResults.length).toBe(3);
      expect(recipesResults.length).toBe(1);
      expect(recipesResults[0].value.title).toBe("Chocolate Cake");
    });

    it("should use default limit of 10 when not specified", async () => {
      // Put 12 items and verify only 10 are returned
      for (let i = 0; i < 12; i++) {
        await store.put(["bulk"], `item${i}`, { index: i });
      }
      const results = await store.search(["bulk"]);
      expect(results.length).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Search — Full-Text (no embedding configured)
  // ---------------------------------------------------------------------------
  describe("Search — Full-Text (no embedding)", () => {
    beforeEach(async () => {
      await store.put(["docs"], "doc1", {
        title: "JavaScript Guide",
        content: "Complete guide to JavaScript programming",
        category: "programming",
        difficulty: "beginner",
      });

      await store.put(["docs"], "doc2", {
        title: "TypeScript Handbook",
        content: "Advanced TypeScript programming techniques",
        category: "programming",
        difficulty: "intermediate",
      });

      await store.put(["recipes"], "recipe1", {
        title: "Chocolate Cake",
        content: "Delicious chocolate cake recipe",
        category: "dessert",
        difficulty: "easy",
      });
    });

    it("should match items by query in field values", async () => {
      const results = await store.search(["docs"], {
        query: "JavaScript",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe("doc1");
    });

    it("should return empty array when query matches nothing", async () => {
      const results = await store.search(["docs"], {
        query: "nonexistent text nobody would write",
      });

      expect(results).toEqual([]);
    });

    it("should respect namespace prefix when searching with query", async () => {
      const results = await store.search(["docs"], {
        query: "cake",
      });

      // "cake" only appears in recipes namespace
      expect(results).toEqual([]);
    });

    it("should combine limit with query", async () => {
      const results = await store.search(["docs"], {
        query: "programming",
        limit: 1,
      });

      expect(results.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Search — Hybrid (full-text + vector with embedding)
  // ---------------------------------------------------------------------------
  describe("Search — Hybrid (full-text + vector)", () => {
    let embeddingStore: CdsMemoryStore;
    let mockEmbedding: ReturnType<typeof createMockEmbedding>;

    beforeEach(async () => {
      mockEmbedding = createMockEmbedding(1536, false);

      embeddingStore = new CdsMemoryStore({
        name: "test-store-hybrid",
        embeddings: mockEmbedding,
      });

      await embeddingStore.put(["docs"], "doc1", {
        title: "JavaScript Guide",
        content: "Complete guide to JavaScript programming",
      });

      await embeddingStore.put(["docs"], "doc2", {
        title: "TypeScript Handbook",
        content: "Advanced TypeScript programming techniques",
      });

      await embeddingStore.put(["recipes"], "recipe1", {
        title: "Chocolate Cake",
        content: "Delicious chocolate cake recipe",
      });
    });

    it("should embed field values on put", async () => {
      const callsAfterPut = mockEmbedding.calls.flat();
      // embedDocuments is called once per put, with all field values
      expect(callsAfterPut.length).toBeGreaterThanOrEqual(3);
    });

    it("should embed query text when query is provided", async () => {
      const callsBefore = mockEmbedding.calls.length;

      await embeddingStore.search(["docs"], { query: "JavaScript" });

      // The call verification is always visible
      expect(mockEmbedding.calls.length).toBe(callsBefore + 1);
      const lastCall = mockEmbedding.calls[mockEmbedding.calls.length - 1];
      expect(lastCall).toEqual(["JavaScript"]);
    });

    it("should not call embedQuery when query is absent", async () => {
      const callsBefore = mockEmbedding.calls.length;

      await embeddingStore.search(["docs"]);

      expect(mockEmbedding.calls.length).toBe(callsBefore);
    });

    it("should support search without query on embedding store", async () => {
      const results = await embeddingStore.search(["docs"]);

      expect(results.length).toBe(2);
      const keys = results.map((item) => item.key).sort();
      expect(keys).toEqual(["doc1", "doc2"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Search — Metadata Filter
  // ---------------------------------------------------------------------------
  describe("Search — Metadata Filter", () => {
    beforeEach(async () => {
      await store.put(["docs"], "doc1", {
        title: "JavaScript Guide",
        category: "programming",
        difficulty: "beginner",
      });

      await store.put(["docs"], "doc2", {
        title: "TypeScript Handbook",
        category: "programming",
        difficulty: "intermediate",
      });

      await store.put(["docs"], "doc3", {
        title: "Python Basics",
        category: "programming",
        difficulty: "beginner",
      });

      await store.put(["recipes"], "recipe1", {
        title: "Chocolate Cake",
        category: "dessert",
        difficulty: "easy",
      });
    });

    it("should filter by direct equality on a metadata field", async () => {
      const results = await store.search(["docs"], {
        filter: { difficulty: "beginner" },
      });

      expect(results.length).toBe(2);
      const keys = results.map((item) => item.key).sort();
      expect(keys).toEqual(["doc1", "doc3"]);
    });

    it("should filter by $eq operator", async () => {
      const results = await store.search(["docs"], {
        filter: { difficulty: { $eq: "intermediate" } },
      });

      expect(results.length).toBe(1);
      expect(results[0].key).toBe("doc2");
    });

    it("should filter by $ne operator", async () => {
      const results = await store.search(["docs"], {
        filter: { difficulty: { $ne: "beginner" } },
      });

      expect(results.length).toBe(1);
      expect(results[0].key).toBe("doc2");
    });

    it("should combine multiple filter keys with AND semantics", async () => {
      const results = await store.search(["docs"], {
        filter: { category: "programming", difficulty: "beginner" },
      });

      expect(results.length).toBe(2);
      const keys = results.map((item) => item.key).sort();
      expect(keys).toEqual(["doc1", "doc3"]);
    });

    it("should return empty array when filter matches nothing", async () => {
      const results = await store.search(["docs"], {
        filter: { difficulty: "expert" },
      });

      expect(results).toEqual([]);
    });

    it("should respect namespace prefix when filtering", async () => {
      const results = await store.search(["recipes"], {
        filter: { category: "programming" },
      });

      expect(results).toEqual([]);
    });

    it("should combine filter with limit", async () => {
      const results = await store.search(["docs"], {
        filter: { category: "programming" },
        limit: 1,
      });

      expect(results.length).toBe(1);
    });

    it("should filter by $in operator", async () => {
      const results = await store.search(["docs"], {
        filter: { difficulty: { $in: ["beginner", "expert"] } },
      });

      expect(results.length).toBe(2);
      const keys = results.map((item) => item.key).sort();
      expect(keys).toEqual(["doc1", "doc3"]);
    });

    it("should filter by $notIn operator", async () => {
      await store.put(["docs"], "doc4", {});
      const results = await store.search(["docs"], {
        filter: { difficulty: { $notIn: ["beginner", "intermediate"] } },
      });

      // doc4 has no difficulty field -> it is not in the excluded set, but
      // $notIn requires the field to exist, so doc4 is excluded.
      expect(results.length).toBe(0);
    });

    it("should filter numeric field values", async () => {
      await store.put(["docs"], "num1", { priority: 1 });
      await store.put(["docs"], "num2", { priority: 2 });

      const results = await store.search(["docs"], {
        filter: { priority: 1 },
      });

      expect(results.length).toBe(1);
      expect(results[0].key).toBe("num1");
    });

    it("should filter boolean field values", async () => {
      await store.put(["docs"], "bool1", { active: true });
      await store.put(["docs"], "bool2", { active: false });

      const results = await store.search(["docs"], {
        filter: { active: false },
      });

      expect(results.length).toBe(1);
      expect(results[0].key).toBe("bool2");
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling (namespace validation)
  // ---------------------------------------------------------------------------
  describe("Error Handling", () => {
    const doc = { foo: "bar" };

    it("should reject empty namespace on put", async () => {
      await expect(store.put([], "foo", doc)).rejects.toThrow(
        InvalidNamespaceError,
      );
    });

    it("should reject namespace labels with periods", async () => {
      await expect(
        store.put(["the", "thing.about"], "foo", doc),
      ).rejects.toThrow(InvalidNamespaceError);
    });

    it("should reject empty namespace labels", async () => {
      await expect(store.put(["some", "fun", ""], "foo", doc)).rejects.toThrow(
        InvalidNamespaceError,
      );
    });

    it("should reject non-string namespace labels", async () => {
      await expect(
        store.put(["valid", 123 as unknown as string], "foo", doc),
      ).rejects.toThrow(InvalidNamespaceError);
    });

    it("should reject reserved 'langgraph' root namespace", async () => {
      await expect(store.put(["langgraph", "foo"], "bar", doc)).rejects.toThrow(
        InvalidNamespaceError,
      );
    });

    it("should allow 'langgraph' in non-root position", async () => {
      await store.put(["foo", "langgraph", "foo"], "bar", doc);
      const result = await store.get(["foo", "langgraph", "foo"], "bar");
      expect(result?.value).toEqual(doc);
    });
  });
});
