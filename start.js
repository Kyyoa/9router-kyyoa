// Botkeep start shim: bind 0.0.0.0 on the port the platform assigns.
process.env.PORT = process.env.PORT || process.env.SERVER_PORT || "3000";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.DATA_DIR = process.env.DATA_DIR || "/home/container/data";

// custom-server.js installs the http.createServer wrapper as a side effect.
require("./custom-server.js");
// Next standalone server reads PORT/HOSTNAME at module load.
require("./server.js");
