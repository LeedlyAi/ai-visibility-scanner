import { createServer } from "node:http";
import { createLiveHandler } from "./http.js";
import { readConfig } from "./config.js";

const config = readConfig(process.env);
createServer(createLiveHandler(config)).listen(config.port, "0.0.0.0");
