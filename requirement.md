# Game Requirements: MaeKung Cafe - Rush Hour

## 1. Core Concept

A casual web game combining Timing-Mechanics and Idle-Management. The player acts as a barista brewing perfect cups of black coffee and serving high-protein snacks to earn coins and upgrade the cafe.

## 2. UI Layout

The screen is divided into two main sections using CSS Flexbox/Grid:

- **Left Panel (Kitchen/Action Zone):** Where the player actively brews coffee.
- **Right Panel (Shop/Upgrade Zone):** Where the player spends coins to improve the cafe.
- **Header:** Displays the current `Coins` balance prominently.

## 3. Game Mechanics

### Phase 1: The Core Action (Timing Game)

- **Cooking Station:** Starts with 1 coffee machine.
- **Action:** Player clicks a "Brew" button.
- **Progress Bar:** A bar fills from 0% to 100% over 2.5 seconds.
- **Success Zone:** A visual indicator on the bar represents the "Perfect Zone" (e.g., 70% to 85%).
- **Resolution:** Player must click "Serve" while the progress is in the Success Zone.
  - **Perfect (In Zone):** Rewards base price (e.g., +10 Coins), triggers a "Perfect!" floating text, bar resets.
  - **Under-brewed (Before Zone):** Rewards partial price (e.g., +2 Coins), triggers "Too early!", bar resets.
  - **Burnt (After Zone / 100%):** Rewards 0 Coins, triggers "Burnt!", requires a 1-second cooldown penalty before resetting.

### Phase 2: Upgrades & Management

The Shop panel contains upgrade buttons. Buttons are disabled if the player has insufficient coins.

1. **Premium Beans (Cost: 50 Coins, Scales up):**
   - Increases the coin reward for a "Perfect" brew by 1.5x.
2. **Buy New Machine (Cost: 150 Coins):**
   - Adds another independent cooking station to the Left Panel, allowing parallel brewing. Max 4 stations.
3. **Hire Assistant (Cost: 300 Coins):**
   - Generates idle income (+5 Coins per second automatically).

### Phase 3: Visuals & Feedback (Vibe)

- **Colors:** Warm browns, cream, and soft pastels.
- **Animations:**
  - Smooth width transitions for the progress bar.
  - CSS keyframe animations for floating text (e.g., "+10 Coins" fading up and disappearing).
- **Buttons:** Tactile feel (scale down slightly on active click, hover effects).
