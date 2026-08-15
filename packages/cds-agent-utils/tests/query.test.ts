import { describe, expect, it, vi } from "vitest";
import { readParentsWithChildren } from "@/query";

describe("readParentsWithChildren", () => {
  const abRecords = [
    { A: "A-001", B: "B-001", value: "Parent 1" },
    { A: "A-002", B: "B-002", value: "Parent 2" },
  ];

  const abcdRecords = [
    {
      A: "A-001",
      B: "B-001",
      C: "C-001",
      D: "D-001",
      value: "Child 1.1",
    },
    {
      A: "A-001",
      B: "B-001",
      C: "C-002",
      D: "D-002",
      value: "Child 1.2",
    },
    {
      A: "A-002",
      B: "B-002",
      C: "C-003",
      D: "D-003",
      value: "Child 2.1",
    },
  ];

  const abMatch = [
    { parent: "A", child: "A" },
    { parent: "B", child: "B" },
  ];

  it("reads parents and children exactly once, then enriches every parent", async () => {
    const readParents = vi.fn().mockResolvedValue(abRecords);
    const readChildren = vi.fn().mockResolvedValue(abcdRecords);

    const data = await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
      relationProperty: "ABCD",
    });

    expect(readParents).toHaveBeenCalledTimes(1);
    expect(readChildren).toHaveBeenCalledTimes(1);

    expect(data.parents).toEqual(abRecords);
    expect(data.children).toEqual(abcdRecords);

    expect(data.result).toEqual([
      {
        A: "A-001",
        B: "B-001",
        value: "Parent 1",
        ABCD: [
          {
            A: "A-001",
            B: "B-001",
            C: "C-001",
            D: "D-001",
            value: "Child 1.1",
          },
          {
            A: "A-001",
            B: "B-001",
            C: "C-002",
            D: "D-002",
            value: "Child 1.2",
          },
        ],
      },
      {
        A: "A-002",
        B: "B-002",
        value: "Parent 2",
        ABCD: [
          {
            A: "A-002",
            B: "B-002",
            C: "C-003",
            D: "D-003",
            value: "Child 2.1",
          },
        ],
      },
    ]);
  });

  it("passes unique composite key tuples to readChildren", async () => {
    const parentsWithDuplicates = [
      { A: "A-001", B: "B-001" },
      { A: "A-001", B: "B-001" },
      { A: "A-002", B: "B-002" },
    ];

    const readParents = vi.fn().mockResolvedValue(parentsWithDuplicates);
    const readChildren = vi.fn().mockResolvedValue([]);

    await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
    });

    expect(readChildren).toHaveBeenCalledWith(
      expect.objectContaining({
        keys: [
          ["A-001", "B-001"],
          ["A-002", "B-002"],
        ],
      }),
    );
  });

  it("builds a composite OR predicate instead of independent IN-style filters", async () => {
    const readParents = vi.fn().mockResolvedValue(abRecords);
    const readChildren = vi.fn().mockResolvedValue([]);

    await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
    });

    const [{ where }] = readChildren.mock.calls[0];

    expect(where).toEqual({
      xpr: [
        {
          xpr: [
            { ref: ["A"] },
            "=",
            { val: "A-001" },
            "and",
            { ref: ["B"] },
            "=",
            { val: "B-001" },
          ],
        },
        "or",
        {
          xpr: [
            { ref: ["A"] },
            "=",
            { val: "A-002" },
            "and",
            { ref: ["B"] },
            "=",
            { val: "B-002" },
          ],
        },
      ],
    });
  });

  it("passes the mapping configuration to readChildren", async () => {
    const readParents = vi.fn().mockResolvedValue(abRecords);
    const readChildren = vi.fn().mockResolvedValue([]);

    await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
    });

    expect(readChildren).toHaveBeenCalledWith(
      expect.objectContaining({
        match: abMatch,
      }),
    );
  });

  it("attaches an empty child array when a parent has no matching children", async () => {
    const readParents = vi.fn().mockResolvedValue(abRecords);

    const readChildren = vi.fn().mockResolvedValue([
      {
        A: "A-001",
        B: "B-001",
        C: "C-001",
        D: "D-001",
      },
    ]);

    const { result } = await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
      relationProperty: "ABCD",
    });

    expect(result[0].ABCD).toHaveLength(1);
    expect(result[1].ABCD).toEqual([]);
  });

  it("preserves parent result order", async () => {
    const parents = [
      { A: "A-003", B: "B-003" },
      { A: "A-001", B: "B-001" },
      { A: "A-002", B: "B-002" },
    ];

    const readParents = vi.fn().mockResolvedValue(parents);
    const readChildren = vi.fn().mockResolvedValue([]);

    const { result } = await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
    });

    expect(result.map((parent) => [parent.A, parent.B])).toEqual([
      ["A-003", "B-003"],
      ["A-001", "B-001"],
      ["A-002", "B-002"],
    ]);
  });

  it("enriches duplicate parent rows independently", async () => {
    const parents = [
      { A: "A-001", B: "B-001", source: "first" },
      { A: "A-001", B: "B-001", source: "second" },
    ];

    const children = [
      {
        A: "A-001",
        B: "B-001",
        C: "C-001",
        D: "D-001",
      },
    ];

    const { result } = await readParentsWithChildren({
      readParents: vi.fn().mockResolvedValue(parents),
      readChildren: vi.fn().mockResolvedValue(children),
      match: abMatch,
      relationProperty: "children",
    });

    expect(result).toEqual([
      {
        A: "A-001",
        B: "B-001",
        source: "first",
        children,
      },
      {
        A: "A-001",
        B: "B-001",
        source: "second",
        children,
      },
    ]);
  });

  it("supports different parent and child field names", async () => {
    const parents = [
      {
        CompanyCode: "1000",
        DocumentNumber: "900000001",
        description: "Invoice header",
      },
    ];

    const children = [
      {
        Bukrs: "1000",
        Belnr: "900000001",
        Buzei: "000010",
        amount: 500,
      },
    ];

    const match = [
      { parent: "CompanyCode", child: "Bukrs" },
      { parent: "DocumentNumber", child: "Belnr" },
    ];

    const readChildren = vi.fn().mockResolvedValue(children);

    const { result } = await readParentsWithChildren({
      readParents: vi.fn().mockResolvedValue(parents),
      readChildren,
      match,
      relationProperty: "items",
    });

    expect(result).toEqual([
      {
        CompanyCode: "1000",
        DocumentNumber: "900000001",
        description: "Invoice header",
        items: children,
      },
    ]);

    const [{ where }] = readChildren.mock.calls[0];

    expect(where).toEqual({
      xpr: [
        {
          xpr: [
            { ref: ["Bukrs"] },
            "=",
            { val: "1000" },
            "and",
            { ref: ["Belnr"] },
            "=",
            { val: "900000001" },
          ],
        },
      ],
    });
  });

  it("does not call readChildren when no parents are returned", async () => {
    const readParents = vi.fn().mockResolvedValue([]);
    const readChildren = vi.fn();

    const result = await readParentsWithChildren({
      readParents,
      readChildren,
      match: abMatch,
    });

    expect(readParents).toHaveBeenCalledTimes(1);
    expect(readChildren).not.toHaveBeenCalled();

    expect(result).toEqual({
      parents: [],
      children: [],
      result: [],
    });
  });

  it("throws when readParents does not return an array", async () => {
    await expect(
      readParentsWithChildren({
        readParents: vi.fn().mockResolvedValue({ A: "A-001", B: "B-001" }),
        readChildren: vi.fn(),
        match: abMatch,
      }),
    ).rejects.toThrow("readParents must resolve to an array");
  });

  it("throws when readChildren does not return an array", async () => {
    await expect(
      readParentsWithChildren({
        readParents: vi.fn().mockResolvedValue(abRecords),
        readChildren: vi.fn().mockResolvedValue({ A: "A-001", B: "B-001" }),
        match: abMatch,
      }),
    ).rejects.toThrow("readChildren must resolve to an array");
  });

  it("throws before reading children if a parent misses a mapped field", async () => {
    const readChildren = vi.fn();

    await expect(
      readParentsWithChildren({
        readParents: vi.fn().mockResolvedValue([{ A: "A-001" }]),
        readChildren,
        match: abMatch,
      }),
    ).rejects.toThrow("Parent record does not contain all mapped fields: A, B");

    expect(readChildren).not.toHaveBeenCalled();
  });

  it("throws when a returned child misses a mapped field", async () => {
    await expect(
      readParentsWithChildren({
        readParents: vi.fn().mockResolvedValue([{ A: "A-001", B: "B-001" }]),
        readChildren: vi.fn().mockResolvedValue([{ A: "A-001" }]),
        match: abMatch,
      }),
    ).rejects.toThrow("Child record does not contain all mapped fields: A, B");
  });

  it("validates readParents", async () => {
    await expect(
      readParentsWithChildren({
        // @ts-expect-error: Intentionally passing undefined to test validation
        readParents: undefined,
        readChildren: vi.fn(),
        match: abMatch,
      }),
    ).rejects.toThrow("readParents must be a function");
  });

  it("validates readChildren", async () => {
    await expect(
      readParentsWithChildren({
        readParents: vi.fn(),
        // @ts-expect-error: Intentionally passing undefined to test validation
        readChildren: undefined,
        match: abMatch,
      }),
    ).rejects.toThrow("readChildren must be a function");
  });

  it("validates the match configuration", async () => {
    await expect(
      readParentsWithChildren({
        readParents: vi.fn(),
        readChildren: vi.fn(),
        match: [],
      }),
    ).rejects.toThrow(
      "match must contain at least one parent/child field mapping",
    );
  });

  it("propagates errors thrown by readParents", async () => {
    const parentReadError = new Error("Parent source unavailable");

    await expect(
      readParentsWithChildren({
        readParents: vi.fn().mockRejectedValue(parentReadError),
        readChildren: vi.fn(),
        match: abMatch,
      }),
    ).rejects.toThrow("Parent source unavailable");
  });

  it("propagates errors thrown by readChildren", async () => {
    const childReadError = new Error("Child source unavailable");

    await expect(
      readParentsWithChildren({
        readParents: vi.fn().mockResolvedValue(abRecords),
        readChildren: vi.fn().mockRejectedValue(childReadError),
        match: abMatch,
      }),
    ).rejects.toThrow("Child source unavailable");
  });
});
