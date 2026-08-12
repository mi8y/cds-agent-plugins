import cds from "@sap/cds";
import * as __ from "#cds-models/_";

// @ts-expect-error: The `ql` property is not recognized by TypeScript, but it is available in the runtime environment.
const { ref, val, xpr } = cds.ql;

type ReadParentsWithChildrenOptions<
  T extends __.Entity = __.Entity,
  U extends __.Entity = __.Entity,
> = {
  /**
   * A function that reads the parent records. It should return a Promise that resolves to an array of parent records.
   *
   * @example
   * readParents: async () => {
   *   // Implement your logic to read parent records.
   *   return await SELECT.from("ParentEntity");
   * }
   */
  readParents: () => Promise<T[]>;
  /**
   * A function that reads the child records. It should return a Promise that resolves to an array of child records.
   *
   * @example
   * readChildren: async ({ parents, keys, where, match }) => {
   *   // Implement your logic to read child records based on the provided parameters.
   *   return await SELECT.from("ChildEntity").where(where);
   * }
   */
  readChildren: (options: {
    /**
     * Keys to filter the child records.
     */
    keys: string[][];
    /**
     * A CQN/CXN expression object that defines the filtering conditions for the child records.
     *
     * @example
     * {
     *   xpr: [
     *     { xpr: [...] }, 'or', { xpr: [...] }
     *   ]
     * }
     */
    where: Record<string, unknown>;
    /**
     * An array of objects that define the mapping between parent and child fields. May be used for logging or metadata purposes.
     */
    match: Array<{ parent: string; child: string }>;
  }) => Promise<U[]>;
  /**
   * An array of objects that define the mapping between parent and child fields.
   * Each object should have a `parent` property and a `child` property.
   *
   * @example
   * [
   *   { parent: "parentField1", child: "childField1" },
   *   { parent: "parentField2", child: "childField2" }
   * ]
   *
   * This example maps `parentField1` to `childField1` and `parentField2` to `childField2`.
   */
  match: Array<{ parent: string; child: string }>;
  /**
   * The property name to use for the array of child records in the result.
   *
   * @default "children"
   */
  relationProperty?: string;
};

/**
 * Reads parent records and their associated child records based on the provided options.
 *
 * The function enables `$expand`-like behavior by reading parent records and their associated child records in **just two** separate calls.
 * The libraries ship only `aspect`s, which does not support `association`/`composition` relationships. Hence, this function is a workaround
 * to achieve similar functionality by reading parents and children separately and then combining them based on the provided field mappings.
 *
 * @template T - The type of the parent entity.
 * @template U - The type of the child entity.
 * @param {ReadParentsWithChildrenOptions<T, U>} options - The options for reading parents and children.
 * @returns {Promise<{ parents: T[]; children: U[]; result: Array<T & { [key in typeof relationProperty]: U[] }> }>} A Promise that resolves to an object containing the parent records, child records, and the combined result.
 */
export async function readParentsWithChildren<
  T extends __.Entity = __.Entity,
  U extends __.Entity = __.Entity,
>({
  readParents,
  readChildren,
  match,
  relationProperty = "children",
}: ReadParentsWithChildrenOptions<T, U>): Promise<{
  parents: T[];
  children: U[];
  result: Array<T & { [key in typeof relationProperty]: U[] }>;
}> {
  if (typeof readParents !== "function") {
    throw new TypeError("readParents must be a function");
  }

  if (typeof readChildren !== "function") {
    throw new TypeError("readChildren must be a function");
  }

  if (!Array.isArray(match) || match.length === 0) {
    throw new TypeError(
      "match must contain at least one parent/child field mapping",
    );
  }

  // Call 1
  const parents = await readParents();

  if (!Array.isArray(parents)) {
    throw new TypeError("readParents must resolve to an array");
  }

  if (parents.length === 0) {
    return {
      parents: [],
      children: [],
      result: [],
    };
  }

  const parentKeyOf = (parent: T) =>
    match.map(({ parent: parentField }) => {
      // @ts-expect-error: The parent record may not have the expected field, but we want to allow for that possibility.
      return parent[parentField];
    });

  const childKeyOf = (child: U) =>
    match.map(({ child: childField }) => {
      // @ts-expect-error: The child record may not have the expected field, but we want to allow for that possibility.
      return child[childField];
    });

  const signatureOf = (key: string[]) => JSON.stringify(key);

  // De-duplicate parent tuples:
  // Example: [ ['A1', 'B1'], ['A2', 'B2'] ]
  const uniqueKeys = new Map();

  for (const parent of parents) {
    const key = parentKeyOf(parent);

    if (key.some((value) => value === undefined)) {
      throw new Error(
        `Parent record does not contain all mapped fields: ${match
          .map((m) => m.parent)
          .join(", ")}`,
      );
    }

    uniqueKeys.set(signatureOf(key as string[]), key);
  }

  const keys = [...uniqueKeys.values()];

  // Builds one predicate:
  //
  // (A = 'A1' and B = 'B1')
  // or
  // (A = 'A2' and B = 'B2')
  //
  const tuplePredicates = keys.map((key) =>
    xpr(
      match.flatMap(({ child }, index) => [
        ...(index > 0 ? ["and"] : []),
        ref`${child}`,
        "=",
        val(key[index]),
      ]),
    ),
  );

  const where = {
    xpr: tuplePredicates.flatMap((predicate, index) => [
      ...(index > 0 ? ["or"] : []),
      predicate,
    ]),
  };

  // Call 2
  const children = await readChildren({
    keys,
    where,
    match,
  });

  if (!Array.isArray(children)) {
    throw new TypeError("readChildren must resolve to an array");
  }

  const childrenByParentKey = new Map();

  for (const child of children) {
    const key = childKeyOf(child);

    if (key.some((value) => value === undefined)) {
      throw new Error(
        `Child record does not contain all mapped fields: ${match
          .map((m) => m.child)
          .join(", ")}`,
      );
    }

    const signature = signatureOf(key as string[]);
    const group = childrenByParentKey.get(signature) ?? [];

    group.push(child);
    childrenByParentKey.set(signature, group);
  }

  const result = parents.map((parent) => ({
    ...parent,
    [relationProperty]:
      childrenByParentKey.get(signatureOf(parentKeyOf(parent) as string[])) ??
      [],
  }));

  return {
    parents,
    children,
    result,
  };
}
