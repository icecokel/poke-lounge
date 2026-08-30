import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PokeLoungeCopy } from "./poke-lounge-copy";
import { PokeLoungePartySlotMenu } from "./party-slot-menu";
import type { PokeLoungePartySlotSummary } from "./runtime/game/ui/mobile-world-ui";
import styles from "./poke-lounge.module.css";

interface SettingsRankingEntry {
  id: string;
  name: string;
  rank: number;
  score: number;
}

export function PokeLoungeSettingsDialog({
  autosaveLabel,
  connectionLabel,
  copy,
  fullscreenActive,
  localRoomShare,
  multiplayer,
  open,
  party,
  ranking,
  rankingStatus,
  roomShareAvailable,
  roomShareStatus,
  uiSize,
  uiSizeLabel,
  volumeAriaLabel,
  volumeLabel,
  volumeLevelIndex,
  onExit,
  onFullscreenToggle,
  onOpenChange,
  onRankingRetry,
  onRoomShare,
  onUiSizeToggle,
  onVolumeCycle,
}: {
  autosaveLabel: string;
  connectionLabel: string;
  copy: PokeLoungeCopy;
  fullscreenActive: boolean;
  localRoomShare: boolean;
  multiplayer: boolean;
  open: boolean;
  party: PokeLoungePartySlotSummary[];
  ranking: SettingsRankingEntry[];
  rankingStatus: "idle" | "loading" | "ready" | "error";
  roomShareAvailable: boolean;
  roomShareStatus: "idle" | "success" | "error";
  uiSize: "normal" | "large";
  uiSizeLabel: string;
  volumeAriaLabel: string;
  volumeLabel: string;
  volumeLevelIndex: number;
  onExit(): void;
  onFullscreenToggle(): void;
  onOpenChange(open: boolean): void;
  onRankingRetry(): void;
  onRoomShare(): void;
  onUiSizeToggle(): void;
  onVolumeCycle(): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.settingsDialog}
        showCloseButton={false}
        data-poke-lounge-settings="true"
      >
        <DialogHeader className={styles.settingsHeader}>
          <DialogTitle className={styles.settingsTitle}>{copy.settingsTitle}</DialogTitle>
          <DialogDescription className={styles.settingsDescription}>
            {copy.settingsDescription}
          </DialogDescription>
        </DialogHeader>
        <div className={styles.settingsOptions}>
          <Button
            type="button"
            variant="outline"
            className={styles.settingsOptionButton}
            onClick={onFullscreenToggle}
            aria-label={fullscreenActive ? copy.fullscreenOff : copy.fullscreenOn}
            aria-pressed={fullscreenActive}
            data-fullscreen-toggle="true"
            data-fullscreen-toggle-placement="settings"
            data-poke-lounge-setting-option="true"
            data-poke-lounge-setting-action="fullscreen"
          >
            {copy.settingsFullscreen}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={styles.settingsOptionButton}
            onClick={onVolumeCycle}
            aria-label={volumeAriaLabel}
            data-poke-lounge-setting-option="true"
            data-poke-lounge-setting-action="volume"
            data-poke-lounge-volume-level={volumeLevelIndex}
          >
            {volumeLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={styles.settingsOptionButton}
            onClick={onUiSizeToggle}
            aria-label={copy.settingsUiSizeAria}
            aria-pressed={uiSize === "large"}
            data-poke-lounge-setting-option="true"
            data-poke-lounge-setting-action="ui-size"
            data-poke-lounge-ui-size={uiSize}
          >
            {uiSizeLabel}
          </Button>
          {roomShareAvailable ? (
            <Button
              type="button"
              variant="outline"
              className={styles.settingsOptionButton}
              onClick={onRoomShare}
              aria-label={localRoomShare ? copy.settingsLocalShare : copy.settingsShare}
              data-poke-lounge-setting-option="true"
              data-poke-lounge-setting-action="share-link"
            >
              {roomShareStatus === "success"
                ? copy.settingsShareCopied
                : roomShareStatus === "error"
                  ? copy.settingsShareFailed
                  : localRoomShare
                    ? copy.settingsLocalShare
                    : copy.settingsShare}
            </Button>
          ) : null}
          {localRoomShare ? (
            <p className={styles.settingsDescription} data-poke-lounge-local-share-notice="true">
              {copy.roomEntry.localDescription}
            </p>
          ) : null}
          <div className={styles.settingsStateSummary} aria-live="polite">
            <span>{multiplayer ? connectionLabel : copy.settingsSolo}</span>
            <span>{autosaveLabel}</span>
          </div>
          <PokeLoungePartySlotMenu copy={copy} party={party} />
          <section className={styles.rankingSection} aria-labelledby="poke-lounge-ranking-title">
            <div className={styles.rankingHeader}>
              <h3 id="poke-lounge-ranking-title">{copy.settingsRankingTitle}</h3>
              <span>{copy.settingsRankingCaption}</span>
            </div>
            {rankingStatus === "loading" ? (
              <p className={styles.rankingEmpty}>{copy.settingsRankingLoading}</p>
            ) : rankingStatus === "error" ? (
              <div className={styles.rankingEmpty}>
                <p>{copy.settingsRankingError}</p>
                <Button type="button" variant="outline" onClick={onRankingRetry}>
                  {copy.settingsRankingRetry}
                </Button>
              </div>
            ) : ranking.length === 0 ? (
              <p className={styles.rankingEmpty}>{copy.settingsRankingEmpty}</p>
            ) : (
              <ol className={styles.rankingList}>
                {ranking.map(entry => (
                  <li key={entry.id}>
                    <span>#{entry.rank}</span>
                    <strong>{entry.name}</strong>
                    <b>{entry.score.toLocaleString(copy.locale)}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <Button
            type="button"
            variant="destructive"
            className={styles.settingsOptionButton}
            onClick={onExit}
            data-poke-lounge-setting-option="true"
            data-poke-lounge-game-exit="true"
          >
            {copy.settingsExit}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={styles.settingsOptionButton}
            onClick={() => onOpenChange(false)}
            data-poke-lounge-setting-option="true"
            data-poke-lounge-settings-cancel="true"
          >
            {copy.settingsClose}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
