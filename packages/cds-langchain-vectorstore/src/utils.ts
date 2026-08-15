import type { VectorDocument, VectorDocumentMetadata } from "#cds-models/index";
import { DocumentInterface } from "@langchain/core/documents";
import cds from "@sap/cds";

export function serializeEmbedding(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function deserializeEmbedding(
  embeddingStr: string | null | undefined,
): number[] {
  if (!embeddingStr) return [];
  return JSON.parse(embeddingStr);
}

export function mapDocumentToCds(
  document: DocumentInterface,
  embedding: number[],
  storeName: string,
): VectorDocument {
  const documentId = document.id ?? cds.utils.uuid();
  return {
    storeName: storeName,
    documentId: documentId,
    pageContent: document.pageContent,
    embedding: serializeEmbedding(embedding),
  } as VectorDocument;
}

export function mapDocumentMetadataToCds(
  documentMetadata: Record<string, unknown>,
  documentId: string,
  storeName: string,
): VectorDocumentMetadata[] {
  return Object.entries(documentMetadata ?? {}).map(([name, value]) => ({
    name,
    value: JSON.stringify(value),
    storeName: storeName,
    documentId: documentId,
  }));
}

export function mapDocumentFromCds(
  document: VectorDocument,
  documentMetadata: VectorDocumentMetadata[] = [],
): DocumentInterface {
  const metadata = mapDocumentMetadataFromCds(documentMetadata);
  return {
    id: document.documentId,
    pageContent: document.pageContent ?? "",
    metadata: metadata,
  };
}

export function mapDocumentMetadataFromCds(
  documentMetadata: VectorDocumentMetadata[],
): Record<string, unknown> {
  return documentMetadata.reduce((acc: Record<string, unknown>, entry) => {
    if (entry.name && entry.value) {
      acc[entry.name] = JSON.parse(entry.value);
    }
    return acc;
  }, {});
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
  metadataEntity: string,
  filter: MetadataFilter | undefined,
  storeName: string,
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
        `documentId in (select documentId from ${metadataEntity} where storeName = ${quoteCqlString(storeName)} and ${include})`,
      );
    }

    if (exclude) {
      clauses.push(
        `documentId not in (select documentId from ${metadataEntity} where storeName = ${quoteCqlString(storeName)} and (${exclude}))`,
      );
    }
  }

  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}
