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
  const doublePressMs = 430;

  let activeGamepadIndex = null;
  let polling = false;
  let nativePolling = false;
  let heldDirection = "";
  let lastDirection = "";
  let lastDirectionAt = 0;
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
      if (element.getAttribute("tabindex") === "-1") return false;
      if (element.closest("[data-gamepad-skip='true']")) return false;
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

  function elementInfo(element) {
    const rect = element.getBoundingClientRect();
    return {
      element,
      rect,
      center: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    };
  }

  function rowOverlap(a, b) {
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }

  function columnOverlap(a, b) {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  }

  function sameVisualRow(a, b) {
    const overlap = rowOverlap(a, b);
    const minHeight = Math.max(1, Math.min(a.height, b.height));
    const centerGap = Math.abs(centerOfRect(a).y - centerOfRect(b).y);
    return overlap / minHeight >= 0.35 || centerGap <= Math.max(18, minHeight * 0.8);
  }

  function sameVisualColumn(a, b) {
    const overlap = columnOverlap(a, b);
    const minWidth = Math.max(1, Math.min(a.width, b.width));
    const centerGap = Math.abs(centerOfRect(a).x - centerOfRect(b).x);
    return overlap / minWidth >= 0.35 || centerGap <= Math.max(24, minWidth * 0.8);
  }

  function centerOfRect(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function inDirection(direction, current, candidate) {
    const deltaX = candidate.center.x - current.center.x;
    const deltaY = candidate.center.y - current.center.y;
    if (direction === "left") return deltaX < -4;
    if (direction === "right") return deltaX > 4;
    if (direction === "up") return deltaY < -4;
    if (direction === "down") return deltaY > 4;
    return false;
  }

  function closestScope(element) {
    return element.closest(
      [
        ".check-grid",
        ".basic-grid",
        ".vital-grid",
        ".visit-grid",
        ".record-list",
        ".export-record-list",
        ".toolbar-actions",
        ".history-actions",
        ".history-filter",
        ".controls",
        ".voice-actions",
        ".two-col",
        ".advice-grid",
      ].join(",")
    );
  }

  function closestSection(element) {
    return element.closest(
      [
        ".section",
        ".sidebar",
        ".form-toolbar",
        ".modal-overlay",
        ".voice-panel",
        ".history-toolbar",
        ".history-filter",
        ".timeline-group",
        ".recorder-band",
        ".workspace",
        ".history-section",
      ].join(",")
    );
  }

  function closestPane(element) {
    return (
      element.closest(
        [
          ".modal-overlay:not([hidden])",
          ".voice-panel:not([hidden])",
          ".sidebar",
          ".paper-form",
          ".form-pane",
          ".history-app",
          ".app",
        ].join(",")
      ) || document.body
    );
  }

  function elementsInside(container, elements) {
    if (!container) return [];
    return elements.filter((element) => container.contains(element));
  }

  function sortTopLeft(a, b) {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    if (Math.abs(aRect.top - bRect.top) > 10) return aRect.top - bRect.top;
    return aRect.left - bRect.left;
  }

  function sectionEntry(section, elements) {
    const candidates = elementsInside(section, elements);
    if (!candidates.length) return null;
    const nonVoice = candidates.filter((element) => !element.classList.contains("voice-button"));
    return [...(nonVoice.length ? nonVoice : candidates)].sort(sortTopLeft)[0] || null;
  }

  function scopeEntry(scope, elements) {
    return sectionEntry(scope, elements);
  }

  function bestHorizontalIn(candidates, current, direction) {
    const currentRect = current.rect;
    return candidates
      .map(elementInfo)
      .filter((candidate) => candidate.element !== current.element)
      .filter((candidate) => inDirection(direction, current, candidate))
      .filter((candidate) => sameVisualRow(currentRect, candidate.rect))
      .sort((a, b) => {
        const primaryA = Math.abs(a.center.x - current.center.x);
        const primaryB = Math.abs(b.center.x - current.center.x);
        if (Math.abs(primaryA - primaryB) > 1) return primaryA - primaryB;
        return Math.abs(a.center.y - current.center.y) - Math.abs(b.center.y - current.center.y);
      })[0]?.element || null;
  }

  function bestVerticalIn(candidates, current, direction) {
    const currentRect = current.rect;
    return candidates
      .map(elementInfo)
      .filter((candidate) => candidate.element !== current.element)
      .filter((candidate) => inDirection(direction, current, candidate))
      .filter((candidate) => sameVisualColumn(currentRect, candidate.rect))
      .sort((a, b) => {
        const primaryA = Math.abs(a.center.y - current.center.y);
        const primaryB = Math.abs(b.center.y - current.center.y);
        if (Math.abs(primaryA - primaryB) > 1) return primaryA - primaryB;
        return Math.abs(a.center.x - current.center.x) - Math.abs(b.center.x - current.center.x);
      })[0]?.element || null;
  }

  function directionGap(direction, current, candidate) {
    if (direction === "left") return current.rect.left - candidate.rect.right;
    if (direction === "right") return candidate.rect.left - current.rect.right;
    if (direction === "up") return current.rect.top - candidate.rect.bottom;
    if (direction === "down") return candidate.rect.top - current.rect.bottom;
    return 0;
  }

  function crossAxisDistance(direction, current, candidate) {
    if (direction === "left" || direction === "right") {
      return Math.abs(candidate.center.y - current.center.y);
    }

    const candidateNarrower = candidate.rect.width < current.rect.width * 0.75;
    const anchorX = candidateNarrower ? current.rect.left : current.center.x;
    const candidateX = candidateNarrower ? candidate.rect.left : candidate.center.x;
    return Math.abs(candidateX - anchorX);
  }

  function isSpatialCandidate(direction, current, candidate) {
    if (candidate.element === current.element) return false;

    if (direction === "left" || direction === "right") {
      if (!sameVisualRow(current.rect, candidate.rect)) return false;
      return directionGap(direction, current, candidate) >= -4;
    }

    return directionGap(direction, current, candidate) >= -4;
  }

  function bestSpatialIn(candidates, current, direction) {
    return candidates
      .map(elementInfo)
      .filter((candidate) => isSpatialCandidate(direction, current, candidate))
      .sort((a, b) => {
        const gapA = Math.max(0, directionGap(direction, current, a));
        const gapB = Math.max(0, directionGap(direction, current, b));
        if (Math.abs(gapA - gapB) > 1) return gapA - gapB;

        const crossA = crossAxisDistance(direction, current, a);
        const crossB = crossAxisDistance(direction, current, b);
        if (Math.abs(crossA - crossB) > 1) return crossA - crossB;

        const overlapA =
          direction === "left" || direction === "right"
            ? rowOverlap(current.rect, a.rect)
            : columnOverlap(current.rect, a.rect);
        const overlapB =
          direction === "left" || direction === "right"
            ? rowOverlap(current.rect, b.rect)
            : columnOverlap(current.rect, b.rect);
        if (Math.abs(overlapA - overlapB) > 1) return overlapB - overlapA;

        return sortTopLeft(a.element, b.element);
      })[0]?.element || null;
  }

  function nextSectionEntry(elements, current, direction, pane) {
    const currentSection = closestSection(current.element);
    if (!currentSection) return null;

    const currentCenter = centerOfRect(currentSection.getBoundingClientRect());
    const seen = new Set();
    const sections = elementsInside(pane, elements)
      .map((element) => closestSection(element))
      .filter((section) => section && section !== currentSection && !seen.has(section) && seen.add(section))
      .map((section) => ({
        section,
        rect: section.getBoundingClientRect(),
      }))
      .filter((item) => {
        const sectionCenter = centerOfRect(item.rect);
        if (direction === "up") return sectionCenter.y < currentCenter.y - 4;
        if (direction === "down") return sectionCenter.y > currentCenter.y + 4;
        return false;
      })
      .sort((a, b) => {
        const aCenter = centerOfRect(a.rect);
        const bCenter = centerOfRect(b.rect);
        const primaryA = Math.abs(aCenter.y - currentCenter.y);
        const primaryB = Math.abs(bCenter.y - currentCenter.y);
        if (Math.abs(primaryA - primaryB) > 1) return primaryA - primaryB;
        return a.rect.left - b.rect.left;
      });

    for (const item of sections) {
      const entry = sectionEntry(item.section, elements);
      if (entry) return entry;
    }

    return null;
  }

  function nextScopeEntryInSection(elements, current, direction) {
    const currentScope = closestScope(current.element);
    const currentSection = closestSection(current.element);
    if (!currentScope || !currentSection) return null;

    const currentCenter = centerOfRect(currentScope.getBoundingClientRect());
    const seen = new Set();
    const scopes = elementsInside(currentSection, elements)
      .map((element) => closestScope(element))
      .filter((scope) => scope && scope !== currentScope && !seen.has(scope) && seen.add(scope))
      .map((scope) => ({
        scope,
        rect: scope.getBoundingClientRect(),
      }))
      .filter((item) => {
        const scopeCenter = centerOfRect(item.rect);
        if (direction === "up") return scopeCenter.y < currentCenter.y - 4;
        if (direction === "down") return scopeCenter.y > currentCenter.y + 4;
        return false;
      })
      .sort((a, b) => {
        const aCenter = centerOfRect(a.rect);
        const bCenter = centerOfRect(b.rect);
        const primaryA = Math.abs(aCenter.y - currentCenter.y);
        const primaryB = Math.abs(bCenter.y - currentCenter.y);
        if (Math.abs(primaryA - primaryB) > 1) return primaryA - primaryB;
        return a.rect.left - b.rect.left;
      });

    for (const item of scopes) {
      const entry = scopeEntry(item.scope, elements);
      if (entry) return entry;
    }

    return null;
  }

  function paneJump(elements, current, direction) {
    if (direction === "right" && current.element.closest(".sidebar")) {
      const recordNo = document.querySelector("#recordNo");
      if (recordNo && elements.includes(recordNo) && isVisible(recordNo)) {
        return recordNo;
      }
      const formPane = document.querySelector(".form-pane");
      return sectionEntry(formPane, elements);
    }

    return null;
  }

  function sidebarReturnTarget(elements) {
    const activeRecord = document.querySelector(".record-item.active");
    if (activeRecord && elements.includes(activeRecord) && isVisible(activeRecord)) {
      return activeRecord;
    }

    const searchInput = document.querySelector("#searchInput");
    if (searchInput && elements.includes(searchInput) && isVisible(searchInput)) {
      return searchInput;
    }

    const firstRecord = document.querySelector("#recordList [data-record-id]");
    if (firstRecord && elements.includes(firstRecord) && isVisible(firstRecord)) {
      return firstRecord;
    }

    const newRecordButton = document.querySelector("#newRecordButton");
    return newRecordButton && elements.includes(newRecordButton) && isVisible(newRecordButton)
      ? newRecordButton
      : null;
  }

  function handleDirectionPress(direction) {
    const elements = getFocusableElements();
    const current = getCurrentElement(elements);
    const now = Date.now();
    if (
      direction === "left" &&
      current &&
      !current.closest(".sidebar") &&
      lastDirection === "left" &&
      now - lastDirectionAt <= doublePressMs
    ) {
      const target = sidebarReturnTarget(elements);
      if (target) {
        focusElement(target);
        lastDirection = "";
        lastDirectionAt = 0;
        return;
      }
    }

    moveFocus(direction);
    lastDirection = direction;
    lastDirectionAt = now;
  }

  function moveFocus(direction) {
    const elements = getFocusableElements();
    if (!elements.length) return;

    const current = getCurrentElement(elements);
    if (!current) {
      focusElement(firstVisibleInViewport(elements) || elements[0]);
      return;
    }

    const currentInfo = elementInfo(current);
    const scope = closestScope(current);
    const section = closestSection(current);
    const pane = closestPane(current);
    const scopedElements = elementsInside(scope, elements);
    const sectionElements = elementsInside(section, elements);
    const paneElements = elementsInside(pane, elements);

    let nextElement = paneJump(elements, currentInfo, direction);
    if (direction === "left" || direction === "right") {
      nextElement = nextElement ||
        bestSpatialIn(scopedElements, currentInfo, direction) ||
        bestSpatialIn(sectionElements, currentInfo, direction) ||
        bestSpatialIn(paneElements, currentInfo, direction);
    } else if (direction === "down") {
      nextElement = nextElement ||
        bestSpatialIn(scopedElements, currentInfo, direction) ||
        nextScopeEntryInSection(elements, currentInfo, direction) ||
        bestSpatialIn(sectionElements, currentInfo, direction) ||
        nextSectionEntry(elements, currentInfo, direction, pane) ||
        bestSpatialIn(paneElements, currentInfo, direction);
    } else {
      nextElement = nextElement ||
        bestSpatialIn(scopedElements, currentInfo, direction) ||
        nextScopeEntryInSection(elements, currentInfo, direction) ||
        bestSpatialIn(sectionElements, currentInfo, direction) ||
        bestSpatialIn(paneElements, currentInfo, direction) ||
        nextSectionEntry(elements, currentInfo, direction, pane);
    }

    if (nextElement) focusElement(nextElement);
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
      handleDirectionPress(direction);
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
    lastDirection = "";
    lastDirectionAt = 0;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      document.body.classList.remove("gamepad-nav-active");
      clearGamepadFocus();
      lastDirection = "";
      lastDirectionAt = 0;
    }
  });

  window.AoyaoGamepadNav = {
    focusFirst() {
      const elements = getFocusableElements();
      focusElement(firstVisibleInViewport(elements) || elements[0]);
    },
    moveFocus,
    pressDirection: handleDirectionPress,
    snapshot: currentGamepadSnapshot,
  };

  startPolling();
})();
