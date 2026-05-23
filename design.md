# DESIGN.md - MaeKung Cafe (Kawaii Edition)

## 1. Visual Theme

**Atmosphere:** Super cute, kawaii, bubbly, and playful (Chibi/Cartoon style).
**Style:** Everything is soft, pill-shaped, and bouncy. No sharp corners. UI elements should look like squishy candy or soft toys.

## 2. Color Palette (Kawaii Pastel & Pop)

- **Background:** `#FFF0F5` (Soft Lavender Blush / Cotton Candy Pink)
- **Primary Action (Perfect/Success):** `#A7F3D0` (Minty Pastel Green)
- **Secondary (Panels/UI Base):** `#FFFFFF` (Pure White with soft shadows)
- **Accent (Warning/Miss):** `#FDA4AF` (Soft Bubblegum Pink)
- **Text:** `#57534E` (Soft Brown/Charcoal, avoid pure black for a softer look)
- **Coins/Money:** `#FDE047` (Bright Lemon Yellow)

## 3. Typography

- **Font Family:** ` 'Mali', 'Itim', 'Sniglet', 'Comic Sans MS', cursive` (Use bubbly, handwritten, or very rounded fonts).
- **Headers:** Extra bold, letter-spacing slightly tight, with a subtle text-shadow to make it pop like a cartoon logo.
- **Numbers:** Large and chunky.

## 4. Components & Interactive Elements

**Buttons (Squishy Game Feel):**

- **Shape:** `border-radius: 999px;` (Pill shape for wide buttons) or `50%` for circular ones.
- **Border:** `3px solid #57534E` (Thick cartoonish outlines).
- **3D Effect (Cartoon Style):** Heavy solid drop shadow using the border color (e.g., `box-shadow: 0 4px 0 #57534E`).
- **Hover/Active State:** - `hover`: Slightly scale up (`transform: scale(1.05)`).
  - `active`: Translate down (`transform: translateY(4px)`) and remove the `box-shadow` to simulate squishing the button.

**Progress Bars (Chunky & Cute):**

- Super thick (`height: 36px`).
- `border-radius: 20px;`
- **Border:** `3px solid #57534E`.
- **Fill:** Bright pastel colors with a subtle striped pattern or inner glow to look like a candy bar.

**Cards / Shop Panels:**

- Background: White (`#FFFFFF`).
- Border: `3px solid #57534E`.
- Corner: `border-radius: 24px;`
- Shadow: `box-shadow: 6px 6px 0px rgba(87, 83, 78, 0.2);` (Hard, slightly offset pastel shadow).

## 5. Animations (Bouncy Vibe)

- Apply a subtle "breathing" or "floating" CSS keyframe animation to the main header or character placeholders.
- When earning coins, the `+10` text should pop up with a bouncy easing curve (`cubic-bezier(0.68, -0.55, 0.265, 1.55)`).
