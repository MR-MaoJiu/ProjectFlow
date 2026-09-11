import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CodexRuntime } from "../src/desktop/codex";
async function fixture(t: any) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "projectflow-rpc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fake = path.join(dir, "codex");
  await writeFile(
    fake,
    `#!/usr/bin/env node
const readline=require('node:readline');const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===77&&m.result){send({method:'mock/answer',params:m.result});return;}if(m.method==='initialize')send({id:m.id,result:{serverInfo:{version:'test'}}});else if(m.method==='question'){send({id:m.id,result:{ok:true}});send({id:77,method:'item/commandExecution/requestApproval',params:{threadId:'t',command:'echo test',cwd:'/test'}});}else if(m.method==='input'){send({id:m.id,result:{ok:true}});send({id:77,method:'item/tool/requestUserInput',params:{threadId:'t',questions:[{id:'q',question:'选择方向'}]}});}else if(m.method==='unknown'){send({id:99,method:'future/unsupported',params:{}});send({id:m.id,result:{ok:true}});}else if(m.method==='slow'){setTimeout(()=>send({id:m.id,result:{value:'slow'}}),30);}else if(m.method==='fast')send({id:m.id,result:{value:'fast'}});});
`,
  );
  await chmod(fake, 0o700);
  const runtime = new CodexRuntime(
    fake,
    process.execPath,
    "/unused/server.mjs",
  );
  t.after(() => runtime.stop());
  await runtime.start();
  return runtime;
}
const wait = async (fn: () => boolean) => {
  for (let i = 0; i < 100 && !fn(); i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(fn());
};
test("桌面 RPC 按 ID 分发乱序响应并完成握手", async (t) => {
  const runtime = await fixture(t);
  assert.equal(runtime.connected, true);
  const [a, b] = await Promise.all([
    runtime.call("slow", {}),
    runtime.call("fast", {}),
  ]);
  assert.equal(a.value, "slow");
  assert.equal(b.value, "fast");
});
test("审批不会自动通过，显式回答后从队列移除", async (t) => {
  const runtime = await fixture(t);
  await runtime.call("question", {});
  await wait(() => runtime.getApprovals().length === 1);
  assert.equal(
    runtime.events.filter((e) => e.method === "mock/answer").length,
    0,
  );
  runtime.answer("77", "decline");
  await wait(() => runtime.events.some((e) => e.method === "mock/answer"));
  assert.equal(
    runtime.events.find((e) => e.method === "mock/answer")!.params.decision,
    "decline",
  );
  assert.equal(runtime.getApprovals().length, 0);
  assert.throws(() => runtime.answer("77", "accept"), /失效/);
});
test("用户问题要求答案且未知交互不会被自动批准", async (t) => {
  const runtime = await fixture(t);
  await runtime.call("input", {});
  await wait(() => runtime.getApprovals().length === 1);
  assert.throws(() => runtime.answer("77", "accept", {}), /回答每个问题/);
  runtime.answer("77", "accept", { q: "先完成首版" });
  await wait(() => runtime.events.some((e) => e.method === "mock/answer"));
  assert.deepEqual(
    runtime.events.find((e) => e.method === "mock/answer")!.params.answers.q
      .answers,
    ["先完成首版"],
  );
  await runtime.call("unknown", {});
  assert.equal(runtime.getApprovals().length, 0);
});

test("MCP 授权表单严格校验用户选择，不使用默认值自动授权", async () => {
  const { formReply } = await import("../src/desktop/forms");
  const schema = {
    type: "object",
    properties: {
      allowed: { type: "boolean" },
      scope: { type: "string", enum: ["once", "session"] },
    },
    required: ["allowed", "scope"],
    additionalProperties: false,
  };
  assert.throws(() => formReply(schema, {}), /未完成/);
  assert.throws(
    () => formReply(schema, { allowed: "true", scope: "all" }),
    /未完成/,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(formReply(schema, { allowed: "true", scope: "once" })),
    ),
    { allowed: true, scope: "once" },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(formReply({ type: "object", properties: {} }, {})),
    ),
    {},
  );
});

test("自动运行按项目保存、重启恢复并可关闭，不使用全局权限配置", async (t) => {
  const { ExecutionSettings, executionPolicy } = await import("../src/desktop/execution-settings");
  const dir = await mkdtemp(path.join(os.tmpdir(), "pf-execution-settings-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settings = new ExecutionSettings(dir);
  assert.equal(await settings.get("/project/a"), false);
  await settings.set("/project/a", true);
  assert.equal(await new ExecutionSettings(dir).get("/project/a"), true);
  assert.equal(await settings.get("/project/b"), false);
  assert.deepEqual(executionPolicy(await settings.get("/project/a")), { approvalPolicy: "on-request", approvalsReviewer: "auto_review" });
  await settings.set("/project/a", false);
  assert.deepEqual(executionPolicy(await settings.get("/project/a")), { approvalPolicy: "on-request", approvalsReviewer: "user" });
  await assert.rejects(() => settings.set("/project/a", "true"), /布尔值/);
  assert.equal(await settings.get("/project/a"), false);
});
