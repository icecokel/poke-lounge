import type { ReactNode } from "react";
import type { PokeLoungeLocale } from "../poke-lounge-copy";
import { PageReloadButton } from "./page-reload-button";
import styles from "./room-menu.module.css";

export function RoomMenuHeader({
  locale,
  disabled = false,
  className,
  children,
}: {
  locale: PokeLoungeLocale;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <header className={`${styles.header} ${className ?? ""}`}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        <span>POKE LOUNGE</span>
      </div>
      <div className={styles.toolbar}>
        {children}
        <PageReloadButton locale={locale} disabled={disabled} iconOnly />
      </div>
    </header>
  );
}
