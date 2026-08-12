import {
  StoreItemFields,
  StoreItems,
} from "#cds-models/plugin/langgraph/persistence";
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
import * as utils from "./utils";
import cds from "@sap/cds";

export type CdsMemoryStoreConfig = {
  /**
   * A **required** identifier matching the graph/agent this store belongs to.
   *
   * It is persisted as the `graphName` column and used as a composite key in
   * the `StoreItems` entity, isolating store state per graph.
   */
  name: string;
  index?: {
    /**
     * The embeddings model to use for generating vectors.
     * This should be a LangChain Embeddings implementation.
     */
    embeddings: Embeddings;
  };
};

export class CdsMemoryStore extends BaseStore {
  protected params: CdsMemoryStoreConfig;
  protected graphName: string;

  constructor(params: CdsMemoryStoreConfig) {
    super();
    this.params = params;
    this.graphName = params.name;
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
    const storeItem = await SELECT.one
      .from(StoreItems)
      .columns((c) => {
        c.id;
        c.namespace;
        c.createdAt;
        c.modifiedAt;
        c.fields((f) => {
          f.name;
          f.value;
        });
      })
      .where({
        graphName: this.graphName,
        namespace: namespaceKey,
        id: key,
      });
    return storeItem ? utils.mapStoreItemFromCds(storeItem) : null;
  }

  private async searchOperation({
    namespacePrefix,
    filter,
    limit,
    offset,
    query,
  }: SearchOperation): Promise<SearchItem[]> {
    const namespacePrefixKey = utils.mapNamespaceToCds(namespacePrefix);
    let cdsQuery = SELECT.from(StoreItems)
      .columns((c) => {
        c.id;
        c.namespace;
        c.createdAt;
        c.modifiedAt;
        c.fields((f) => {
          f.name;
          f.value;
        });
      })
      .where({
        graphName: this.graphName,
        namespace: { like: `${namespacePrefixKey}%` },
      })
      .limit(limit ?? 10, offset ?? 0)
      .orderBy("createdAt desc");

    if (filter) {
      const cdsFilter = utils.mapFilterToCds(filter);
      cdsQuery = cdsQuery.where({
        ...cdsFilter,
      });
    }

    if (query) {
      // @ts-expect-error: The `expr` function is not recognized by TypeScript, but it is available in the runtime environment.
      const { expr } = cds.ql;

      if (this.params.index?.embeddings) {
        const queryEmbedding =
          await this.params.index.embeddings.embedQuery(query);
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

    const items = await cdsQuery;

    return items.map(utils.mapStoreItemFromCds);
  }

  private async putOperation({
    key,
    namespace,
    value,
  }: PutOperation): Promise<void> {
    const namespaceKey = utils.mapNamespaceToCds(namespace);

    await UPSERT.into(StoreItems).entries(
      utils.mapStoreItemToCds({ key, namespace }, this.graphName),
    );

    let entries = utils.mapStoreItemFieldsToCds(
      value ?? {},
      namespaceKey,
      key,
      this.graphName,
    );
    await DELETE.from(StoreItemFields).where({
      item_graphName: this.graphName,
      item_namespace: namespaceKey,
      item_id: key,
    });

    if (entries.length > 0) {
      // If embeddings are configured, embed the fields before inserting
      if (this.params.index?.embeddings) {
        entries = await utils.embedCdsStoreItemFields(
          entries,
          this.params.index.embeddings,
        );
      }
      await INSERT.into(StoreItemFields).entries(...entries);
    }
  }

  private async listNamespacesOperation({
    matchConditions,
    maxDepth,
    limit,
    offset,
  }: ListNamespacesOperation): Promise<string[][]> {
    let cdsQuery = SELECT.distinct
      .from(StoreItems)
      .columns((c) => {
        c.namespace;
      })
      .where({ graphName: this.graphName })
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

    const items = await cdsQuery;

    // map the namespaces from the stringified format to the expected format
    let namespaces = items
      .filter((item) => item.namespace !== null)
      .map((result) => result.namespace as string)
      .map(utils.mapNamespaceFromCds);

    if (maxDepth !== undefined) {
      // collect unique namespaces up to maxDepth
      const namespacesSet = new Set(
        namespaces.map((ns) => utils.mapNamespaceToCds(ns.slice(0, maxDepth))),
      );
      namespaces = [...namespacesSet].map((ns) =>
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
    await DELETE.from(StoreItems).where({
      graphName: this.graphName,
      namespace: namespaceKey,
      id: key,
    });
  }
}
