import {
  CdsCheckpointSaver,
  DEFAULT_FQN_ENTITY_CHECKPOINTS,
  DEFAULT_FQN_ENTITY_CHECKPOINT_WRITES,
} from "@/checkpoint/cds-checkpointer";
import { purgeExpiredCheckpoints } from "@/checkpoint/ttl-utils";
import { CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import cds from "@sap/cds";
import { fileURLToPath } from "url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

describe("purgeExpiredCheckpoints", () => {
  let saver: CdsCheckpointSaver;

  beforeAll(async () => {
    cds.root = fileURLToPath(
      import.meta.resolve("@mi8y/cds-langgraph-persistence"),
    );

    const cdsFilePath = fileURLToPath(
      import.meta.resolve("./model.cds", import.meta.url),
    );
    const csn = await cds.load(cdsFilePath).then(cds.minify);
    cds.model = cds.compile.for.nodejs(csn);

    cds.requires.db = {
      kind: "sqlite",
      impl: "@cap-js/sqlite",
      credentials: { url: ":memory:" },
    };

    cds.db = await cds.connect.to("db");

    // @ts-ignore
    await cds.deploy(cdsFilePath, {}).to(cds.db);
  });

  afterAll(async () => {
    // @ts-ignore
    await cds.db.disconnect?.();
  });

  afterEach(async () => {
    await DELETE.from(DEFAULT_FQN_ENTITY_CHECKPOINT_WRITES);
    await DELETE.from(DEFAULT_FQN_ENTITY_CHECKPOINTS);
  });

  it("should return zero when no checkpoints exist", async () => {
    const result = await purgeExpiredCheckpoints();
    expect(result).toEqual({ expired: 0, skipped: 0 });
  });

  it("should purge expired thread with no pending writes", async () => {
    // Negative TTL so `put` computes an `expiresAt` already in the past.
    saver = new CdsCheckpointSaver({ name: "test-ttl", ttl: -1 });

    const config = { configurable: { thread_id: "thread-expired" } };
    const checkpoint = {
      id: "ckpt-1",
      v: 4,
      channel_values: {},
      channel_versions: {},
      versions_seen: {},
    } as any;
    const metadata: CheckpointMetadata = {
      source: "loop",
      step: 1,
      parents: {},
    };
    const newVersions = {};

    await saver.put(config, checkpoint, metadata, newVersions);

    const result = await purgeExpiredCheckpoints();
    expect(result).toEqual({ expired: 1, skipped: 0 });

    // Verify the thread was deleted
    const remaining = await SELECT.from(DEFAULT_FQN_ENTITY_CHECKPOINTS).where({
      graphName: "test-ttl",
      threadId: "thread-expired",
    });
    expect(remaining).toHaveLength(0);
  });

  it("should skip expired thread with pending writes (interrupted state)", async () => {
    // Negative TTL so `put` computes an `expiresAt` already in the past.
    saver = new CdsCheckpointSaver({ name: "test-ttl-skip", ttl: -1 });

    const config = {
      configurable: { thread_id: "thread-skipped", checkpoint_id: "ckpt-skip" },
    };
    const checkpoint = {
      id: "ckpt-skip",
      v: 4,
      channel_values: {},
      channel_versions: {},
      versions_seen: {},
    } as any;
    const metadata: CheckpointMetadata = {
      source: "loop",
      step: 1,
      parents: {},
    };
    const newVersions = {};

    await saver.put(config, checkpoint, metadata, newVersions);

    // Add a pending write so the thread is "interrupted"
    await saver.putWrites(
      config,
      [["tasks", { task: "pending" }] as any],
      "task-1",
    );

    const result = await purgeExpiredCheckpoints();
    expect(result).toEqual({ expired: 0, skipped: 1 });

    // Verify the thread was NOT deleted
    const remaining = await SELECT.from(DEFAULT_FQN_ENTITY_CHECKPOINTS).where({
      graphName: "test-ttl-skip",
      threadId: "thread-skipped",
    });
    expect(remaining).toHaveLength(1);
  });

  it("should purge multiple expired threads", async () => {
    // Negative TTL so `put` computes an `expiresAt` already in the past.
    saver = new CdsCheckpointSaver({ name: "test-ttl-multi", ttl: -1 });

    for (let i = 0; i < 3; i++) {
      const config = { configurable: { thread_id: `thread-multi-${i}` } };
      const checkpoint = {
        id: `ckpt-multi-${i}`,
        v: 4,
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      } as any;
      const metadata: CheckpointMetadata = {
        source: "loop",
        step: 1,
        parents: {},
      };
      const newVersions = {};
      await saver.put(config, checkpoint, metadata, newVersions);
    }

    const result = await purgeExpiredCheckpoints();
    expect(result).toEqual({ expired: 3, skipped: 0 });

    for (let i = 0; i < 3; i++) {
      const remaining = await SELECT.from(DEFAULT_FQN_ENTITY_CHECKPOINTS).where(
        {
          graphName: "test-ttl-multi",
          threadId: `thread-multi-${i}`,
        },
      );
      expect(remaining).toHaveLength(0);
    }
  });
});
