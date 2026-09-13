import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

// This is a focused regression, not a complete player-playthrough verdict.
// A fresh real API environment is required; no game state or network fixture is injected.
test.skip(
  process.env.POKE_LOUNGE_E2E_ENV_ISOLATED !== "1",
  "Requires a disposable, isolated API environment",
);

test("대기실 초대 복사 버튼은 복사 전후 모두 표시 문구로 접근할 수 있다", async ({ page, context, browserName }) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.goto("/ko-KR/game/poke-lounge", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "▸트레이너 닉네임", exact: true }).fill("접근성회귀");
  await page
    .getByRole("textbox", { name: "▸임시 비밀번호", exact: true })
    .fill(randomBytes(3).toString("hex"));
  await page.getByRole("button", { name: "비공개 방 만들기", exact: true }).click();
  const lobby = page.getByRole("region", { name: "챔피언십 대기실", exact: true });
  await expect(lobby).toBeVisible();
  try {
    const share = lobby.getByRole("button", { name: "초대 링크 복사", exact: true });
    await expect(share).toBeVisible();
    await expect(share).toHaveAccessibleName("초대 링크 복사");
    await share.click();
    const copied = lobby.getByRole("button", { name: "링크 복사됨", exact: true });
    await expect(copied).toBeVisible();
    await expect(copied).toHaveAccessibleName("링크 복사됨");
    await expect(copied.getByRole("status")).toHaveText("링크 복사됨");
    await expect(lobby.getByRole("button", { name: "준비", exact: true })).toBeEnabled();
    await expect(lobby.getByRole("button", { name: "게임 시작", exact: true })).toBeDisabled();
  } finally {
    await page.getByRole("button", { name: "Poke Lounge 설정 열기", exact: true }).click();
    await page.getByRole("button", { name: "방 나가기", exact: true }).click();
    await page
      .getByRole("alertdialog", { name: "방에서 나갈까요?", exact: true })
      .getByRole("button", { name: "방 나가기", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "방 만들기", exact: true })).toBeVisible();
  }
});
