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
    expect(result[0].document_id).toBe("doc-1");
    expect(result[0].document_storeName).toBe("store-1");
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
        document_id: "doc-1",
        document_storeName: "store-1",
      },
      {
        name: "count",
        value: "42",
        document_id: "doc-1",
        document_storeName: "store-1",
      },
    ];
    const result = utils.mapDocumentMetadataFromCds(entries);
    expect(result).toEqual({ key: "value", count: 42 });
  });

  test("skips entries with empty name or value", () => {
    const entries = [
      { name: "", value: "42", document_id: "d", document_storeName: "s" },
      { name: "key", value: "", document_id: "d", document_storeName: "s" },
      {
        name: "valid",
        value: '"ok"',
        document_id: "d",
        document_storeName: "s",
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
      id: "doc-1",
      storeName: "store-1",
      pageContent: "hello world",
      embedding: "[1,2,3]",
      metadata: [
        {
          name: "key",
          value: '"value"',
          document_id: "doc-1",
          document_storeName: "store-1",
        },
      ],
    };
    const result = utils.mapDocumentFromCds(cdsDoc);
    expect(result.id).toBe("doc-1");
    expect(result.pageContent).toBe("hello world");
    expect(result.metadata).toEqual({ key: "value" });
  });

  test("handles null pageContent", () => {
    // @ts-expect-error - testing edge case
    const cdsDoc = {
      id: "doc-1",
      storeName: "store-1",
      pageContent: null,
      embedding: "[1,2,3]",
      metadata: [],
    };
    const result = utils.mapDocumentFromCds(cdsDoc);
    expect(result.pageContent).toBe("");
  });

  test("handles undefined pageContent", () => {
    const cdsDoc = {
      id: "doc-1",
      storeName: "store-1",
      embedding: "[1,2,3]",
      metadata: [],
    };
    const result = utils.mapDocumentFromCds(cdsDoc);
    expect(result.pageContent).toBe("");
  });
});

describe("mapMetadataFilterToCdsExpr", () => {
  test("maps direct equality filter", () => {
    const result = utils.mapMetadataFilterToCdsExpr({ priority: 3 });
    expect(result).toBe(
      "(metadata.name = 'priority' AND metadata.value = '3')",
    );
  });

  test("maps $eq operator", () => {
    const result = utils.mapMetadataFilterToCdsExpr({
      priority: { $eq: 5 },
    });
    expect(result).toBe(
      "(metadata.name = 'priority' AND metadata.value = '5')",
    );
  });

  test("maps $ne operator", () => {
    const result = utils.mapMetadataFilterToCdsExpr({
      priority: { $ne: 5 },
    });
    expect(result).toBe(
      "(metadata.name = 'priority' AND metadata.value != '5')",
    );
  });

  test("joins multiple filter conditions with OR", () => {
    const result = utils.mapMetadataFilterToCdsExpr({
      color: "red",
      shape: "circle",
    });
    expect(result).toBe(
      "(metadata.name = 'color' AND metadata.value = 'red') OR " +
        "(metadata.name = 'shape' AND metadata.value = 'circle')",
    );
  });

  test("filters with multiple operators are ignored (keys.length > 1)", () => {
    const result = utils.mapMetadataFilterToCdsExpr({
      priority: { $eq: 3, $ne: 9 },
    });
    expect(result).toBe("(metadata.name = 'priority')");
  });

  test("maps $in operator", () => {
    const result = utils.mapMetadataFilterToCdsExpr({
      priority: { $in: [1, 3, 5] },
    });
    expect(result).toBe(
      "(metadata.name = 'priority' AND metadata.value IN ('1', '3', '5'))",
    );
  });

  test("maps $notIn operator", () => {
    const result = utils.mapMetadataFilterToCdsExpr({
      priority: { $notIn: [2, 4] },
    });
    expect(result).toBe(
      "(metadata.name = 'priority' AND metadata.value NOT IN ('2', '4'))",
    );
  });

  test("throws on unsupported operator", () => {
    expect(() =>
      utils.mapMetadataFilterToCdsExpr({
        // @ts-expect-error - testing unsupported operator
        priority: { $regex: "test" },
      }),
    ).toThrow("Unsupported operator: $regex");
  });
});
