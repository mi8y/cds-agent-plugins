/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  StoreItem,
  StoreItemField,
} from "#cds-models/plugin/langgraph/persistence";
import { Embeddings } from "@langchain/core/embeddings";
import { Item } from "@langchain/langgraph-checkpoint";

export function mapNamespaceToCds(namespace: string[]): string {
  return namespace.join(":");
}

export function mapNamespaceFromCds(namespace: string): string[] {
  return namespace.split(":");
}

export function mapStoreItemFromCds(storeItem: StoreItem): Item {
  return {
    createdAt: new Date(storeItem.createdAt!),
    updatedAt: new Date(storeItem.modifiedAt!),
    namespace: mapNamespaceFromCds(storeItem.namespace!),
    key: storeItem.id!,
    value: mapStoreItemFieldsFromCds(storeItem.fields ?? []),
  } as Item;
}

export function mapStoreItemToCds(
  item: Omit<Item, "createdAt" | "updatedAt" | "value">,
  graphName: string,
): StoreItem {
  return {
    graphName,
    id: item.key,
    namespace: mapNamespaceToCds(item.namespace),
  } as StoreItem;
}

export function mapStoreItemFieldsToCds(
  fields: Record<string, any>,
  namespaceKey: string,
  key: string,
  graphName: string,
): StoreItemField[] {
  return Object.entries(fields).map(
    ([name, value]) =>
      ({
        name,
        value: JSON.stringify(value), // store primitive values as JSON strings
        item_graphName: graphName,
        item_namespace: namespaceKey,
        item_id: key,
      }) as StoreItemField,
  );
}

export function mapStoreItemFieldsFromCds(
  fields: StoreItemField[],
): Record<string, any> {
  return fields.reduce((acc: Record<string, any>, field) => {
    if (field.name && field.value !== null && field.value !== undefined) {
      acc[field.name] = JSON.parse(field.value); // parse JSON strings back to their original values
    }
    return acc;
  }, {});
}

export function mapFilterToCds(
  filter: Record<string, any>,
): Record<string, any> {
  const cdsFilter: Record<string, any> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === "object" && value !== null) {
      const keys = Object.keys(value);
      if (keys.length === 1) {
        const operator = keys[0];
        const operatorValue = value[operator];
        switch (operator) {
          case "$eq":
            cdsFilter[key] = operatorValue;
            break;
          case "$ne":
            cdsFilter[key] = { "<>": operatorValue };
            break;
          case "$gt":
            cdsFilter[key] = { ">": operatorValue };
            break;
          case "$gte":
            cdsFilter[key] = { ">=": operatorValue };
            break;
          case "$lt":
            cdsFilter[key] = { "<": operatorValue };
            break;
          case "$lte":
            cdsFilter[key] = { "<=": operatorValue };
            break;
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }
      }
    } else {
      cdsFilter[key] = value;
    }
  }

  return cdsFilter;
}

export async function embedCdsStoreItemFields(
  storeItemFields: StoreItemField[],
  embeddings: Embeddings,
): Promise<StoreItemField[]> {
  // first collect all the key & value pairs
  const storeItemFieldMap = storeItemFields.reduce(
    (acc: Record<string, string>, field) => {
      if (field.name && field.value) {
        acc[field.name] = field.value;
      }
      return acc;
    },
    {},
  );

  // then embed all the values at once
  const valuesToEmbed = Object.values(storeItemFieldMap);
  const embeddedValues = await embeddings.embedDocuments(valuesToEmbed);

  // finally map the embedded values back to the original StoreItemFields
  return storeItemFields.map((field, index) => {
    if (field.name && field.value) {
      return {
        ...field,
        embedding: `[${embeddedValues[index]}]`,
      } as StoreItemField;
    }
    return field;
  });
}
