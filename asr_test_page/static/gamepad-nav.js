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
  const stickDeadzone = 0.55;
  const stickInitialRepeatMs = 360;
  const stickRepeatMs = 220;
  const rightStickScrollSpeed = 26;
  const rightStickDeadzone = 0.24;

  let activeGamepadIndex = null;
  let polling = false;
  let nativePolling = false;
  let heldDpadDirection = "";
  let heldLeftStickDirection = "";
  let leftStickRepeatAt = 0;
  let heldButtons = new Set();
  let sidebarReturnArmedElement = null;
  let sidebarReturnArmedAt = 0;
  let datePicker = null;
  let selectPicker = null;
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
    scrollFocusedElementIntoView(element);
  }

  function stickyTopOffset() {
    const toolbar = document.querySelector(".form-toolbar");
    if (!toolbar || !isVisible(toolbar)) return 16;
    const rect = toolbar.getBoundingClientRect();
    return Math.max(16, Math.min(rect.bottom + 12, rect.height + 24));
  }

  function scrollFocusedElementIntoView(element) {
    if (element.closest(".sidebar, .record-list, .export-record-list, .gamepad-date-picker, .gamepad-select-picker, .voice-panel")) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const topGuard = stickyTopOffset();
    const bottomGuard = viewportHeight - 76;
    const preferredTop = Math.max(topGuard + 20, Math.round(viewportHeight * 0.24));
    const tooHigh = rect.top < topGuard;
    const tooLow = rect.bottom > bottomGuard || rect.top > viewportHeight * 0.46;

    if (tooHigh || tooLow) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - preferredTop),
        behavior: "auto",
      });
    } else {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
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
        ".visit-row",
        ".gamepad-date-header",
        ".gamepad-date-grid",
        ".gamepad-select-options",
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
        ".gamepad-date-picker",
        ".gamepad-select-picker",
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
          ".gamepad-date-picker",
          ".gamepad-select-picker",
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
      const patientAddress = document.querySelector("#patientAddress");
      if (patientAddress && elements.includes(patientAddress) && isVisible(patientAddress)) {
        return patientAddress;
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

    const addressRecordSearchInput = document.querySelector("#addressRecordSearchInput");
    if (addressRecordSearchInput && elements.includes(addressRecordSearchInput) && isVisible(addressRecordSearchInput)) {
      return addressRecordSearchInput;
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

  function clearSidebarReturnArm() {
    sidebarReturnArmedElement = null;
    sidebarReturnArmedAt = 0;
  }

  function resetGamepadHoldState() {
    heldButtons = new Set();
    heldDpadDirection = "";
    heldLeftStickDirection = "";
    leftStickRepeatAt = 0;
  }

  function activeVoicePanel() {
    const panel = document.querySelector("#voicePanel:not([hidden])");
    return panel && isVisible(panel) ? panel : null;
  }

  function voicePanelButtons() {
    const panel = activeVoicePanel();
    if (!panel) return [];
    return ["#voiceAppendButton", "#voiceReplaceButton", "#voiceCancelButton"]
      .map((selector) => panel.querySelector(selector))
      .filter((button) => button instanceof HTMLButtonElement && !button.disabled && isVisible(button));
  }

  function focusDefaultVoicePanelButton() {
    const firstButton = voicePanelButtons()[0];
    if (firstButton) focusElement(firstButton);
  }

  function ensureVoicePanelFocus() {
    const buttons = voicePanelButtons();
    if (!buttons.length) return;
    if (!buttons.includes(document.activeElement)) focusElement(buttons[0]);
  }

  function handleVoicePanelDirection(direction) {
    const buttons = voicePanelButtons();
    if (!buttons.length || !direction) return Boolean(activeVoicePanel());

    const currentIndex = buttons.includes(document.activeElement)
      ? buttons.indexOf(document.activeElement)
      : 0;
    const step = direction === "left" || direction === "up" ? -1 : 1;
    const nextIndex = (currentIndex + step + buttons.length) % buttons.length;
    focusElement(buttons[nextIndex]);
    return true;
  }

  function handleVoicePanelButtonPress(name) {
    if (!activeVoicePanel()) return false;
    ensureVoicePanelFocus();
    if (name === "a") {
      const buttons = voicePanelButtons();
      const current = buttons.includes(document.activeElement) ? document.activeElement : buttons[0];
      if (current) current.click();
    }
    return true;
  }

  function handleVoicePanelButtonEdges(buttons) {
    ["b", "x", "y"].forEach((name) => {
      if (buttons[name]) {
        heldButtons.add(name);
      } else {
        heldButtons.delete(name);
      }
    });

    if (buttons.a && !heldButtons.has("a")) {
      handleVoicePanelButtonPress("a");
      heldButtons.add("a");
    } else if (!buttons.a && heldButtons.has("a")) {
      heldButtons.delete("a");
    }
  }

  function handleVoicePanelMode(input) {
    if (!activeVoicePanel()) return false;
    ensureVoicePanelFocus();
    handleDpadDirection(input.dpadDirection);
    handleVoicePanelButtonEdges(input.buttons);
    return true;
  }

  function isRecordFormRowLeftEdge(current, elements) {
    const recordForm = document.querySelector("#recordForm");
    if (!recordForm || !recordForm.contains(current)) return false;

    const currentInfo = elementInfo(current);
    const formElements = elementsInside(recordForm, elements).map(elementInfo);
    const rowElements = formElements.filter((candidate) => sameVisualRow(currentInfo.rect, candidate.rect));
    const leftmostInRow = Math.min(...rowElements.map((candidate) => candidate.rect.left));
    if (!Number.isFinite(leftmostInRow) || currentInfo.rect.left > leftmostInRow + 16) return false;

    if (current.closest(".visit-row")) return true;

    const layout = closestSection(current) || recordForm;
    const layoutRect = layout.getBoundingClientRect();
    return currentInfo.rect.left <= layoutRect.left + 28;
  }

  function handleDirectionPress(direction) {
    if (activeVoicePanel()) {
      handleVoicePanelDirection(direction);
      return;
    }

    if (activeSelectPicker()) {
      handleSelectPickerDirection(direction);
      return;
    }

    const elements = getFocusableElements();
    const current = getCurrentElement(elements);
    const now = Date.now();
    const canReturnToSidebar =
      direction === "left" && current && !current.closest(".sidebar") && isRecordFormRowLeftEdge(current, elements);

    if (
      canReturnToSidebar &&
      sidebarReturnArmedElement === current &&
      now - sidebarReturnArmedAt <= doublePressMs
    ) {
      const target = sidebarReturnTarget(elements);
      if (target) {
        focusElement(target);
        clearSidebarReturnArm();
        return;
      }
    }

    moveFocus(direction);

    if (canReturnToSidebar) {
      sidebarReturnArmedElement = current;
      sidebarReturnArmedAt = now;
    } else {
      clearSidebarReturnArm();
    }
  }

  function handleLeftStickDirection(direction) {
    if (activeVoicePanel()) return;
    if (activeSelectPicker()) return;

    const elements = getFocusableElements();
    const current = getCurrentElement(elements);
    if (current && current.closest(".sidebar") && (direction === "left" || direction === "right")) return;
    moveFocus(direction, { allowPaneJump: false });
    clearSidebarReturnArm();
  }

  function moveFocus(direction, options = {}) {
    const allowPaneJump = options.allowPaneJump !== false;
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

    let nextElement = allowPaneJump ? paneJump(elements, currentInfo, direction) : null;
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

    if (nextElement) {
      focusElement(nextElement);
    } else {
      scrollFocusedElementIntoView(current);
    }
  }

  function handleButtonPress(name) {
    if (handleVoicePanelButtonPress(name)) return;

    if (name === "x") {
      const saveButton = document.querySelector("#saveButton");
      if (saveButton && !saveButton.disabled) saveButton.click();
      return;
    }

    if (name === "b") {
      deleteFromCurrentTextEnd();
      return;
    }

    if (name === "y") {
      toggleVoiceForCurrentElement();
      return;
    }

    if (name === "a") {
      activateCurrentElement();
    }
  }

  function activateCurrentElement() {
    const elements = getFocusableElements();
    const current = getCurrentElement(elements) || document.activeElement;
    if (!(current instanceof HTMLElement)) return;

    if (current.matches("input[type='date']")) {
      openGamepadDatePicker(current);
      return;
    }

    if (["patientAddress", "patientGender"].includes(current.id) && current instanceof HTMLSelectElement) {
      openGamepadSelectPicker(current);
      return;
    }

    if (current.id === "addressRecordSearchInput" && current instanceof HTMLInputElement) {
      openGamepadSelectPicker(current);
      return;
    }

    current.click();
  }

  function deleteFromCurrentTextEnd() {
    const elements = getFocusableElements();
    const current = getCurrentElement(elements) || document.activeElement;
    const target = textDeleteTarget(current);
    if (!target) return;

    focusElement(target);
    const characters = Array.from(target.value || "");
    if (!characters.length) {
      moveTextCursorToEnd(target);
      return;
    }

    characters.pop();
    target.value = characters.join("");
    moveTextCursorToEnd(target);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function textDeleteTarget(element) {
    if (element instanceof HTMLTextAreaElement) {
      return element.disabled || element.readOnly ? null : element;
    }

    if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) {
      return null;
    }

    const type = (element.getAttribute("type") || "text").toLowerCase();
    const textTypes = new Set(["text", "search", "tel", "url", "email", "password", "number"]);
    return textTypes.has(type) ? element : null;
  }

  function moveTextCursorToEnd(element) {
    const end = element.value.length;
    if (typeof element.setSelectionRange !== "function") return;
    try {
      element.setSelectionRange(end, end);
    } catch (_) {
      // Some input types expose setSelectionRange but reject text selection.
    }
  }

  function toggleVoiceForCurrentElement() {
    const recordingButton = document.querySelector(".voice-button.recording");
    if (recordingButton instanceof HTMLButtonElement && !recordingButton.disabled) {
      recordingButton.click();
      return;
    }

    const elements = getFocusableElements();
    const current = getCurrentElement(elements) || document.activeElement;
    if (!(current instanceof HTMLElement) || !current.id) return;

    const directVoiceButton = directVoiceButtonForElement(current);
    if (directVoiceButton) {
      directVoiceButton.click();
      return;
    }

    const voiceButton = Array.from(document.querySelectorAll(".voice-button[data-target]")).find(
      (button) => button.dataset.target === current.id
    );
    if (voiceButton instanceof HTMLButtonElement && !voiceButton.disabled) {
      voiceButton.click();
    }
  }

  function directVoiceButtonForElement(element) {
    if (["patientAddress", "recordNo"].includes(element.id)) {
      const button = document.querySelector('.voice-button[data-voice-mode="address-record"][data-voice-scope="form"]');
      return button instanceof HTMLButtonElement && !button.disabled ? button : null;
    }
    if (element.id === "addressRecordSearchInput") {
      const button = document.querySelector('.voice-button[data-voice-mode="address-record"][data-voice-scope="search"]');
      return button instanceof HTMLButtonElement && !button.disabled ? button : null;
    }
    return null;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateForInput(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseInputDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function sameDate(a, b) {
    return (
      a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function addMonths(date, count) {
    return new Date(date.getFullYear(), date.getMonth() + count, 1);
  }

  function closeGamepadDatePicker() {
    if (datePicker && datePicker.element) {
      datePicker.element.remove();
    }
    datePicker = null;
  }

  function activeSelectPicker() {
    return selectPicker && selectPicker.element && isVisible(selectPicker.element) ? selectPicker : null;
  }

  function closeGamepadSelectPicker(focusSelect = false) {
    const target = selectPicker && selectPicker.target;
    if (selectPicker && selectPicker.element) {
      selectPicker.element.remove();
    }
    selectPicker = null;
    if (focusSelect && target) focusElement(target);
  }

  function openGamepadDatePicker(input) {
    closeGamepadDatePicker();
    closeGamepadSelectPicker();
    const selectedDate = parseInputDate(input.value) || new Date();
    const viewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const element = document.createElement("div");
    element.className = "gamepad-date-picker";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "日期选择");
    document.body.appendChild(element);
    datePicker = { input, selectedDate, viewDate, element };
    renderGamepadDatePicker();
  }

  function positionGamepadDatePicker() {
    if (!datePicker) return;
    const inputRect = datePicker.input.getBoundingClientRect();
    const pickerRect = datePicker.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(12, Math.min(inputRect.left, viewportWidth - pickerRect.width - 12));
    const belowTop = inputRect.bottom + 8;
    const aboveTop = inputRect.top - pickerRect.height - 8;
    const top = belowTop + pickerRect.height <= viewportHeight - 12 ? belowTop : Math.max(12, aboveTop);
    datePicker.element.style.left = `${left}px`;
    datePicker.element.style.top = `${top}px`;
  }

  function renderGamepadDatePicker(focusSelector) {
    if (!datePicker) return;
    const year = datePicker.viewDate.getFullYear();
    const month = datePicker.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(year, month, 1 - firstDay.getDay());
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const days = Array.from({ length: 42 }).map((_, index) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const value = formatDateForInput(day);
      const classes = [
        "gamepad-date-day",
        day.getMonth() === month ? "" : "outside",
        sameDate(day, datePicker.selectedDate) ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="${classes}" data-gamepad-date-value="${value}">${day.getDate()}</button>`;
    });

    datePicker.element.innerHTML = `
      <div class="gamepad-date-header">
        <button type="button" data-gamepad-date-action="prevYear" title="上一年">↑</button>
        <button type="button" data-gamepad-date-action="prevMonth" title="上个月">‹</button>
        <div class="gamepad-date-title">${year}年${pad2(month + 1)}月</div>
        <button type="button" data-gamepad-date-action="nextMonth" title="下个月">›</button>
        <button type="button" data-gamepad-date-action="nextYear" title="下一年">↓</button>
      </div>
      <div class="gamepad-date-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="gamepad-date-grid">${days.join("")}</div>
    `;

    datePicker.element.querySelectorAll("[data-gamepad-date-action]").forEach((button) => {
      button.addEventListener("click", () => handleDatePickerAction(button.dataset.gamepadDateAction));
    });
    datePicker.element.querySelectorAll("[data-gamepad-date-value]").forEach((button) => {
      button.addEventListener("click", () => chooseDateValue(button.dataset.gamepadDateValue));
    });

    positionGamepadDatePicker();
    const focusTarget =
      (focusSelector && datePicker.element.querySelector(focusSelector)) ||
      datePicker.element.querySelector(`[data-gamepad-date-value="${formatDateForInput(datePicker.selectedDate)}"]`) ||
      datePicker.element.querySelector("[data-gamepad-date-value]");
    if (focusTarget) focusElement(focusTarget);
  }

  function handleDatePickerAction(action) {
    if (!datePicker) return;
    const monthOffsets = {
      prevYear: -12,
      prevMonth: -1,
      nextMonth: 1,
      nextYear: 12,
    };
    datePicker.viewDate = addMonths(datePicker.viewDate, monthOffsets[action] || 0);
    renderGamepadDatePicker(`[data-gamepad-date-action="${action}"]`);
  }

  function chooseDateValue(value) {
    if (!datePicker || !value) return;
    datePicker.input.value = value;
    datePicker.input.dispatchEvent(new Event("input", { bubbles: true }));
    datePicker.input.dispatchEvent(new Event("change", { bubbles: true }));
    const input = datePicker.input;
    closeGamepadDatePicker();
    focusElement(input);
  }

  function openGamepadSelectPicker(target) {
    const optionSource = target instanceof HTMLSelectElement ? target : document.querySelector("#patientAddress");
    const options = Array.from(optionSource ? optionSource.options : []).filter((option) => option.value);
    if (!options.length) return;
    closeGamepadDatePicker();
    closeGamepadSelectPicker();

    const selectedIndex = selectedPickerIndex(options, target);
    const element = document.createElement("div");
    element.className = "gamepad-select-picker";
    element.setAttribute("role", "listbox");
    element.setAttribute("aria-label", selectPickerTitle(target));
    document.body.appendChild(element);
    selectPicker = {
      target,
      mode: target instanceof HTMLSelectElement ? "form" : "search",
      title: selectPickerTitle(target),
      options,
      selectedIndex,
      element,
    };
    renderGamepadSelectPicker();
  }

  function selectPickerTitle(target) {
    return target && target.id === "patientGender" ? "选择性别" : "选择地址";
  }

  function selectedPickerIndex(options, target) {
    const currentValue = String(target && target.value ? target.value : "");
    const exactIndex = options.findIndex((option) => option.value === currentValue);
    if (exactIndex >= 0) return exactIndex;
    const includedIndex = options.findIndex((option) => currentValue.includes(option.value));
    return Math.max(0, includedIndex);
  }

  function positionGamepadSelectPicker() {
    if (!selectPicker) return;
    const selectRect = selectPicker.target.getBoundingClientRect();
    const pickerRect = selectPicker.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(12, Math.min(selectRect.left, viewportWidth - pickerRect.width - 12));
    const belowTop = selectRect.bottom + 8;
    const aboveTop = selectRect.top - pickerRect.height - 8;
    const top = belowTop + pickerRect.height <= viewportHeight - 12 ? belowTop : Math.max(12, aboveTop);
    selectPicker.element.style.left = `${left}px`;
    selectPicker.element.style.top = `${top}px`;
  }

  function renderGamepadSelectPicker() {
    if (!selectPicker) return;
    const { element, options, selectedIndex, title: pickerTitle } = selectPicker;
    element.innerHTML = "";

    const title = document.createElement("div");
    title.className = "gamepad-select-title";
    title.textContent = pickerTitle || "选择";
    element.appendChild(title);

    const list = document.createElement("div");
    list.className = "gamepad-select-options";
    options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gamepad-select-option${index === selectedIndex ? " selected" : ""}`;
      button.dataset.gamepadSelectIndex = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
      button.textContent = option.textContent || option.value;
      button.addEventListener("click", () => chooseSelectValue(index));
      list.appendChild(button);
    });
    element.appendChild(list);

    positionGamepadSelectPicker();
    const selected = element.querySelector(`[data-gamepad-select-index="${selectedIndex}"]`);
    if (selected) focusElement(selected);
  }

  function handleSelectPickerDirection(direction) {
    if (!selectPicker || !direction) return;
    if (direction === "left" || direction === "right") {
      closeGamepadSelectPicker(true);
      return;
    }
    moveSelectPicker(direction);
  }

  function moveSelectPicker(direction) {
    if (!selectPicker || !["up", "down"].includes(direction)) return;
    const step = direction === "up" ? -1 : 1;
    selectPicker.selectedIndex =
      (selectPicker.selectedIndex + step + selectPicker.options.length) % selectPicker.options.length;
    renderGamepadSelectPicker();
  }

  function handleSelectPickerLeftStickRepeat(direction, now) {
    const verticalDirection = direction === "up" || direction === "down" ? direction : "";
    if (!verticalDirection) {
      heldLeftStickDirection = "";
      leftStickRepeatAt = 0;
      return;
    }

    if (verticalDirection !== heldLeftStickDirection) {
      moveSelectPicker(verticalDirection);
      heldLeftStickDirection = verticalDirection;
      leftStickRepeatAt = now + stickInitialRepeatMs;
      return;
    }

    if (now >= leftStickRepeatAt) {
      moveSelectPicker(verticalDirection);
      leftStickRepeatAt = now + stickRepeatMs;
    }
  }

  function handleSelectPickerButtonPress(name) {
    if (!selectPicker) return false;
    if (name === "a") {
      chooseSelectValue(selectPicker.selectedIndex);
    }
    return true;
  }

  function handleSelectPickerButtonEdges(buttons) {
    ["b", "x", "y"].forEach((name) => {
      if (buttons[name]) {
        heldButtons.add(name);
      } else {
        heldButtons.delete(name);
      }
    });

    if (buttons.a && !heldButtons.has("a")) {
      handleSelectPickerButtonPress("a");
      heldButtons.add("a");
    } else if (!buttons.a && heldButtons.has("a")) {
      heldButtons.delete("a");
    }
  }

  function handleSelectPickerMode(input, now) {
    if (!activeSelectPicker()) return false;
    if (input.dpadDirection && !heldDpadDirection) {
      handleSelectPickerDirection(input.dpadDirection);
      heldDpadDirection = input.dpadDirection;
    } else if (!input.dpadDirection) {
      heldDpadDirection = "";
    }
    handleSelectPickerLeftStickRepeat(input.leftStickDirection, now);
    handleSelectPickerButtonEdges(input.buttons);
    return true;
  }

  function chooseSelectValue(index) {
    if (!selectPicker) return;
    const option = selectPicker.options[index];
    const target = selectPicker.target;
    if (!option || !target) return;
    if (selectPicker.mode === "search") {
      target.value = searchAddressValue(target.value, option.value);
    } else {
      target.value = option.value;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    closeGamepadSelectPicker();
    focusElement(target);
  }

  function searchAddressValue(currentValue, address) {
    const recordNoMatch = String(currentValue || "").match(/\d+/);
    return [address, recordNoMatch ? recordNoMatch[0] : ""].filter(Boolean).join(" ");
  }

  function pressed(button) {
    return Boolean(button && button.pressed);
  }

  function clampAxis(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-1, Math.min(1, number));
  }

  function directionFromAxes(xAxis, yAxis) {
    const x = clampAxis(xAxis);
    const y = clampAxis(yAxis);
    if (Math.abs(x) < stickDeadzone && Math.abs(y) < stickDeadzone) return "";
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }

  function emptyInputState() {
    return {
      dpadDirection: "",
      leftStickDirection: "",
      rightStickY: 0,
      buttons: {
        a: false,
        b: false,
        x: false,
        y: false,
      },
    };
  }

  function normalizeDirection(value) {
    return ["up", "down", "left", "right"].includes(value) ? value : "";
  }

  function hasFreshNativeGamepad() {
    return nativeGamepadState.available && Date.now() - nativeGamepadState.updatedAt < nativeStateFreshMs;
  }

  function inputFromBrowserGamepad(gamepad) {
    const state = emptyInputState();
    if (!gamepad) return state;
    const buttons = gamepad.buttons || [];
    if (pressed(buttons[12])) state.dpadDirection = "up";
    if (pressed(buttons[13])) state.dpadDirection = "down";
    if (pressed(buttons[14])) state.dpadDirection = "left";
    if (pressed(buttons[15])) state.dpadDirection = "right";
    state.buttons.a = pressed(buttons[0]);
    state.buttons.b = pressed(buttons[1]);
    state.buttons.x = pressed(buttons[3]);
    state.buttons.y = pressed(buttons[4]);

    const axes = gamepad.axes || [];
    state.leftStickDirection = directionFromAxes(axes[0], axes[1]);
    state.rightStickY = clampAxis(axes[3]);
    return state;
  }

  function getActiveGamepad() {
    const gamepads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []);
    if (activeGamepadIndex !== null && gamepads[activeGamepadIndex]) {
      return gamepads[activeGamepadIndex];
    }
    return gamepads.find(Boolean) || null;
  }

  function inputFromNativeGamepad() {
    if (!hasFreshNativeGamepad()) return emptyInputState();

    const sourceState = (nativeGamepadState.snapshot && nativeGamepadState.snapshot.state) || {};
    const buttons = sourceState.buttons || {};
    const sticks = sourceState.sticks || {};
    return {
      dpadDirection: normalizeDirection(sourceState.direction),
      leftStickDirection: normalizeDirection(sticks.left && sticks.left.direction),
      rightStickY: clampAxis(sticks.right && sticks.right.y),
      buttons: {
        a: Boolean(buttons.a),
        b: Boolean(buttons.b),
        x: Boolean(buttons.x),
        y: Boolean(buttons.y),
      },
    };
  }

  function mergedInputState() {
    const nativeAvailable = hasFreshNativeGamepad();
    const nativeInput = inputFromNativeGamepad();
    const browserInput = inputFromBrowserGamepad(getActiveGamepad());
    const rightStickY = nativeAvailable ? nativeInput.rightStickY : 0;

    return {
      dpadDirection: nativeInput.dpadDirection || browserInput.dpadDirection,
      leftStickDirection: nativeInput.leftStickDirection || browserInput.leftStickDirection,
      rightStickY,
      buttons: {
        a: nativeInput.buttons.a || browserInput.buttons.a,
        b: nativeInput.buttons.b || browserInput.buttons.b,
        x: nativeInput.buttons.x || browserInput.buttons.x,
        y: nativeInput.buttons.y || browserInput.buttons.y,
      },
    };
  }

  function scrollFromRightStick(yAxis) {
    if (activeVoicePanel()) return;
    if (activeSelectPicker()) return;

    const y = clampAxis(yAxis);
    if (Math.abs(y) < rightStickDeadzone) return;
    window.scrollBy({
      top: y * rightStickScrollSpeed,
      left: 0,
      behavior: "auto",
    });
  }

  function handleLeftStickRepeat(direction, now) {
    if (!direction) {
      heldLeftStickDirection = "";
      leftStickRepeatAt = 0;
      return;
    }

    if (direction !== heldLeftStickDirection) {
      handleLeftStickDirection(direction);
      heldLeftStickDirection = direction;
      leftStickRepeatAt = now + stickInitialRepeatMs;
      return;
    }

    if (now >= leftStickRepeatAt) {
      handleLeftStickDirection(direction);
      leftStickRepeatAt = now + stickRepeatMs;
    }
  }

  function handleDpadDirection(direction) {
    if (direction && !heldDpadDirection) {
      handleDirectionPress(direction);
      heldDpadDirection = direction;
    }

    if (!direction) {
      heldDpadDirection = "";
    }
  }

  function handleButtonEdges(buttons) {
    ["a", "b", "x", "y"].forEach((name) => {
      if (buttons[name] && !heldButtons.has(name)) {
        handleButtonPress(name);
        heldButtons.add(name);
      } else if (!buttons[name] && heldButtons.has(name)) {
        heldButtons.delete(name);
      }
    });
  }

  function tick() {
    const input = mergedInputState();
    const now = Date.now();
    if (handleVoicePanelMode(input)) {
      window.requestAnimationFrame(tick);
      return;
    }
    if (handleSelectPickerMode(input, now)) {
      window.requestAnimationFrame(tick);
      return;
    }

    scrollFromRightStick(input.rightStickY);
    handleDpadDirection(input.dpadDirection);
    handleLeftStickRepeat(input.leftStickDirection, now);
    handleButtonEdges(input.buttons);

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
      input: mergedInputState(),
      heldDpadDirection,
      heldLeftStickDirection,
      heldButtons: Array.from(heldButtons),
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

  window.addEventListener("aoyao:voice-panel-open", () => {
    clearSidebarReturnArm();
    resetGamepadHoldState();
    window.requestAnimationFrame(focusDefaultVoicePanelButton);
  });

  window.addEventListener("aoyao:voice-panel-close", () => {
    clearSidebarReturnArm();
    resetGamepadHoldState();
    clearGamepadFocus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      datePicker &&
      !datePicker.element.contains(event.target) &&
      event.target !== datePicker.input
    ) {
      closeGamepadDatePicker();
    }
    if (
      selectPicker &&
      !selectPicker.element.contains(event.target) &&
      event.target !== selectPicker.target
    ) {
      closeGamepadSelectPicker();
    }
    document.body.classList.remove("gamepad-nav-active");
    clearGamepadFocus();
    clearSidebarReturnArm();
    resetGamepadHoldState();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      closeGamepadDatePicker();
      closeGamepadSelectPicker();
      document.body.classList.remove("gamepad-nav-active");
      clearGamepadFocus();
      clearSidebarReturnArm();
      resetGamepadHoldState();
    }
  });

  window.AoyaoGamepadNav = {
    focusFirst() {
      const elements = getFocusableElements();
      focusElement(firstVisibleInViewport(elements) || elements[0]);
    },
    moveFocus,
    pressDirection: handleDirectionPress,
    pressLeftStick: handleLeftStickDirection,
    pressButton: handleButtonPress,
    snapshot: currentGamepadSnapshot,
  };

  startPolling();
})();
