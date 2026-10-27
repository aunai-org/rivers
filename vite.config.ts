import { defineConfig, type Plugin } from "vite";
import { buildDataset } from "./data/build";
import { buildAssets } from "./data/geo/assets";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/**
 * The dataset is a static file, built with the site. `vite build` runs buildDataset() (data/build.ts) once and writes
 * `data.json` next to the page, so a visit costs no server work. The dev server serves the same dataset live.
 * Replace data/build.ts to load your own data; nothing else here needs to change.
 */
function dataset(): Plugin {
  return {
    name: "earth-dataset",
    configureServer(server) {
      server.middlewares.use("/data.json", async (_req, res) => {
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(await buildDataset()));
      });
      // The inflated map and the rivers (data/geo/assets.ts): built once, on first request.
      for (const name of ["inflate", "rivers"] as const) {
        server.middlewares.use(`/${name}.json`, async (_req, res) => {
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify((await buildAssets())[name]));
        });
      }
    },
    async generateBundle() {
      const data = await buildDataset();
      // Refuse to ship an empty dataset: a failed build leaves the last good deploy live.
      if (!data.hubs.length) this.error("buildDataset() returned no hubs; not building without data.");
      this.emitFile({ type: "asset", fileName: "data.json", source: JSON.stringify(data) });
      this.info(`data.json: ${data.hubs.length} hubs, ${data.items.length} items, ${data.nodes.length} nodes`);
      const assets = await buildAssets();
      this.emitFile({ type: "asset", fileName: "inflate.json", source: JSON.stringify(assets.inflate) });
      this.emitFile({ type: "asset", fileName: "rivers.json", source: JSON.stringify(assets.rivers) });
      this.info(`inflate.json: ${assets.inflate.countries.length} countries · rivers.json: ${assets.rivers.rivers.length} rivers`);
    },
  };
}

export default defineConfig({
  plugins: [dataset()],
  server: { port: Number(env.PORT) || 5173 },
});
