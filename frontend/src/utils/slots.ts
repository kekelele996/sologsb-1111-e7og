/** 解析破损格序号文本（逗号/空格分隔），去重、升序，只保留正整数 */
export function parseSlots(text: string | undefined | null): number[] {
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .split(/[,，\s]+/)
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0),
    ),
  ).sort((a, b) => a - b);
}
