import { describe, expect, test } from "vitest";
import * as utils from "@/memory/utils";

describe("mapMetadataFilterToCdsWhere", () => {
  test("maps direct equality filter", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { priority: 3 },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'priority' and value = '3')",
    );
  });

  test("maps $eq operator", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { priority: { $eq: 5 } },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'priority' and value = '5')",
    );
  });

  test("maps $ne operator with key existence and exclusion", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { priority: { $ne: 5 } },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'priority') and id not in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and (name = 'priority' and value = '5'))",
    );
  });

  test("joins multiple filter keys with AND semantics", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { color: "red", shape: "circle" },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'color' and value = '\"red\"') and id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'shape' and value = '\"circle\"')",
    );
  });

  test("supports multiple operators on one field", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { priority: { $eq: 3, $ne: 9 } },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'priority' and value = '3') and id not in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and (name = 'priority' and value = '9'))",
    );
  });

  test("maps $in operator", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { priority: { $in: [1, 3, 5] } },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'priority' and value in ('1', '3', '5'))",
    );
  });

  test("maps $notIn operator with key existence and exclusion", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { priority: { $notIn: [2, 4] } },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'priority') and id not in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and (name = 'priority' and value in ('2', '4')))",
    );
  });

  test("ignores undefined filter values", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        {
          color: "red",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unused: undefined as any,
        },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'color' and value = '\"red\"')",
    );
  });

  test("throws on unsupported operator", () => {
    expect(() =>
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        {
          // @ts-expect-error - testing unsupported operator
          priority: { $regex: "test" },
        },
        "test-graph",
        "docs",
      ),
    ).toThrow("Unsupported operator: $regex");
  });

  test("returns undefined when filter is absent", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        undefined,
        "test-graph",
        "docs",
      ),
    ).toBe(undefined);
  });

  test("includes namespace prefix in subquery LIKE clause", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { category: "programming" },
        "test-graph",
        "nested:docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'nested:docs%' and name = 'category' and value = '\"programming\"')",
    );
  });

  test("handles quotes in values by escaping them", () => {
    expect(
      utils.mapMetadataFilterToCdsWhere(
        "plugin.langgraph.persistence.StoreItemFields",
        { title: "O'Brien's Guide" },
        "test-graph",
        "docs",
      ),
    ).toBe(
      "id in (select id from plugin.langgraph.persistence.StoreItemFields where graphName = 'test-graph' and namespace like 'docs%' and name = 'title' and value = '\"O''Brien''s Guide\"')",
    );
  });
});
