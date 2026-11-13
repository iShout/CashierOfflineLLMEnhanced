import { z } from "zod";
import { createCashierModel } from "../model.js";

const recommendationSchema = z.object({
  recommendation: z.string(),
});

export async function main() {
  const model = createCashierModel().withStructuredOutput(recommendationSchema, {
    name: "sales_recommendation",
    method: "functionCalling",
  });

  const result = await model.invoke(
    "两天的销售额从 1000.00 降到 800.00。请给出一条可执行的核查建议。只根据已知数据，不断言下降原因。",
  );

  console.log(result.recommendation);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
