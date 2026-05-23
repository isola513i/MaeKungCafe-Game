# MaeKung Cafe

MaeKung Cafe is a cozy web cafe game built with Vite, TypeScript, and vanilla CSS. The player brews drinks, serves customers, and spends coins on upgrades while managing timing-based cooking stations and passive income.

## Features

- Coffee station with recipe selection for `Espresso` and `Latte`
- Latte uses a two-stage flow: brew, then milk steaming
- Waffle and smoothie stations with different timing mechanics
- Customer queue with patience timers and angry timeout exits
- Shop upgrades for better rewards, new stations, and assistant income
- Local save/load with `localStorage`
- Reset Game button to clear progress

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## Controls

- Use the kitchen station buttons to cook items
- Select `Espresso` or `Latte` before starting coffee
- Serve orders before the patience bar runs out
- Buy upgrades from the Shop panel
- Use `Reset Game` to wipe the save and start over

## Tech Stack

- Vite
- TypeScript
- Vanilla HTML, CSS, and DOM APIs

