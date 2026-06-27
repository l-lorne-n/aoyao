(() => {
  const focusableSelector = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const nativePollIntervalMs = 75;
  const nativeStateFreshMs = 240;

  let activeGamepadIndex = null;
  let polling = false;
  let nativePolling = false;
  let heldDirection = "";
  let nativeGamepadState = {
    available: false,
    direction: "",
    updatedAt: 0,
    snapshot: null,
  };

  function isVisible(element) {
    if (!element || element.closest("[hidden]")) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return element.getClientRects().length > 0;
  }

  function getFocusableElements() {
    return Array.from(document.querySelectorAll(focusableSelector)).filter((element) => {
      if (element.disabled) return false;
      if (element.getAttribute("aria-disabled") === "true") return false;
      return isVisible(element);
    });
  }

  function clearGamepadFocus() {
    document
      .querySelectorAll(".gamepad-focus")
      .forEach((element) => element.classList.remove("gamepad-focus"));
  }

  function markGamepadFocus(element) {
    document.body.classList.add("gamepad-nav-active");
    clearGamepadFocus();
    element.classList.add("gamepad-focus");
  }

  function focusElement(element) {
    if (!element) return;
    markGamepadFocus(element);
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function firstVisibleInViewport(elements) {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    return elements.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
    });
  }

  function getCurrentElement(elements) {
    const active = document.activeElement;
    if (active && elements.includes(active)) return active;
    const marked = document.querySelector(".gamepad-focus");
    return marked && elements.includes(marked) ? marked : null;
  }

  function centerOf(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function candidateScore(direction, currentCenter, candidate) {
    const candidateCenter = centerOf(candidate);
    const dx = candidateCenter.x - currentCenter.x;
    const dy = candidateCenter.y - currentCenter.y;

    if (direction === "up" && dy >= -4) return null;
    if (direction === "down" && dy <= 4) return null;
    if (direction === "left" && dx >= -4) return null;
    if (direction === "right" && dx <= 4) return null;

    const primary = direction === "up" || direction === "down" ? Math.abs(dy) : Math.abs(dx);
    const cross = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);
    return primary + cross * 0.72;
  }

  function fallbackByDocumentOrder(elements, current, direction) {
    const index = elements.indexOf(current);
    if (index < 0) return firstVisibleInViewport(elements) || elements[0];
    if (direction === "up" || direction === "left") {
      return elements[Math.max(0, index - 1)];
    }
    return elements[Math.min(elements.length - 1, index + 1)];
  }

  function moveFocus(direction) {
    const elements = getFocusableElements();
    if (!elements.length) return;

    const current = getCurrentElement(elements);
    if (!current) {
      focusElement(firstVisibleInViewport(elements) || elements[0]);
      return;
    }

    const currentCenter = centerOf(current);
    let bestElement = null;
    let bestScore = Number.POSITIVE_INFINITY;

    elements.forEach((element) => {
      if (element === current) return;
      const score = candidateScore(direction, currentCenter, element);
      if (score === null || score >= bestScore) return;
      bestScore = score;
      bestElement = element;
    });

    focusElement(bestElement || fallbackByDocumentOrder(elements, current, direction));
  }

  function pressed(button) {
    return Boolean(button && button.pressed);
  }

  function normalizeDirection(value) {
    return ["up", "down", "left", "right"].includes(value) ? value : "";
  }

  function directionFromBrowserGamepad(gamepad) {
    const buttons = gamepad.buttons || [];
    if (pressed(buttons[12])) return "up";
    if (pressed(buttons[13])) return "down";
    if (pressed(buttons[14])) return "left";
    if (pressed(buttons[15])) return "right";
    return "";
  }

  function getActiveGamepad() {
    const gamepads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []);
    if (activeGamepadIndex !== null && gamepads[activeGamepadIndex]) {
      return gamepads[activeGamepadIndex];
    }
    return gamepads.find(Boolean) || null;
  }

  function directionFromInput() {
    const nativeFresh = Date.now() - nativeGamepadState.updatedAt < nativeStateFreshMs;
    if (nativeFresh && nativeGamepadState.available) {
      return nativeGamepadState.direction;
    }

    const gamepad = getActiveGamepad();
    return gamepad ? directionFromBrowserGamepad(gamepad) : "";
  }

  function tick() {
    const direction = directionFromInput();

    if (direction && !heldDirection) {
      moveFocus(direction);
      heldDirection = direction;
    }

    if (!direction) {
      heldDirection = "";
    }

    window.requestAnimationFrame(tick);
  }

  function startPolling() {
    if (polling) return;
    polling = true;
    startNativePolling();
    window.requestAnimationFrame(tick);
  }

  function startNativePolling() {
    if (nativePolling) return;
    nativePolling = true;
    pollNativeGamepad();
  }

  async function pollNativeGamepad() {
    try {
      const response = await fetch("/api/gamepad-state", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      nativeGamepadState = {
        available: Boolean(payload.available),
        direction: normalizeDirection(payload.state && payload.state.direction),
        updatedAt: Date.now(),
        snapshot: payload,
      };
    } catch (error) {
      nativeGamepadState = {
        available: false,
        direction: "",
        updatedAt: Date.now(),
        snapshot: { ok: false, error: error.message || String(error) },
      };
    } finally {
      window.setTimeout(pollNativeGamepad, nativePollIntervalMs);
    }
  }

  function currentBrowserGamepadSnapshot() {
    const gamepad = getActiveGamepad();
    if (!gamepad) return null;
    return {
      id: gamepad.id,
      index: gamepad.index,
      mapping: gamepad.mapping,
      axes: Array.from(gamepad.axes || []),
      buttons: Array.from(gamepad.buttons || []).map((button) => ({
        pressed: button.pressed,
        value: button.value,
      })),
    };
  }

  function currentGamepadSnapshot() {
    return {
      native: nativeGamepadState.snapshot,
      browser: currentBrowserGamepadSnapshot(),
      heldDirection,
    };
  }

  window.addEventListener("gamepadconnected", (event) => {
    activeGamepadIndex = event.gamepad.index;
    startPolling();
  });

  window.addEventListener("gamepaddisconnected", (event) => {
    if (activeGamepadIndex === event.gamepad.index) {
      activeGamepadIndex = null;
    }
  });

  document.addEventListener("focusin", (event) => {
    if (document.body.classList.contains("gamepad-nav-active") && event.target instanceof HTMLElement) {
      markGamepadFocus(event.target);
    }
  });

  document.addEventListener("pointerdown", () => {
    document.body.classList.remove("gamepad-nav-active");
    clearGamepadFocus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      document.body.classList.remove("gamepad-nav-active");
      clearGamepadFocus();
    }
  });

  window.AoyaoGamepadNav = {
    focusFirst() {
      const elements = getFocusableElements();
      focusElement(firstVisibleInViewport(elements) || elements[0]);
    },
    moveFocus,
    snapshot: currentGamepadSnapshot,
  };

  startPolling();
})();
