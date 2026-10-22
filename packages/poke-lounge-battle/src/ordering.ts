/** 서버 ID는 ASCII(영숫자·하이픈·밑줄)이므로 UTF-16 비교 = Rust의 UTF-8 바이트 비교. */
export function compareServerIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
