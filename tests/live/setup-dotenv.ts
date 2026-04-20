import { config } from "dotenv";
import { resolve } from "node:path";

const quiet = { quiet: true } as const;
config({ path: resolve(process.cwd(), ".env.local"), ...quiet });
config({ path: resolve(process.cwd(), ".env"), ...quiet });
