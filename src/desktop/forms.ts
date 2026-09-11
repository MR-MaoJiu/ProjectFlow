import Ajv2020 from "ajv/dist/2020.js";
export function formReply(schema: any, answers: Record<string, string>) {
  if (!schema || schema.type !== "object")
    throw new Error("此表单结构暂不支持，请取消并检查工具要求");
  const content: Record<string, unknown> = Object.create(null);
  for (const [key, definition] of Object.entries(schema.properties ?? {})) {
    const field = definition as any;
    const raw = answers[key];
    if (raw === undefined || raw === "") continue;
    if (field.type === "boolean") {
      if (!["true", "false"].includes(raw)) throw new Error("请选择是或否");
      content[key] = raw === "true";
    } else if (field.type === "number" || field.type === "integer") {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("请输入有效数字");
      content[key] = value;
    } else if (field.type === "object" || field.type === "array") {
      try {
        content[key] = JSON.parse(raw);
      } catch {
        throw new Error(`${field.title ?? key} 需要有效 JSON`);
      }
    } else content[key] = raw;
  }
  const normalized = { ...schema };
  delete normalized.$schema;
  const validator = new Ajv2020({ strict: false, allErrors: true }).compile(
    normalized,
  );
  if (!validator(content))
    throw new Error(
      "表单未完成：" +
        validator.errors
          ?.map((e) => `${e.instancePath || "输入"} ${e.message}`)
          .join("；"),
    );
  return content;
}
