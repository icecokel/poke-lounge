import type { PcTransferResult } from "../../application/world/pc-transfer";
export function formatPcTransferResult(result: PcTransferResult): string {
  switch (result.kind) {
    case "deposited":
      return `${result.name}을 PC 박스에 보관했다.`;
    case "withdrawn":
      return `${result.name}을 파티로 데려왔다.`;
    case "swapped":
      return `${result.name}와 파티 포켓몬을 교체했다.`;
    case "rejected":
      return {
        "last-pokemon": "마지막 포켓몬은 보관할 수 없다.",
        "empty-party": "선택한 파티 슬롯이 비어 있다.",
        "empty-box": "박스가 비어 있다.",
        "invalid-box": "선택한 박스 슬롯이 비어 있다.",
        "select-party": "교체할 파티 포켓몬을 선택해라.",
        "fainted-active-replacement": "기절한 포켓몬은 선두 슬롯으로 교체할 수 없다.",
      }[result.reason];
  }
}
