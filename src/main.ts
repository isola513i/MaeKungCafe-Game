import "./style.css";
import {
	isBgmMuted,
	playClick,
	playCoin,
	playFail,
	playSuccess,
	startBgm,
	toggleBgmMute,
} from "./audio.ts";
import {
	ASSISTANT_INCOME,
	ASSISTANT_INTERVAL_MS,
	COFFEE_RECIPE_CONFIGS,
	COSTS,
	CUSTOMER_SPAWN_INTERVAL_MS,
	type CoffeeRecipe,
	type Customer,
	type MenuItemId,
	STATION_CONFIGS,
	type StationConfig,
	type StationKind,
	type StationMechanic,
	addCoins,
	buyPremiumBeans,
	fulfillOrder,
	getOldestCustomerForKind,
	getPerfectReward,
	getState,
	hireAssistant,
	loadFromStorage,
	resetGame,
	saveToStorage,
	spawnCustomer,
	subscribe,
	timeoutCustomer,
	unlockStation,
} from "./state.ts";

const BURNT_COOLDOWN_MS = 1000;
const INITIAL_SPAWN_DELAY_MS = 1500;

const CONFETTI_COLORS = [
	"#a7f3d0",
	"#fde047",
	"#fda4af",
	"#fce7f3",
	"#bae6fd",
	"#c4b5fd",
];

type LocalStatus = "idle" | "active" | "brewing" | "steaming" | "cooldown";
type FloatVariant = "good" | "warn" | "bad" | "coin";
type Outcome = "perfect" | "wasted" | "burnt";

function idleLabelFor(m: StationMechanic): string {
	switch (m) {
		case "hold":
			return "Hold to Brew";
		case "mash":
			return "Mash to Blend!";
		case "double":
			return "Start Waffle";
	}
}

function idleHintFor(m: StationMechanic): string {
	switch (m) {
		case "hold":
			return "Press & hold ✨";
		case "mash":
			return "Tap fast! ✨";
		case "double":
			return "Click to start ✨";
	}
}

interface StationRefs {
	root: HTMLElement;
	recipeSelector: HTMLElement | null;
	progress: HTMLElement;
	progressFill: HTMLElement;
	progressZone: HTMLElement;
	statusLabel: HTMLElement;
	actionBtn: HTMLButtonElement;
	floatLayer: HTMLElement;
}

function $(selector: string, root: ParentNode = document): HTMLElement {
	const el = root.querySelector<HTMLElement>(selector);
	if (!el) throw new Error(`Missing element: ${selector}`);
	return el;
}

// ---------------------------------------------------------------------------
// Station rendering & control (per-kind config)
// ---------------------------------------------------------------------------

function createStationElement(config: StationConfig): HTMLElement {
	const el = document.createElement("article");
	el.className = "station";
	el.id = `station-${config.kind}`;
	el.dataset.status = "idle";
	el.dataset.kind = config.kind;
	el.dataset.mechanic = config.mechanic;
	if (config.kind === "coffee") {
		el.dataset.recipe = "espresso";
		el.dataset.brewStage = "brew";
	}

	// Waffle (double mechanic) renders TWO progress zones — one for the
	// flip window, one for the serve window. Other mechanics use one or none.
	const secondaryZone =
		config.mechanic === "double"
			? '<div class="progress-zone progress-zone--secondary" aria-hidden="true"></div>'
			: "";
	const recipeSelector =
		config.kind === "coffee"
			? `
		<div class="recipe-selector" role="radiogroup" aria-label="Coffee recipe">
			<button
				class="recipe-pill recipe-pill--active"
				type="button"
				data-recipe="espresso"
				role="radio"
				aria-checked="true"
			>
				<span aria-hidden="true">☕</span>
				<span>Espresso</span>
			</button>
			<button
				class="recipe-pill"
				type="button"
				data-recipe="latte"
				role="radio"
				aria-checked="false"
			>
				<span aria-hidden="true">🥛</span>
				<span>Latte</span>
			</button>
		</div>`
			: "";

	el.innerHTML = `
		<header class="station-head">
			<span class="station-emoji" aria-hidden="true">${config.emoji}</span>
			<span class="station-name">${config.name}</span>
		</header>
		${recipeSelector}
		<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
			${secondaryZone}
			<div class="progress-zone" aria-hidden="true"></div>
			<div class="progress-fill"></div>
		</div>
		<div class="station-status">
			<span class="status-label status-label--idle">Ready! ✨</span>
		</div>
		<div class="station-actions">
			<button class="btn btn--primary station-action" type="button">Cook</button>
		</div>
		<div class="float-layer" aria-hidden="true"></div>
	`;
	return el;
}

function getStationRefs(root: HTMLElement): StationRefs {
	return {
		root,
		recipeSelector: root.querySelector<HTMLElement>(".recipe-selector"),
		progress: $(".progress", root),
		progressFill: $(".progress-fill", root),
		progressZone: $(".progress-zone", root),
		statusLabel: $(".status-label", root),
		actionBtn: $(".station-action", root) as HTMLButtonElement,
		floatLayer: $(".float-layer", root),
	};
}

function setupStation(stationEl: HTMLElement, config: StationConfig): void {
	const refs = getStationRefs(stationEl);
	const secondaryZone = stationEl.querySelector<HTMLElement>(
		".progress-zone--secondary",
	);
	const coffeeRecipeButtons = Array.from(
		stationEl.querySelectorAll<HTMLButtonElement>(".recipe-pill"),
	);
	const idleLabel = idleLabelFor(config.mechanic);
	const idleHint = idleHintFor(config.mechanic);

	let status: LocalStatus = "idle";
	let rafId: number | null = null;
	let cooldownTimer: number | null = null;

	const setPrimaryZone = (min: number, max: number): void => {
		refs.progressZone.style.display = "";
		refs.progressZone.style.setProperty("--zone-start", `${min * 100}%`);
		refs.progressZone.style.setProperty("--zone-end", `${max * 100}%`);
	};

	if (config.mechanic === "mash") {
		refs.progressZone.style.display = "none";
	} else {
		setPrimaryZone(config.perfectMin, config.perfectMax);
	}
	if (
		secondaryZone &&
		config.mechanic === "double" &&
		config.flipMin !== undefined &&
		config.flipMax !== undefined
	) {
		secondaryZone.style.setProperty("--zone-start", `${config.flipMin * 100}%`);
		secondaryZone.style.setProperty("--zone-end", `${config.flipMax * 100}%`);
	}

	const setProgress = (p: number): void => {
		const clamped = Math.max(0, Math.min(1, p));
		refs.progressFill.style.width = `${clamped * 100}%`;
		refs.progress.setAttribute(
			"aria-valuenow",
			String(Math.round(clamped * 100)),
		);
	};

	const setStatusText = (
		text: string,
		variant: "idle" | "good" | "warn" | "bad",
	): void => {
		refs.statusLabel.textContent = text;
		refs.statusLabel.className = `status-label status-label--${variant}`;
	};

	const setStationStatus = (next: LocalStatus): void => {
		status = next;
		refs.root.dataset.status = next;
	};

	const setActionLabel = (label: string): void => {
		refs.actionBtn.textContent = label;
	};

	const stopRaf = (): void => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	};

	const setRecipeSelectorDisabled = (disabled: boolean): void => {
		for (const btn of coffeeRecipeButtons) {
			btn.disabled = disabled;
		}
	};

	const setCoffeeStage = (stage: "brew" | "milk"): void => {
		refs.root.dataset.brewStage = stage;
	};

	const getDefaultCompletedItem = (): MenuItemId | null => {
		const customer = getOldestCustomerForKind(config.kind);
		return customer?.item.id ?? null;
	};

	const finish = (outcome: Outcome, completedItemId?: MenuItemId): void => {
		stopRaf();
		if (outcome === "perfect") {
			const targetItemId = completedItemId ?? getDefaultCompletedItem();
			const customer = targetItemId ? fulfillOrder(targetItemId) : null;
			if (customer) {
				const reward = getPerfectReward(config.kind);
				addCoins(reward);
				playSuccess();
				setStatusText("Perfect! ✨", "good");
				spawnFloatText(refs.floatLayer, `+${reward}`, "good");
			} else {
				playFail();
				setStatusText("No order! 😢", "warn");
				spawnFloatText(refs.floatLayer, "Wasted!", "warn");
			}
			resetToIdle();
			return;
		}
		if (outcome === "wasted") {
			playFail();
			setStatusText("Wasted! 🥺", "warn");
			spawnFloatText(refs.floatLayer, "Wasted!", "warn");
			resetToIdle();
			return;
		}
		playFail();
		setProgress(1);
		setStationStatus("cooldown");
		setStatusText("Burnt! 😭", "bad");
		spawnFloatText(refs.floatLayer, "Wasted!", "bad");
		refs.actionBtn.disabled = true;
		setRecipeSelectorDisabled(true);
		setActionLabel("Cooling...");
		if (cooldownTimer !== null) window.clearTimeout(cooldownTimer);
		cooldownTimer = window.setTimeout(() => {
			cooldownTimer = null;
			resetToIdle();
		}, BURNT_COOLDOWN_MS);
	};

	let selectedCoffeeRecipe: CoffeeRecipe = "espresso";

	const syncCoffeeRecipeUi = (): void => {
		if (config.kind !== "coffee") return;
		refs.root.dataset.recipe = selectedCoffeeRecipe;
		for (const btn of coffeeRecipeButtons) {
			const isActive = btn.dataset.recipe === selectedCoffeeRecipe;
			btn.classList.toggle("recipe-pill--active", isActive);
			btn.setAttribute("aria-checked", String(isActive));
		}
	};

	const applyIdleUi = (): void => {
		if (config.kind === "coffee") {
			const recipe = COFFEE_RECIPE_CONFIGS[selectedCoffeeRecipe];
			setCoffeeStage("brew");
			setPrimaryZone(recipe.brew.perfectMin, recipe.brew.perfectMax);
			setActionLabel("Hold to Brew");
			setStatusText(`${recipe.label} mode ✨`, "idle");
			syncCoffeeRecipeUi();
			return;
		}
		setActionLabel(idleLabel);
		setStatusText(idleHint, "idle");
	};

	const resetToIdle = (): void => {
		stopRaf();
		setStationStatus("idle");
		refs.actionBtn.disabled = false;
		setRecipeSelectorDisabled(false);
		refs.progressFill.classList.add("progress-fill--reset");
		setProgress(0);
		applyIdleUi();
		window.setTimeout(() => {
			refs.progressFill.classList.remove("progress-fill--reset");
		}, 250);
	};

	applyIdleUi();

	if (config.kind === "coffee") bindCoffeeController();
	else if (config.mechanic === "mash") bindMashController();
	else bindDoubleController();

	function bindCoffeeController(): void {
		let startedAt = 0;
		let activeRecipe: CoffeeRecipe = selectedCoffeeRecipe;
		let ignoreMilkClick = false;

		for (const btn of coffeeRecipeButtons) {
			btn.addEventListener("click", () => {
				if (status !== "idle") return;
				const nextRecipe = btn.dataset.recipe;
				if (nextRecipe !== "espresso" && nextRecipe !== "latte") return;
				selectedCoffeeRecipe = nextRecipe;
				applyIdleUi();
			});
		}

		const startCoffeeBrew = (ev: PointerEvent): void => {
			if (status !== "idle") return;
			activeRecipe = selectedCoffeeRecipe;
			ev.preventDefault();
			try {
				refs.actionBtn.setPointerCapture(ev.pointerId);
			} catch {
				// pointer capture is best-effort; the pointerup may still fire.
			}
			playClick();
			setStationStatus("brewing");
			setRecipeSelectorDisabled(true);
			setCoffeeStage("brew");
			setActionLabel("Release!");
			setStatusText(
				activeRecipe === "espresso" ? "Pulling shot... ☕" : "Brewing base... ☕",
				"idle",
			);
			const brew = COFFEE_RECIPE_CONFIGS[activeRecipe].brew;
			setPrimaryZone(brew.perfectMin, brew.perfectMax);
			startedAt = performance.now();
			const tick = (now: number): void => {
				const p = (now - startedAt) / brew.durationMs;
				if (p >= 1) {
					setProgress(1);
					finish(activeRecipe === "espresso" ? "burnt" : "wasted");
					return;
				}
				setProgress(p);
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
		};

		const beginMilkStage = (): void => {
			const milk = COFFEE_RECIPE_CONFIGS.latte.milk;
			if (!milk) {
				finish("wasted");
				return;
			}
			stopRaf();
			setStationStatus("steaming");
			setCoffeeStage("milk");
			setPrimaryZone(milk.perfectMin, milk.perfectMax);
			refs.progressFill.classList.add("progress-fill--reset");
			setProgress(0);
			window.setTimeout(() => {
				refs.progressFill.classList.remove("progress-fill--reset");
			}, 250);
			setActionLabel("Stop / Add Milk");
			setStatusText("Steam the milk! 🥛", "good");
			ignoreMilkClick = true;
			window.setTimeout(() => {
				ignoreMilkClick = false;
			}, 0);
			startedAt = performance.now();
			const tick = (now: number): void => {
				const p = (now - startedAt) / milk.durationMs;
				if (p >= 1) {
					setProgress(1);
					finish("wasted");
					return;
				}
				setProgress(p);
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
		};

		const endCoffeeBrew = (): void => {
			if (status !== "brewing") return;
			const brew = COFFEE_RECIPE_CONFIGS[activeRecipe].brew;
			const p = (performance.now() - startedAt) / brew.durationMs;
			stopRaf();
			if (p < brew.perfectMin) {
				finish("wasted");
				return;
			}
			if (p <= brew.perfectMax) {
				if (activeRecipe === "espresso") finish("perfect", "espresso");
				else beginMilkStage();
				return;
			}
			finish(activeRecipe === "espresso" ? "burnt" : "wasted");
		};

		refs.actionBtn.addEventListener("pointerdown", startCoffeeBrew);
		refs.actionBtn.addEventListener("pointerup", endCoffeeBrew);
		refs.actionBtn.addEventListener("pointercancel", endCoffeeBrew);
		refs.actionBtn.addEventListener("click", () => {
			if (status !== "steaming") return;
			if (ignoreMilkClick) return;
			const milk = COFFEE_RECIPE_CONFIGS.latte.milk;
			if (!milk) {
				finish("wasted");
				return;
			}
			playClick();
			const p = (performance.now() - startedAt) / milk.durationMs;
			stopRaf();
			if (p >= milk.perfectMin && p <= milk.perfectMax) {
				finish("perfect", "latte");
				return;
			}
			finish("wasted");
		});
	}

	function bindMashController(): void {
		const required = config.clicksRequired ?? 10;
		let clicks = 0;
		let timeoutId: number | null = null;

		const clearMashTimer = (): void => {
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		refs.actionBtn.addEventListener("click", () => {
			if (status === "cooldown") return;
			if (status === "idle") {
				clicks = 1;
				setStationStatus("active");
				playClick();
				setProgress(clicks / required);
				setActionLabel("MASH!");
				setStatusText("Blend! Blend! 🌀", "idle");
				clearMashTimer();
				timeoutId = window.setTimeout(() => {
					timeoutId = null;
					if (status === "active") finish("wasted");
				}, config.durationMs);
				if (clicks >= required) {
					clearMashTimer();
					finish("perfect");
				}
				return;
			}
			clicks++;
			playClick();
			setProgress(Math.min(1, clicks / required));
			if (clicks >= required) {
				clearMashTimer();
				finish("perfect");
			}
		});
	}

	function bindDoubleController(): void {
		const flipMin = config.flipMin ?? 0.4;
		const flipMax = config.flipMax ?? 0.5;
		let phase: "idle" | "pre-flip" | "pre-serve" = "idle";
		let startedAt = 0;
		let flipReady = false;
		let serveReady = false;

		const startCooking = (): void => {
			phase = "pre-flip";
			flipReady = false;
			serveReady = false;
			setStationStatus("active");
			playClick();
			setActionLabel("Wait for Flip...");
			setStatusText("Cooking... 🧇", "idle");
			startedAt = performance.now();
			const tick = (now: number): void => {
				const p = (now - startedAt) / config.durationMs;
				if (p >= 1) {
					setProgress(1);
					finish("burnt");
					return;
				}
				if (phase === "pre-flip" && !flipReady && p >= flipMin) {
					flipReady = true;
					setActionLabel("Flip!");
				}
				if (phase === "pre-serve" && !serveReady && p >= config.perfectMin) {
					serveReady = true;
					setActionLabel("Serve!");
				}
				setProgress(p);
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
		};

		refs.actionBtn.addEventListener("click", () => {
			if (status === "cooldown") return;
			if (status === "idle") {
				startCooking();
				return;
			}
			const p = (performance.now() - startedAt) / config.durationMs;
			if (phase === "pre-flip") {
				if (p < flipMin) finish("wasted");
				else if (p <= flipMax) {
					phase = "pre-serve";
					playClick();
					setActionLabel("Wait to Serve...");
					setStatusText("Flipped! 🥞", "good");
				} else {
					finish("burnt");
				}
				return;
			}
			if (p < config.perfectMin) finish("wasted");
			else if (p <= config.perfectMax) finish("perfect");
			else finish("burnt");
		});
	}
}

// ---------------------------------------------------------------------------
// Confetti: lightweight DOM-driven burst around a click point
// ---------------------------------------------------------------------------

function ensureConfettiRoot(): HTMLElement {
	let root = document.getElementById("confetti-root");
	if (!root) {
		root = document.createElement("div");
		root.id = "confetti-root";
		document.body.appendChild(root);
	}
	return root;
}

function spawnConfetti(x: number, y: number, count = 18): void {
	const root = ensureConfettiRoot();
	for (let i = 0; i < count; i++) {
		const piece = document.createElement("span");
		piece.className = "confetti";
		const angle = Math.random() * Math.PI * 2;
		const dist = 60 + Math.random() * 90;
		const dx = Math.cos(angle) * dist;
		const dy = Math.sin(angle) * dist - 30; // bias upward so it arcs up & out
		const rot = (Math.random() - 0.5) * 720;
		const dur = 900 + Math.random() * 600;
		const size = 6 + Math.random() * 6;
		const color =
			CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ??
			"#fde047";
		piece.style.setProperty("--dx", `${dx}px`);
		piece.style.setProperty("--dy", `${dy}px`);
		piece.style.setProperty("--rot", `${rot}deg`);
		piece.style.setProperty("--dur", `${dur}ms`);
		piece.style.left = `${x}px`;
		piece.style.top = `${y}px`;
		piece.style.width = `${size}px`;
		piece.style.height = `${size}px`;
		piece.style.background = color;
		if (Math.random() < 0.5) piece.style.borderRadius = "50%";
		piece.addEventListener(
			"animationend",
			() => {
				piece.remove();
			},
			{ once: true },
		);
		root.appendChild(piece);
	}
}

function celebratePurchase(ev: MouseEvent, fallbackEl: HTMLElement): void {
	const target = ev.currentTarget as HTMLElement | null;
	const rect = (target ?? fallbackEl).getBoundingClientRect();
	const x = ev.clientX || rect.left + rect.width / 2;
	const y = ev.clientY || rect.top + rect.height / 2;
	playCoin();
	spawnConfetti(x, y);
}

// ---------------------------------------------------------------------------
// Floating text & shop helpers
// ---------------------------------------------------------------------------

function spawnFloatText(
	layer: HTMLElement,
	text: string,
	variant: FloatVariant,
): void {
	const node = document.createElement("span");
	node.className = `float-text float-text--${variant}`;
	node.textContent = text;
	const jitter = (Math.random() - 0.5) * 30;
	node.style.setProperty("--float-x", `${jitter}px`);
	layer.appendChild(node);
	node.addEventListener("animationend", () => node.remove());
}

function setShopButtonDisabled(
	btn: HTMLButtonElement,
	disabled: boolean,
): void {
	btn.disabled = disabled;
	btn.classList.toggle("btn--disabled", disabled);
}

// ---------------------------------------------------------------------------
// Order queue rendering (diffed so animations only run for new/leaving cards)
// ---------------------------------------------------------------------------

// Customer ids that timed out and should leave with the angry animation
// instead of the normal pop-out. Cleared as each card is processed.
const timedOutIds = new Set<string>();

function createOrderCard(customer: Customer): HTMLElement {
	const { item } = customer;
	const card = document.createElement("div");
	card.className = "order-card order-card--entering";
	card.dataset.id = customer.id;
	card.dataset.kind = item.kind;
	card.dataset.itemId = item.id;
	card.dataset.urgency = "low";
	card.innerHTML = `
		<span class="order-emoji" aria-hidden="true">${item.emoji}</span>
		<span class="order-label">${item.name}</span>
		<div class="order-patience" aria-hidden="true">
			<div class="order-patience-fill"></div>
		</div>
	`;
	card.addEventListener(
		"animationend",
		() => card.classList.remove("order-card--entering"),
		{ once: true },
	);
	return card;
}

function syncOrderQueue(container: HTMLElement, customers: Customer[]): void {
	const existing = new Map<string, HTMLElement>();
	for (const child of Array.from(container.children) as HTMLElement[]) {
		const id = child.dataset.id;
		if (id) existing.set(id, child);
	}

	const wanted = new Set<string>();
	for (const c of customers) {
		wanted.add(c.id);
		if (!existing.has(c.id)) {
			container.appendChild(createOrderCard(c));
		}
	}

	for (const [id, el] of existing) {
		if (wanted.has(id)) continue;
		if (
			el.classList.contains("order-card--leaving") ||
			el.classList.contains("order-card--angry")
		) {
			continue;
		}
		const wasTimeout = timedOutIds.delete(id);
		el.classList.add(wasTimeout ? "order-card--angry" : "order-card--leaving");
		el.addEventListener(
			"animationend",
			() => {
				el.remove();
			},
			{ once: true },
		);
	}
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function init(): void {
	// Restore the durable bits of state BEFORE wiring any subscribers, so
	// the very first listener invocation sees the loaded coins/unlocks/upgrades
	// and the kitchen mounts the right stations on first paint.
	loadFromStorage();

	const stationsContainer = $("#stations-container");
	const orderQueue = $("#order-queue");
	const coinFloatLayer = $("#coin-float-layer");

	// Header / shop refs
	const coinValue = $("#coin-value");
	const buyBeansBtn = $("#buy-beans") as HTMLButtonElement;
	const unlockWaffleBtn = $("#unlock-waffle") as HTMLButtonElement;
	const unlockSmoothieBtn = $("#unlock-smoothie") as HTMLButtonElement;
	const hireAssistantBtn = $("#hire-assistant") as HTMLButtonElement;
	const beansLevel = $("#beans-level");
	const beansCost = $("#beans-cost");
	const assistantCount = $("#assistant-count");
	const bgmToggleBtn = $("#bgm-toggle") as HTMLButtonElement;
	const bgmIcon = $(".bgm-icon", bgmToggleBtn);
	const bgmLabel = $(".bgm-label", bgmToggleBtn);
	const resetBtn = $("#reset-save") as HTMLButtonElement;

	// Reset button: wipe the save and reload so every station/timer starts
	// fresh. We confirm() to prevent fat-fingered loss of progress.
	resetBtn.addEventListener("click", () => {
		const ok = window.confirm(
			"Reset your cafe? All coins, unlocks, and upgrades will be wiped.",
		);
		if (!ok) return;
		resetGame();
		window.location.reload();
	});

	// --- Background music ------------------------------------------------
	// Browsers block audio until the user interacts with the page, so we
	// start the BGM on the first pointerdown anywhere in the document. The
	// dedicated toggle button doubles as a manual start trigger.
	const startBgmOnce = (): void => {
		startBgm();
		window.removeEventListener("pointerdown", startBgmOnce);
		window.removeEventListener("keydown", startBgmOnce);
	};
	window.addEventListener("pointerdown", startBgmOnce, { once: false });
	window.addEventListener("keydown", startBgmOnce, { once: false });

	const syncBgmButton = (): void => {
		const muted = isBgmMuted();
		bgmToggleBtn.setAttribute("aria-pressed", String(muted));
		bgmToggleBtn.classList.toggle("btn--bgm-muted", muted);
		bgmIcon.textContent = muted ? "🔇" : "🎵";
		bgmLabel.textContent = muted ? "Muted" : "Music";
	};
	bgmToggleBtn.addEventListener("click", () => {
		// Toggling also counts as a user gesture, so an initially-blocked
		// track will start on the first un-mute click.
		toggleBgmMute();
		if (!isBgmMuted()) startBgm();
		syncBgmButton();
	});
	syncBgmButton();

	const mountStation = (kind: StationKind): void => {
		const config = STATION_CONFIGS[kind];
		const el = createStationElement(config);
		stationsContainer.appendChild(el);
		setupStation(el, config);
	};

	// Track which stations are already mounted so we can react to unlocks
	// without rebuilding existing stations.
	const mountedKinds = new Set<StationKind>();
	for (const st of getState().stations) {
		mountStation(st.kind);
		mountedKinds.add(st.kind);
	}

	// Shop click handlers — successful purchases play the coin SFX and
	// burst confetti around the click point.
	buyBeansBtn.addEventListener("click", (ev) => {
		if (buyPremiumBeans()) celebratePurchase(ev, buyBeansBtn);
	});
	unlockWaffleBtn.addEventListener("click", (ev) => {
		const res = unlockStation("waffle");
		if (res.ok) celebratePurchase(ev, unlockWaffleBtn);
	});
	unlockSmoothieBtn.addEventListener("click", (ev) => {
		const res = unlockStation("smoothie");
		if (res.ok) celebratePurchase(ev, unlockSmoothieBtn);
	});
	hireAssistantBtn.addEventListener("click", (ev) => {
		if (hireAssistant()) celebratePurchase(ev, hireAssistantBtn);
	});

	// --- Patience timers ------------------------------------------------
	// One shared rAF loop ticks every visible order card. When a card's
	// elapsed time exceeds its patience window, we mark the id as timed-out
	// and remove the customer from state — syncOrderQueue then plays the
	// angry-leave animation. Declared before subscribers so closures that
	// reference ensurePatienceTick don't hit a TDZ error.
	let patienceRafId: number | null = null;
	const patienceTick = (): void => {
		const now = performance.now();
		const customers = getState().customers;
		for (const c of customers) {
			if (timedOutIds.has(c.id)) continue;
			const card = orderQueue.querySelector<HTMLElement>(
				`.order-card[data-id="${c.id}"]`,
			);
			if (!card) continue;
			const p = (now - c.spawnedAt) / c.patienceMs;
			if (p >= 1) {
				timedOutIds.add(c.id);
				playFail();
				timeoutCustomer(c.id);
				continue;
			}
			const fill = card.querySelector<HTMLElement>(".order-patience-fill");
			if (fill) fill.style.width = `${(1 - p) * 100}%`;
			card.dataset.urgency = p > 0.75 ? "high" : p > 0.5 ? "med" : "low";
		}
		if (getState().customers.length > 0) {
			patienceRafId = requestAnimationFrame(patienceTick);
		} else {
			patienceRafId = null;
		}
	};
	const ensurePatienceTick = (): void => {
		if (patienceRafId === null) {
			patienceRafId = requestAnimationFrame(patienceTick);
		}
	};

	// Reactive UI: coins, counters, shop button enabled state, station mount,
	// order queue render.
	subscribe((state) => {
		coinValue.textContent = String(state.coins);
		beansLevel.textContent = String(state.upgrades.premiumBeansLevel);
		beansCost.textContent = String(COSTS.premiumBeans);
		assistantCount.textContent = String(state.upgrades.assistants);

		setShopButtonDisabled(buyBeansBtn, state.coins < COSTS.premiumBeans);
		setShopButtonDisabled(
			unlockWaffleBtn,
			state.unlocks.waffle || state.coins < STATION_CONFIGS.waffle.unlockCost,
		);
		setShopButtonDisabled(
			unlockSmoothieBtn,
			state.unlocks.smoothie ||
				state.coins < STATION_CONFIGS.smoothie.unlockCost,
		);
		setShopButtonDisabled(hireAssistantBtn, state.coins < COSTS.hireAssistant);

		// Reflect unlocked → "Unlocked!" label on shop buttons.
		unlockWaffleBtn.classList.toggle("btn--owned", state.unlocks.waffle);
		unlockSmoothieBtn.classList.toggle("btn--owned", state.unlocks.smoothie);

		// Mount newly unlocked stations.
		for (const st of state.stations) {
			if (!mountedKinds.has(st.kind)) {
				mountStation(st.kind);
				mountedKinds.add(st.kind);
			}
		}

		// Sync customer queue.
		syncOrderQueue(orderQueue, state.customers);

		// Keep the patience tick alive while there are customers in the queue.
		if (state.customers.length > 0) ensurePatienceTick();
	});

	// --- Autosave -------------------------------------------------------
	// Persist the durable bits on every state change. localStorage writes
	// are synchronous but the payload is tiny (well under 1 KB), so this
	// is fine to call on every notify().
	subscribe(() => {
		saveToStorage();
	});

	// Customer spawn loop: first spawn shortly after load, then on a fixed
	// interval. spawnCustomer() itself enforces the max-3 cap and only picks
	// kinds the player has already unlocked.
	window.setTimeout(() => spawnCustomer(), INITIAL_SPAWN_DELAY_MS);
	window.setInterval(() => {
		spawnCustomer();
	}, CUSTOMER_SPAWN_INTERVAL_MS);

	// Assistant idle income: start a single interval the first time any
	// assistant is hired; income scales with live assistant count.
	let assistantTimer: number | null = null;
	subscribe((state) => {
		if (state.upgrades.assistants > 0 && assistantTimer === null) {
			assistantTimer = window.setInterval(() => {
				const count = getState().upgrades.assistants;
				if (count <= 0) return;
				const income = ASSISTANT_INCOME * count;
				addCoins(income);
				playCoin();
				spawnFloatText(coinFloatLayer, `+${income} 🪙`, "coin");
			}, ASSISTANT_INTERVAL_MS);
		}
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
