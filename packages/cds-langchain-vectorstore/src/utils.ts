import type { VectorDocument, VectorDocumentMetadata } from "#cds-models/index";
import { DocumentInterface } from "@langchain/core/documents";
import cds from "@sap/cds";

export type VectorDocumentAsEntity = VectorDocument & {
  metadata: VectorDocumentMetadata[];
};

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
): VectorDocumentAsEntity {
  const documentId = document.id ?? cds.utils.uuid();
  const metadata = mapDocumentMetadataToCds(
    document.metadata ?? {},
    documentId,
    storeName,
  );
  return {
    storeName: storeName,
    id: documentId,
    pageContent: document.pageContent,
    metadata: metadata,
    embedding: serializeEmbedding(embedding),
  };
}

export function mapDocumentMetadataToCds(
  documentMetadata: Record<string, unknown>,
  documentId: string,
  storeName: string,
): VectorDocumentMetadata[] {
  return Object.entries(documentMetadata ?? {}).map(([name, value]) => ({
    name,
    value: JSON.stringify(value),
    document_storeName: storeName,
    document_id: documentId,
  }));
}

export function mapDocumentFromCds(
  document: VectorDocumentAsEntity,
): DocumentInterface {
  const metadata = mapDocumentMetadataFromCds(document.metadata ?? []);
  return {
    id: document.id,
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

export type MetadataFilter = Record<
  string,
  | string
  | number
  | boolean
  | {
      $eq?: string | number | boolean;
      $ne?: string | number | boolean;
      $in?: (string | number | boolean)[];
      $notIn?: (string | number | boolean)[];
    }
>;

export function mapMetadataFilterToCdsExpr(filter: MetadataFilter): string {
  const cdsFilters: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    let cdsFilter = `metadata.name = '${key}'`;
    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 1) {
        const operator = keys[0] as keyof MetadataFilter[string];
        const operatorValue = value[operator];
        switch (operator) {
          case "$eq":
            cdsFilter += ` AND metadata.value = '${operatorValue}'`;
            break;
          case "$ne":
            cdsFilter += ` AND metadata.value != '${operatorValue}'`;
            break;
          case "$in": {
            const values = (operatorValue as (string | number | boolean)[])
              .map((v) => `'${v}'`)
              .join(", ");
            cdsFilter += ` AND metadata.value IN (${values})`;
            break;
          }
          case "$notIn": {
            const values = (operatorValue as (string | number | boolean)[])
              .map((v) => `'${v}'`)
              .join(", ");
            cdsFilter += ` AND metadata.value NOT IN (${values})`;
            break;
          }
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }
      }
    } else {
      cdsFilter += ` AND metadata.value = '${value}'`;
    }
    cdsFilters.push(`(${cdsFilter})`);
  }

  return cdsFilters.join(" OR ");
}
