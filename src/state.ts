// ---------------------------------------------------------------------------
// Station kinds & configs (Phase 3)
// ---------------------------------------------------------------------------

export type StationKind = "coffee" | "waffle" | "smoothie";
export type CoffeeRecipe = "espresso" | "latte";
export type MenuItemId =
	| "espresso"
	| "latte"
	| "plain-waffle"
	| "choco-waffle"
	| "berry-smoothie"
	| "mint-frappe";

/**
 * Each station has a different interaction mechanic:
 *   - hold:   press & hold, release inside the perfect zone (Coffee).
 *   - mash:   spam-click N times before the timer runs out (Smoothie).
 *   - double: auto-fill bar with TWO timed click windows (Waffle).
 */
export type StationMechanic = "hold" | "mash" | "double";

export interface StationConfig {
	kind: StationKind;
	mechanic: StationMechanic;
	emoji: string;
	name: string;
	/** For hold/double: total bar-fill duration. For mash: time limit. (ms) */
	durationMs: number;
	/** Primary success window (also the "serve" window for the double mechanic). */
	perfectMin: number;
	perfectMax: number;
	/** Optional first window used by the double mechanic (waffle flip). */
	flipMin?: number;
	flipMax?: number;
	/** Number of clicks required to fill the bar for the mash mechanic. */
	clicksRequired?: number;
	baseReward: number;
	unlockCost: number; // 0 for default-unlocked station
}

export interface TimedStageConfig {
	durationMs: number;
	perfectMin: number;
	perfectMax: number;
}

export interface CoffeeRecipeConfig {
	id: CoffeeRecipe;
	itemId: MenuItemId;
	emoji: string;
	label: string;
	brew: TimedStageConfig;
	milk?: TimedStageConfig;
}

export const STATION_CONFIGS: Record<StationKind, StationConfig> = {
	coffee: {
		kind: "coffee",
		mechanic: "hold",
		emoji: "☕",
		name: "Coffee Machine",
		durationMs: 2500,
		perfectMin: 0.7,
		perfectMax: 0.85,
		baseReward: 15,
		unlockCost: 0,
	},
	waffle: {
		kind: "waffle",
		mechanic: "double",
		emoji: "🧇",
		name: "Waffle Maker",
		durationMs: 4000,
		flipMin: 0.4,
		flipMax: 0.5,
		perfectMin: 0.8,
		perfectMax: 0.9,
		baseReward: 30,
		unlockCost: 150,
	},
	smoothie: {
		kind: "smoothie",
		mechanic: "mash",
		emoji: "🥤",
		name: "Smoothie Blender",
		durationMs: 3000, // mash time limit
		perfectMin: 1,
		perfectMax: 1,
		clicksRequired: 10,
		baseReward: 40,
		unlockCost: 300,
	},
};

export const STATION_KIND_ORDER: readonly StationKind[] = [
	"coffee",
	"waffle",
	"smoothie",
] as const;

export const COFFEE_RECIPE_CONFIGS: Record<CoffeeRecipe, CoffeeRecipeConfig> = {
	espresso: {
		id: "espresso",
		itemId: "espresso",
		emoji: "☕",
		label: "Espresso",
		brew: {
			durationMs: STATION_CONFIGS.coffee.durationMs,
			perfectMin: STATION_CONFIGS.coffee.perfectMin,
			perfectMax: STATION_CONFIGS.coffee.perfectMax,
		},
	},
	latte: {
		id: "latte",
		itemId: "latte",
		emoji: "🥛",
		label: "Latte",
		brew: {
			durationMs: STATION_CONFIGS.coffee.durationMs,
			perfectMin: STATION_CONFIGS.coffee.perfectMin,
			perfectMax: STATION_CONFIGS.coffee.perfectMax,
		},
		milk: {
			durationMs: 1900,
			perfectMin: 0.56,
			perfectMax: 0.72,
		},
	},
};

// ---------------------------------------------------------------------------
// Menu items (Phase 5)
//
// Customers order specific menu items, and fulfillment should target those
// exact items rather than only the broader station kind.
// ---------------------------------------------------------------------------

export interface MenuItem {
	id: MenuItemId;
	kind: StationKind;
	emoji: string;
	name: string;
}

export const MENU_ITEMS: readonly MenuItem[] = [
	{ id: "espresso", kind: "coffee", emoji: "☕", name: "Espresso" },
	{ id: "latte", kind: "coffee", emoji: "🥛", name: "Latte" },
	{ id: "plain-waffle", kind: "waffle", emoji: "🧇", name: "Plain Waffle" },
	{ id: "choco-waffle", kind: "waffle", emoji: "🍫", name: "Choco Waffle" },
	{
		id: "berry-smoothie",
		kind: "smoothie",
		emoji: "🍓",
		name: "Berry Smoothie",
	},
	{ id: "mint-frappe", kind: "smoothie", emoji: "🌿", name: "Mint Frappe" },
] as const;

// ---------------------------------------------------------------------------
// State model
// ---------------------------------------------------------------------------

export interface Station {
	id: string;
	kind: StationKind;
}

export interface Upgrades {
	premiumBeansLevel: number;
	assistants: number;
}

export interface Customer {
	id: string;
	item: MenuItem;
	spawnedAt: number;
	/** Total patience window in ms. The order card renders a shrinking bar
	 * relative to (now - spawnedAt) / patienceMs. */
	patienceMs: number;
}

export interface GameState {
	coins: number;
	stations: Station[];
	unlocks: Record<StationKind, boolean>;
	upgrades: Upgrades;
	customers: Customer[];
}

export const COSTS = {
	premiumBeans: 50,
	hireAssistant: 300,
} as const;

export const MAX_CUSTOMERS = 3;
export const CUSTOMER_SPAWN_INTERVAL_MS = 4000;
export const ASSISTANT_INCOME = 5;
export const ASSISTANT_INTERVAL_MS = 1000;

/**
 * Per-kind patience windows (ms). Coffee is the most forgiving since it
 * has the simplest mechanic; smoothie is shortest because the mash is fast.
 */
export const PATIENCE_MS: Record<StationKind, number> = {
	coffee: 22000,
	waffle: 26000,
	smoothie: 18000,
};

type Listener = (state: GameState) => void;

const initialState: GameState = {
	coins: 0,
	stations: [{ id: "station-coffee", kind: "coffee" }],
	unlocks: { coffee: true, waffle: false, smoothie: false },
	upgrades: {
		premiumBeansLevel: 0,
		assistants: 0,
	},
	customers: [],
};

let state: GameState = structuredClone(initialState);
const listeners = new Set<Listener>();
let customerSeq = 0;

export function getState(): GameState {
	return state;
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	listener(state);
	return () => {
		listeners.delete(listener);
	};
}

export function setState(patch: Partial<GameState>): void {
	state = { ...state, ...patch };
	notify();
}

function notify(): void {
	for (const listener of listeners) {
		listener(state);
	}
}

export function addCoins(amount: number): void {
	if (amount === 0) return;
	setState({ coins: Math.max(0, state.coins + amount) });
}

export function getPerfectMultiplier(): number {
	return Math.pow(1.5, state.upgrades.premiumBeansLevel);
}

export function getPerfectReward(kind: StationKind): number {
	return Math.round(STATION_CONFIGS[kind].baseReward * getPerfectMultiplier());
}

// ---------------------------------------------------------------------------
// Shop / upgrade actions
// ---------------------------------------------------------------------------

export function buyPremiumBeans(): boolean {
	if (state.coins < COSTS.premiumBeans) return false;
	state = {
		...state,
		coins: state.coins - COSTS.premiumBeans,
		upgrades: {
			...state.upgrades,
			premiumBeansLevel: state.upgrades.premiumBeansLevel + 1,
		},
	};
	notify();
	return true;
}

export function unlockStation(kind: StationKind): {
	ok: boolean;
	station?: Station;
} {
	if (state.unlocks[kind]) return { ok: false };
	const cost = STATION_CONFIGS[kind].unlockCost;
	if (cost <= 0) return { ok: false };
	if (state.coins < cost) return { ok: false };
	const newStation: Station = { id: `station-${kind}`, kind };
	state = {
		...state,
		coins: state.coins - cost,
		unlocks: { ...state.unlocks, [kind]: true },
		stations: [...state.stations, newStation],
	};
	notify();
	return { ok: true, station: newStation };
}

export function hireAssistant(): boolean {
	if (state.coins < COSTS.hireAssistant) return false;
	state = {
		...state,
		coins: state.coins - COSTS.hireAssistant,
		upgrades: {
			...state.upgrades,
			assistants: state.upgrades.assistants + 1,
		},
	};
	notify();
	return true;
}

// ---------------------------------------------------------------------------
// Customer queue
// ---------------------------------------------------------------------------

export function spawnCustomer(): Customer | null {
	if (state.customers.length >= MAX_CUSTOMERS) return null;
	const available = MENU_ITEMS.filter((item) => state.unlocks[item.kind]);
	if (available.length === 0) return null;
	const item = available[Math.floor(Math.random() * available.length)]!;
	const customer: Customer = {
		id: `cust-${++customerSeq}`,
		item,
		spawnedAt: performance.now(),
		patienceMs: PATIENCE_MS[item.kind],
	};
	state = { ...state, customers: [...state.customers, customer] };
	notify();
	return customer;
}

/**
 * Removes a customer whose patience has run out. Returns the customer that
 * left (or null if the id no longer exists, e.g. the order was just served).
 */
export function timeoutCustomer(id: string): Customer | null {
	const idx = state.customers.findIndex((c) => c.id === id);
	if (idx < 0) return null;
	const customer = state.customers[idx]!;
	const next = state.customers.slice();
	next.splice(idx, 1);
	state = { ...state, customers: next };
	notify();
	return customer;
}

/**
 * Returns the oldest waiting customer for a given station kind without
 * changing state.
 */
export function getOldestCustomerForKind(kind: StationKind): Customer | null {
	return state.customers.find((c) => c.item.kind === kind) ?? null;
}

/**
 * Attempts to fulfill the oldest waiting customer for the exact completed
 * menu item id. Returns the fulfilled customer (now removed from the queue),
 * or null if no customer matches that specific item.
 */
export function fulfillOrder(itemId: MenuItemId): Customer | null {
	const idx = state.customers.findIndex((c) => c.item.id === itemId);
	if (idx < 0) return null;
	const customer = state.customers[idx]!;
	const next = state.customers.slice();
	next.splice(idx, 1);
	state = { ...state, customers: next };
	notify();
	return customer;
}

// ---------------------------------------------------------------------------
// Persistence (localStorage)
//
// We persist only the durable bits: coins, unlocks, and upgrades. Stations
// are derived from unlocks at load time, and customers are transient — they
// regenerate after the spawn interval so there's no point in saving them.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "maekung-cafe-save-v1";

interface SaveSnapshot {
	v: 1;
	coins: number;
	unlocks: Record<StationKind, boolean>;
	upgrades: Upgrades;
}

function stationsFromUnlocks(unlocks: Record<StationKind, boolean>): Station[] {
	return STATION_KIND_ORDER.filter((k) => unlocks[k]).map((k) => ({
		id: `station-${k}`,
		kind: k,
	}));
}

/**
 * Reads the save slot and merges it into the live state. Silently ignores
 * missing/corrupt saves so a first-run player just sees the initial state.
 * Does NOT notify listeners on its own — main.ts calls this BEFORE wiring
 * subscribers, so the very first listener invocation already sees the
 * restored state.
 */
export function loadFromStorage(): boolean {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return false;
		const data = JSON.parse(raw) as Partial<SaveSnapshot>;
		if (!data || data.v !== 1) return false;
		const unlocks: Record<StationKind, boolean> = {
			coffee: true, // coffee is always unlocked
			waffle: Boolean(data.unlocks?.waffle),
			smoothie: Boolean(data.unlocks?.smoothie),
		};
		const upgrades: Upgrades = {
			premiumBeansLevel: Math.max(
				0,
				Number(data.upgrades?.premiumBeansLevel ?? 0) | 0,
			),
			assistants: Math.max(0, Number(data.upgrades?.assistants ?? 0) | 0),
		};
		state = {
			...state,
			coins: Math.max(0, Number(data.coins ?? 0) | 0),
			unlocks,
			upgrades,
			stations: stationsFromUnlocks(unlocks),
		};
		return true;
	} catch {
		return false;
	}
}

/** Writes the durable bits of state to localStorage. Safe to call often. */
export function saveToStorage(): void {
	try {
		const snapshot: SaveSnapshot = {
			v: 1,
			coins: state.coins,
			unlocks: state.unlocks,
			upgrades: state.upgrades,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
	} catch {
		// Storage may be disabled (private mode) — fail silently.
	}
}

/** Wipes the save and resets live state to the initial shape. */
export function resetGame(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
	customerSeq = 0;
	state = structuredClone(initialState);
	notify();
}
