import { describe, expect, test } from "vitest";
import * as utils from "@/utils";

describe("serializeEmbedding", () => {
  test("serializes number array to JSON-like string", () => {
    expect(utils.serializeEmbedding([1, 2, 3])).toBe("[1,2,3]");
  });

  test("serializes empty array", () => {
    expect(utils.serializeEmbedding([])).toBe("[]");
  });

  test("serializes single value", () => {
    expect(utils.serializeEmbedding([42])).toBe("[42]");
  });

  test("serializes float values", () => {
    expect(utils.serializeEmbedding([0.1, 0.5, 1.0])).toBe("[0.1,0.5,1]");
  });
});

describe("deserializeEmbedding", () => {
  test("deserializes JSON-like string to number array", () => {
    expect(utils.deserializeEmbedding("[1,2,3]")).toEqual([1, 2, 3]);
  });

  test("returns empty array for null", () => {
    expect(utils.deserializeEmbedding(null)).toEqual([]);
  });

  test("returns empty array for undefined", () => {
    expect(utils.deserializeEmbedding(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(utils.deserializeEmbedding("")).toEqual([]);
  });
});

describe("mapDocumentMetadataToCds", () => {
  test("maps metadata record to CDS metadata entries", () => {
    const result = utils.mapDocumentMetadataToCds(
      { key: "value", count: 42 },
      "doc-1",
      "store-1",
    );
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("key");
    expect(result[0].value).toBe('"value"');
    expect(result[0].documentId).toBe("doc-1");
    expect(result[0].storeName).toBe("store-1");
    expect(result[1].name).toBe("count");
    expect(result[1].value).toBe("42");
  });

  test("handles empty metadata", () => {
    const result = utils.mapDocumentMetadataToCds({}, "doc-1", "store-1");
    expect(result).toHaveLength(0);
  });
});

describe("mapDocumentMetadataFromCds", () => {
  test("maps CDS metadata entries back to record", () => {
    const entries = [
      {
        name: "key",
        value: '"value"',
        documentId: "doc-1",
        storeName: "store-1",
      },
      {
        name: "count",
        value: "42",
        documentId: "doc-1",
        storeName: "store-1",
      },
    ];
    const result = utils.mapDocumentMetadataFromCds(entries);
    expect(result).toEqual({ key: "value", count: 42 });
  });

  test("skips entries with empty name or value", () => {
    const entries = [
      { name: "", value: "42", documentId: "d", storeName: "s" },
      { name: "key", value: "", documentId: "d", storeName: "s" },
      {
        name: "valid",
        value: '"ok"',
        documentId: "d",
        storeName: "s",
      },
    ];
    const result = utils.mapDocumentMetadataFromCds(entries);
    expect(result).toEqual({ valid: "ok" });
  });

  test("handles empty array", () => {
    const result = utils.mapDocumentMetadataFromCds([]);
    expect(result).toEqual({});
  });
});

describe("mapDocumentFromCds", () => {
  test("maps CDS document to langchain document", () => {
    const cdsDoc = {
      documentId: "doc-1",
      storeName: "store-1",
      pageContent: "hello world",
      embedding: "[1,2,3]",
    };
    const result = utils.mapDocumentFromCds(cdsDoc, [
      {
        name: "key",
        value: '"value"',
        documentId: "doc-1",
        storeName: "store-1",
      },
    ]);
    expect(result.id).toBe("doc-1");
    expect(result.pageContent).toBe("hello world");
    expect(result.metadata).toEqual({ key: "value" });
  });

  test("handles null pageContent", () => {
    const cdsDoc = {
      id: "doc-1",
      storeName: "store-1",
      pageContent: null,
      embedding: "[1,2,3]",
    };
    const result = utils.mapDocumentFromCds(cdsDoc);
    expect(result.pageContent).toBe("");
  });

  test("handles undefined pageContent", () => {
    const cdsDoc = {
      id: "doc-1",
      storeName: "store-1",
      embedding: "[1,2,3]",
    };
    const result = utils.mapDocumentFromCds(cdsDoc);
    expect(result.pageContent).toBe("");
  });
});

describe("mapMetadataFilterToDocumentWhere", () => {
  test("maps direct equality filter", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        { priority: 3 },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'priority' and value = '3')",
    );
  });

  test("maps $eq operator", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          priority: { $eq: 5 },
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'priority' and value = '5')",
    );
  });

  test("maps $ne operator with key existence and exclusion", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          priority: { $ne: 5 },
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'priority') and documentId not in (select documentId from MyMetadata where storeName = 'store-1' and (name = 'priority' and value = '5'))",
    );
  });

  test("joins multiple filter keys with AND semantics", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          color: "red",
          shape: "circle",
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'color' and value = '\"red\"') and documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'shape' and value = '\"circle\"')",
    );
  });

  test("supports multiple operators on one field", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          priority: { $eq: 3, $ne: 9 },
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'priority' and value = '3') and documentId not in (select documentId from MyMetadata where storeName = 'store-1' and (name = 'priority' and value = '9'))",
    );
  });

  test("maps $in operator", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          priority: { $in: [1, 3, 5] },
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'priority' and value in ('1', '3', '5'))",
    );
  });

  test("maps $notIn operator with key existence and exclusion", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          priority: { $notIn: [2, 4] },
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'priority') and documentId not in (select documentId from MyMetadata where storeName = 'store-1' and (name = 'priority' and value in ('2', '4')))",
    );
  });

  test("ignores undefined filter values", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          color: "red",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unused: undefined as any,
        },
        "store-1",
      ),
    ).toBe(
      "documentId in (select documentId from MyMetadata where storeName = 'store-1' and name = 'color' and value = '\"red\"')",
    );
  });

  test("throws on unsupported operator", () => {
    expect(() =>
      utils.mapMetadataFilterToCdsWhere(
        "MyMetadata",
        {
          // @ts-expect-error - testing unsupported operator
          priority: { $regex: "test" },
        },
        "store-1",
      ),
    ).toThrow("Unsupported operator: $regex");
  });

  test("returns undefined when filter is absent", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere("MyMetadata", undefined, "store-1"),
    ).toBe(undefined);
  });
});
