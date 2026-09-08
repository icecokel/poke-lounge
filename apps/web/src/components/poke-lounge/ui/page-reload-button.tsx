"use client";

import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PokeLoungeLocale } from "../poke-lounge-copy";
import styles from "./page-reload-button.module.css";

const messages = {
  "ko-KR": {
    label: "새로고침",
    title: "화면을 새로 불러올까요?",
    description:
      "페이지 전체를 다시 불러옵니다. 저장 데이터는 삭제하지 않지만 진행 중인 야생전과 선택 화면은 유지되지 않을 수 있습니다. 방에 다시 연결되는 동안에도 대회 시간은 계속 흐릅니다.",
    cancel: "계속 플레이",
    confirm: "새로고침",
  },
  "en-US": {
    label: "Reload",
    title: "Reload this page?",
    description:
      "This reloads the entire page without deleting saved data. A wild battle or unfinished selection may not be preserved. Tournament timers continue while reconnecting to the room.",
    cancel: "Keep playing",
    confirm: "Reload",
  },
  "ja-JP": {
    label: "再読み込み",
    title: "画面を再読み込みしますか？",
    description:
      "保存データは削除せず、ページ全体を再読み込みします。進行中の野生バトルや選択は保持されない場合があります。部屋へ再接続する間も大会の時間は進みます。",
    cancel: "プレイを続ける",
    confirm: "再読み込み",
  },
} satisfies Record<
  PokeLoungeLocale,
  { label: string; title: string; description: string; cancel: string; confirm: string }
>;

/** Reload the document, not the client router. Never clear storage or submit a leave command. */
export function PageReloadButton({
  locale,
  disabled = false,
  confirmBeforeReload = false,
}: {
  locale: PokeLoungeLocale;
  disabled?: boolean;
  confirmBeforeReload?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const submitted = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const text = messages[locale];
  const reload = () => {
    if (submitted.current) return;
    submitted.current = true;
    setPending(true);
    // Keep the current URL/session identity for the existing reconnect flow.
    window.location.reload();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.button}
        disabled={disabled || pending}
        data-poke-lounge-page-reload
        onClick={() => (confirmBeforeReload ? setOpen(true) : reload())}
      >
        <span aria-hidden="true">↻</span>
        {text.label}
      </button>
      {confirmBeforeReload ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent
            className={styles.dialog}
            data-poke-lounge-reload-confirm
            onCloseAutoFocus={event => {
              event.preventDefault();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{text.title}</AlertDialogTitle>
              <AlertDialogDescription className={styles.description}>
                {text.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
              <AlertDialogAction disabled={pending} onClick={reload}>
                {text.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
