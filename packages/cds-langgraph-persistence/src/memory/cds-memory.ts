import { StoreItem, StoreItemField } from "#cds-models/index";
import { Embeddings } from "@langchain/core/embeddings";
import {
  BaseStore,
  GetOperation,
  Item,
  ListNamespacesOperation,
  Operation,
  OperationResults,
  PutOperation,
  SearchItem,
  SearchOperation,
} from "@langchain/langgraph-checkpoint";
import cds from "@sap/cds";
import * as utils from "./utils";
import { readParentsWithChildren } from "@mi8y/cds-agent-utils";

export const DEFAULT_FQN_ENTITY_STORE_ITEMS =
  "plugin.langgraph.persistence.StoreItems";
export const DEFAULT_FQN_ENTITY_STORE_ITEM_FIELDS =
  "plugin.langgraph.persistence.StoreItemFields";

export type CdsMemoryStoreConfig = {
  /**
   * A **required** identifier matching the graph/agent this store belongs to.
   *
   * It is persisted as the `graphName` column and used as a composite key in
   * the `StoreItems` entity, isolating store state per graph.
   */
  name: string;
  /**
   * The embeddings model to use for generating vectors.
   * This should be a LangChain Embeddings implementation.
   */
  embeddings?: Embeddings;
  /**
   * The fully qualified name of the entity to use for storing items.
   *
   * @default "plugin.langgraph.persistence.StoreItems"
   */
  fqnStoreItemsEntity?: string;
  /**
   * The fully qualified name of the entity to use for storing item fields.
   *
   * @default "plugin.langgraph.persistence.StoreItemFields"
   */
  fqnStoreItemFieldsEntity?: string;
};

export class CdsMemoryStore extends BaseStore {
  #params: CdsMemoryStoreConfig;
  #graphName: string;
  #fqnStoreItemsEntity: string;
  #fqnStoreItemFieldsEntity: string;

  constructor(params: CdsMemoryStoreConfig) {
    super();
    this.#params = params;
    this.#graphName = params.name;
    this.#fqnStoreItemsEntity =
      params.fqnStoreItemsEntity ?? DEFAULT_FQN_ENTITY_STORE_ITEMS;
    this.#fqnStoreItemFieldsEntity =
      params.fqnStoreItemFieldsEntity ?? DEFAULT_FQN_ENTITY_STORE_ITEM_FIELDS;
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async batch<Op extends readonly Operation[]>(
    operations: Op,
  ): Promise<OperationResults<Op>> {
    const results: unknown[] = [];

    for (const operation of operations) {
      if ("namespacePrefix" in operation) {
        results.push(await this.searchOperation(operation as SearchOperation));
      } else if ("key" in operation && !("value" in operation)) {
        results.push(await this.getOperation(operation as GetOperation));
      } else if ("value" in operation) {
        if (operation.value !== null) {
          results.push(await this.putOperation(operation as PutOperation));
        } else {
          await this.deleteOperation(operation as PutOperation);
        }
      } else if ("matchConditions" in operation) {
        results.push(
          await this.listNamespacesOperation(
            operation as ListNamespacesOperation,
          ),
        );
      } else {
        throw new Error(
          `Unsupported operation type: ${JSON.stringify(operation)}`,
        );
      }
    }

    return results as OperationResults<Op>;
  }

  private async getOperation({
    key,
    namespace,
  }: GetOperation): Promise<Item | null> {
    const namespaceKey = utils.mapNamespaceToCds(namespace);
    const storeItem = (await SELECT.one.from(this.#fqnStoreItemsEntity).where({
      graphName: this.#graphName,
      namespace: namespaceKey,
      id: key,
    })) as StoreItem | null;
    if (!storeItem) {
      return null;
    }
    const fields = await SELECT.from(this.#fqnStoreItemFieldsEntity).where({
      graphName: this.#graphName,
      namespace: namespaceKey,
      id: key,
    });

    const item = utils.mapStoreItemFromCds(storeItem);
    item.value = utils.mapStoreItemFieldsFromCds(fields);

    return item;
  }

  private async searchOperation({
    namespacePrefix,
    filter,
    limit,
    offset,
    query,
  }: SearchOperation): Promise<SearchItem[]> {
    // @ts-expect-error: The `expr` function is not recognized by TypeScript, but it is available in the runtime environment.
    const { expr } = cds.ql;

    const namespacePrefixKey = utils.mapNamespaceToCds(namespacePrefix);
    let cdsQuery = SELECT.from(this.#fqnStoreItemsEntity)
      .where({
        graphName: this.#graphName,
        namespace: { like: `${namespacePrefixKey}%` },
      })
      .limit(limit ?? 10, offset ?? 0)
      .orderBy("createdAt desc");

    if (filter) {
      const metadataWhere = utils.mapMetadataFilterToCdsWhere(
        this.#fqnStoreItemFieldsEntity,
        filter,
        this.#graphName,
        namespacePrefixKey,
      );
      cdsQuery = cdsQuery.where(
        metadataWhere ? expr(metadataWhere) : undefined,
      );
    }

    if (query) {
      if (this.#params.embeddings) {
        const queryEmbedding = await this.#params.embeddings.embedQuery(query);
        cdsQuery = cdsQuery.where(
          expr`cosine_similarity(fields.embedding, ${JSON.stringify(queryEmbedding)}) > 0.75`,
        );
      }

      if (cds.requires.db.kind === "hana") {
        cdsQuery = cdsQuery.where(expr`contains(fields.value, '${query}')`);
      } else {
        cdsQuery = cdsQuery.where({
          "fields.value": { like: `%${query}%` },
        });
      }
    }

    const relationProperty = "fields";
    const { result } = await readParentsWithChildren<StoreItem, StoreItemField>(
      {
        match: [
          { parent: "graphName", child: "graphName" },
          { parent: "namespace", child: "namespace" },
          { parent: "id", child: "id" },
        ],
        readParents: async () => cdsQuery,
        readChildren: async ({ where }) => {
          return await SELECT.from(this.#fqnStoreItemFieldsEntity).where(where);
        },
        relationProperty: relationProperty,
      },
    );

    return result.map((i) => {
      const searchItem = utils.mapStoreItemFromCds(i);
      searchItem.value = utils.mapStoreItemFieldsFromCds(
        i[relationProperty] ?? [],
      );
      return searchItem;
    });
  }

  private async putOperation({
    key,
    namespace,
    value,
  }: PutOperation): Promise<void> {
    const namespaceKey = utils.mapNamespaceToCds(namespace);

    await UPSERT.into(this.#fqnStoreItemsEntity).entries(
      utils.mapStoreItemToCds({ key, namespace }, this.#graphName),
    );

    let entries = utils.mapStoreItemFieldsToCds(
      value ?? {},
      namespaceKey,
      key,
      this.#graphName,
    );
    await DELETE.from(this.#fqnStoreItemFieldsEntity).where({
      graphName: this.#graphName,
      namespace: namespaceKey,
      id: key,
    });

    if (entries.length > 0) {
      // If embeddings are configured, embed the fields before inserting
      if (this.#params.embeddings) {
        entries = await utils.embedCdsStoreItemFields(
          entries,
          this.#params.embeddings,
        );
      }
      await INSERT.into(this.#fqnStoreItemFieldsEntity).entries(...entries);
    }
  }

  private async listNamespacesOperation({
    matchConditions,
    maxDepth,
    limit,
    offset,
  }: ListNamespacesOperation): Promise<string[][]> {
    let cdsQuery = SELECT.distinct
      .from(this.#fqnStoreItemsEntity)
      .columns("namespace")
      .where({ graphName: this.#graphName })
      .orderBy("namespace")
      .limit(limit ?? 100, offset ?? 0);

    // Add match conditions
    if (matchConditions && matchConditions.length > 0) {
      for (const condition of matchConditions) {
        if (condition.matchType === "prefix") {
          const prefixNamespaces = utils.mapNamespaceToCds(condition.path);
          cdsQuery = cdsQuery.where({
            namespace: { like: `${prefixNamespaces}%` },
          });
        } else if (condition.matchType === "suffix") {
          const suffixNamespaces = utils.mapNamespaceToCds(condition.path);
          cdsQuery = cdsQuery.where({
            namespace: { like: `%${suffixNamespaces}` },
          });
        }
      }
    }

    const items = (await cdsQuery) as Array<{ namespace?: string | null }>;

    // map the namespaces from the stringified format to the expected format
    let namespaces = items
      .filter((item: { namespace?: string | null }) => item.namespace !== null)
      .map(
        (result: { namespace?: string | null }) => result.namespace as string,
      )
      .map(utils.mapNamespaceFromCds);

    if (maxDepth !== undefined) {
      // collect unique namespaces up to maxDepth
      const namespacesSet = new Set(
        namespaces.map((ns: string[]) =>
          utils.mapNamespaceToCds(ns.slice(0, maxDepth)),
        ),
      );
      namespaces = [...namespacesSet].map((ns: string) =>
        utils.mapNamespaceFromCds(ns),
      );
    }

    return namespaces;
  }

  private async deleteOperation({
    key,
    namespace,
  }: GetOperation): Promise<void> {
    const namespaceKey = utils.mapNamespaceToCds(namespace);
    await DELETE.from(this.#fqnStoreItemsEntity).where({
      graphName: this.#graphName,
      namespace: namespaceKey,
      id: key,
    });
  }
}
