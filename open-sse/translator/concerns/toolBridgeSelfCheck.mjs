// Self-check for OpenAI Tool Bridge.
import { applyOpenAIToolBridge, extractToolCallsFromText } from "./toolBridge.js";
let failures = 0;
const check = (name, condition, detail) => {
  if (condition) { console.log(`  ok   ${name}`); }
  else { failures += 1; console.error(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`); }
};
const body = { tools: [
  { type: "function", function: { name: "read_file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "run_bash", parameters: { type: "object", properties: { command: { type: "string" } } } } },
]};
console.log("1. chat-style tool_call marker");
{
  const r = applyOpenAIToolBridge({ content: 'I will read that file.\n<tool_call>{"name":"read_file","arguments":{"path":"src/app.js"}}</tool_call>\n' }, body);
  check("applied", r.openaiToolBridge.applied === true, JSON.stringify(r.openaiToolBridge));
  check("one call", r.tool_calls?.length === 1);
  check("name", r.tool_calls?.[0]?.function?.name === "read_file");
  check("prose kept", r.content.includes("I will read that file"));
}
console.log("2. Already structured untouched");
{
  const r = applyOpenAIToolBridge({ content: "x", tool_calls: [{ id: "1", type: "function" }] }, body);
  check("skipped", r.openaiToolBridge.applied === false && r.openaiToolBridge.reason === "already-structured");
}
console.log("3. Hallucinated tool dropped");
{
  const r = applyOpenAIToolBridge({ content: '<tool_call>{"name":"delete_everything","arguments":{}}</tool_call>\n' }, body);
  check("dropped", r.openaiToolBridge.applied === false);
}
if (failures) { console.error(`${failures} FAILURES`); process.exit(1); }
console.log("ALL PASS");
