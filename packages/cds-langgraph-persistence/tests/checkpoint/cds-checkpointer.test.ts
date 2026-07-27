import {
  Checkpoints,
  CheckpointWrites,
} from "#cds-models/plugin/langgraph/persistence";
import { CdsCheckpointSaver } from "@/index";
import {
  CheckpointSaverTestInitializer,
  validate,
} from "@langchain/langgraph-checkpoint-validation";
import cds from "@sap/cds";
import { fileURLToPath } from "url";

export const cdsCheckpointSaverTestInitializer: CheckpointSaverTestInitializer<CdsCheckpointSaver> =
  {
    checkpointerName: "@mi8y/cds-langgraph-persistence",

    async beforeAll() {
      // since tests are run from the root of the monorepo, we need to set the cds.root to the path of the package
      cds.root = fileURLToPath(import.meta.resolve("@mi8y/cds-langgraph-persistence"));

      // cds file from @mi8y/langgraph-cds-model package
      const cdsFilePath = fileURLToPath(
        import.meta.resolve("@mi8y/cds-langgraph-persistence/index.cds"),
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
    },

    async afterAll() {
      // @ts-ignore
      await cds.db.disconnect?.();
    },

    async createCheckpointer() {
      return new CdsCheckpointSaver({ name: "test" });
    },

    async destroyCheckpointer() {
      await DELETE.from(CheckpointWrites);
      await DELETE.from(Checkpoints);
    },
  };

validate(cdsCheckpointSaverTestInitializer);
