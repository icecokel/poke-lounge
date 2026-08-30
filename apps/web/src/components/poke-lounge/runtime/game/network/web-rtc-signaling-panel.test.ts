import assert from "node:assert/strict";
import test from "node:test";
import { getWebRtcSignalingCopy } from "./webRtcSignalingPanel";

const HANGUL_PATTERN = /[\u3131-\u318e\uac00-\ud7a3]/;

test("WebRTC 수동 연결 패널은 영어와 일본어 문구를 제공한다", () => {
  const english = getWebRtcSignalingCopy("en-US");
  const japanese = getWebRtcSignalingCopy("ja-JP");

  assert.equal(english.waiting, "Waiting for manual connection");
  assert.equal(english.createOffer, "Create offer");
  assert.equal(english.failed, "WebRTC action failed");
  assert.equal(japanese.waiting, "手動接続を待機中");
  assert.equal(japanese.leave, "退出");
  assert.equal(japanese.failed, "WebRTCの処理に失敗しました");
  assert.doesNotMatch(Object.values(english).join(" "), HANGUL_PATTERN);
  assert.doesNotMatch(Object.values(japanese).join(" "), HANGUL_PATTERN);
});
