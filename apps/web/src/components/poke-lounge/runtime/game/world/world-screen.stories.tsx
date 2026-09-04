import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import styles from "../../../poke-lounge.module.css";
import themeStyles from "../../../poke-lounge-theme.module.css";
import {
  createStoryWorldStores,
  storyCopy,
  storyMobileWorldState,
  storyWorldAtlas,
  storyWorldModel,
} from "../../../poke-lounge-story-fixtures";
import { WorldScreen } from "./world-screen";

const meta = {
  title: "Poke Lounge/World",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    function callback(Story) {
      return (
        <main className={`${styles.page} ${themeStyles.theme}`} style={{ minHeight: "100vh" }}>
          <div className={styles.gameFrame}>
            <Story />
          </div>
        </main>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function renderWorld(options?: {
  pokemonStatus?: boolean;
  surface?: typeof storyMobileWorldState.screen;
}) {
  const stores = createStoryWorldStores();
  stores.uiStore.publishPresentation({
    areaAnnouncement: "포켓 라운지 마을",
    interactionPrompt: "Enter: 상호작용",
    nurseHealing: { active: true, effectCount: 1 },
    nurseMessage: "포켓몬이 건강해졌습니다!",
    pokemonStatusSlotIndex: options?.pokemonStatus ? 0 : null,
  });
  if (options?.surface) {
    stores.uiStore.publishMobile({
      ...storyMobileWorldState,
      screen: options.surface,
      title: options.surface === "shop" ? "프렌들리 숍" : "가방",
    });
  }

  return (
    <WorldScreen
      atlas={storyWorldAtlas}
      competitiveRoundsEnabled
      copy={storyCopy}
      desktop
      frameStore={stores.frameStore}
      gameStateStore={stores.gameStateStore}
      model={storyWorldModel}
      uiStore={stores.uiStore}
    />
  );
}

export const FieldAndHud: Story = {
  render: () => renderWorld(),
};

export const PokemonStatus: Story = {
  render: () => renderWorld({ pokemonStatus: true }),
};

export const InventorySurface: Story = {
  render: () => renderWorld({ surface: "inventory-items" }),
};

export const ShopSurface: Story = {
  render: () => renderWorld({ surface: "shop" }),
};
