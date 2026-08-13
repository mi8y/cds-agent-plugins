/* eslint-disable @typescript-eslint/no-explicit-any */
import { Embeddings } from "@langchain/core/embeddings";
import { Item } from "@langchain/langgraph-checkpoint";
import { StoreItem, StoreItemField } from "#cds-models/index";

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
    value: [],
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
        graphName,
        namespace: namespaceKey,
        id: key,
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

export type MetadataFilterValue =
  | string
  | number
  | boolean
  | {
      $eq?: string | number | boolean;
      $ne?: string | number | boolean;
      $in?: (string | number | boolean)[];
      $notIn?: (string | number | boolean)[];
    };

export type MetadataFilter = Record<string, MetadataFilterValue>;

function serializeFilterValue(value: string | number | boolean): string {
  return JSON.stringify(value);
}

function quoteCqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function scalarCondition(
  fieldName: string,
  value: string | number | boolean,
): string {
  return `name = ${quoteCqlString(fieldName)} and value = ${quoteCqlString(
    serializeFilterValue(value),
  )}`;
}

function buildMetadataCondition(
  fieldName: string,
  value: MetadataFilterValue,
): { include?: string; exclude?: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      include: scalarCondition(fieldName, value as string | number | boolean),
    };
  }

  const includeClauses = new Set<string>();
  const excludeClauses = new Set<string>();
  let hasPositiveValueMatch = false;

  for (const [operator, operatorValue] of Object.entries(value)) {
    switch (operator) {
      case "$eq":
        includeClauses.add(
          scalarCondition(
            fieldName,
            operatorValue as string | number | boolean,
          ),
        );
        hasPositiveValueMatch = true;
        break;
      case "$ne":
        if (!hasPositiveValueMatch) {
          includeClauses.add(`name = ${quoteCqlString(fieldName)}`);
        }
        excludeClauses.add(
          scalarCondition(
            fieldName,
            operatorValue as string | number | boolean,
          ),
        );
        break;
      case "$in": {
        const serializedValues = (
          operatorValue as (string | number | boolean)[]
        )
          .map((entry) => quoteCqlString(serializeFilterValue(entry)))
          .join(", ");
        includeClauses.add(
          `name = ${quoteCqlString(fieldName)} and value in (${serializedValues})`,
        );
        hasPositiveValueMatch = true;
        break;
      }
      case "$notIn": {
        const serializedValues = (
          operatorValue as (string | number | boolean)[]
        )
          .map((entry) => quoteCqlString(serializeFilterValue(entry)))
          .join(", ");
        if (!hasPositiveValueMatch) {
          includeClauses.add(`name = ${quoteCqlString(fieldName)}`);
        }
        excludeClauses.add(
          `name = ${quoteCqlString(fieldName)} and value in (${serializedValues})`,
        );
        break;
      }
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  return {
    include:
      includeClauses.size > 0 ? [...includeClauses].join(" and ") : undefined,
    exclude:
      excludeClauses.size > 0 ? [...excludeClauses].join(" or ") : undefined,
  };
}

export function mapMetadataFilterToCdsWhere(
  storeItemFieldsEntity: string,
  filter: MetadataFilter | undefined,
  graphName: string,
  namespace: string,
): string | undefined {
  if (!filter) {
    return undefined;
  }

  const clauses: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) {
      continue;
    }

    const { include, exclude } = buildMetadataCondition(key, value);

    if (include) {
      clauses.push(
        `id in (select id from ${storeItemFieldsEntity} where graphName = ${quoteCqlString(graphName)} and namespace like ${quoteCqlString(`${namespace}%`)} and ${include})`,
      );
    }

    if (exclude) {
      clauses.push(
        `id not in (select id from ${storeItemFieldsEntity} where graphName = ${quoteCqlString(graphName)} and namespace like ${quoteCqlString(`${namespace}%`)} and (${exclude}))`,
      );
    }
  }

  return clauses.length > 0 ? clauses.join(" and ") : undefined;
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
