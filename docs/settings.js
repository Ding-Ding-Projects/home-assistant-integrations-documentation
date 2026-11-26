/*
 * Reader settings. The personal wording validator and whole-word replacer are
 * adapted from Home Assistant Material frontend/src/common/vocabulary/personal-vocabulary.ts
 * under Apache-2.0. The storage and reader interface are specific to this atlas.
 */
(() => {
  "use strict";
  const VOCABULARY_LIMITS = {
    bytes: 262144,
    depth: 8,
    key: 160,
    value: 1000,
  };
  const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
  const fail = (error) => ({
    ok: false,
    error,
  });
  const scanStructure = (text) => {
    let depth = 0;
    let maxDepth = 0;
    let duplicate = false;
    const stack = [];
    let expectKey = false;
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        let end = index + 1;
        while (text[end] !== '"') {
          end += text[end] === "\\" ? 2 : 1;
        }
        if (expectKey) {
          const key = JSON.parse(text.slice(index, end + 1));
          const keys = stack[stack.length - 1];
          if (keys.has(key)) {
            duplicate = true;
          }
          keys.add(key);
          expectKey = false;
        }
        index = end + 1;
        continue;
      }
      if (char === "{" || char === "[") {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        stack.push(char === "{" ? new Set() : undefined);
        expectKey = char === "{";
      } else if (char === "}" || char === "]") {
        depth--;
        stack.pop();
        expectKey = false;
      } else if (char === ",") {
        expectKey = stack[stack.length - 1] !== undefined;
      }
      index++;
    }
    return {
      depth: maxDepth,
      duplicate,
    };
  };
  const parsePersonalVocabulary = (input) => {
    let text;
    if (typeof input === "string") {
      if (
        input.length > VOCABULARY_LIMITS.bytes ||
        new TextEncoder().encode(input).length > VOCABULARY_LIMITS.bytes
      ) {
        return fail("too_large");
      }
      text = input;
    } else {
      if (input.byteLength > VOCABULARY_LIMITS.bytes) {
        return fail("too_large");
      }
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
        }).decode(input);
      } catch (_err) {
        return fail("not_utf8");
      }
    }
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_err) {
      return fail("malformed");
    }
    const structure = scanStructure(text);
    if (structure.depth > VOCABULARY_LIMITS.depth) {
      return fail("too_deep");
    }
    if (structure.duplicate) {
      return fail("duplicate_key");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("malformed");
    }
    const root = parsed;
    const fields = Object.keys(root);
    if (fields.some((field) => UNSAFE_KEYS.has(field))) {
      return fail("unsafe_key");
    }
    if (
      fields.some((field) => field !== "schemaVersion" && field !== "entries")
    ) {
      return fail("unknown_field");
    }
    if (root.schemaVersion !== 1) {
      return fail("unsupported_version");
    }
    const rawEntries = root.entries;
    if (
      !rawEntries ||
      typeof rawEntries !== "object" ||
      Array.isArray(rawEntries)
    ) {
      return fail("bad_entries");
    }
    const entries = Object.create(null);
    let count = 0;
    for (const [key, value] of Object.entries(rawEntries)) {
      if (UNSAFE_KEYS.has(key)) {
        return fail("unsafe_key");
      }
      if (!key.trim() || key.length > VOCABULARY_LIMITS.key) {
        return fail("bad_key");
      }
      if (typeof value !== "string" || value.length > VOCABULARY_LIMITS.value) {
        return fail("bad_value");
      }
      if (CONTROL.test(key) || CONTROL.test(value)) {
        return fail("control_character");
      }
      entries[key] = value;
      count++;
    }
    return {
      ok: true,
      entries,
      count,
    };
  };
  const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
  const escapeForRegExp = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  const buildVocabularyReplacer = (entries) => {
    const all = Object.create(null);
    for (const [key, value] of Object.entries(entries)) {
      all[key] = value;
    }
    for (const [key, value] of Object.entries(entries)) {
      const first = key[0];
      const upper = first.toLocaleUpperCase();
      if (first === upper || first.toLocaleLowerCase() !== first) {
        continue;
      }
      const capital = upper + key.slice(1);
      if (!(capital in all)) {
        const lead = value[0] ?? "";
        const small =
          lead.toLocaleLowerCase() === lead &&
          lead.toLocaleUpperCase() !== lead;
        all[capital] = small
          ? lead.toLocaleUpperCase() + value.slice(1)
          : value;
      }
    }
    const keys = Object.keys(all).sort((a, b) => b.length - a.length);
    if (!keys.length) {
      return (text) => text;
    }
    const pattern = new RegExp(keys.map(escapeForRegExp).join("|"), "g");
    const literalBefore = /[_/\\@.]/;
    const literalAfter = /[_/\\@]/;
    return (text) => {
      if (!text) {
        return text;
      }
      return text.replace(pattern, (match, offset) => {
        const before = offset > 0 ? text[offset - 1] : "";
        const after = text[offset + match.length] ?? "";
        const afterNext = text[offset + match.length + 1] ?? "";
        if (
          (before &&
            (LETTER_OR_DIGIT.test(before) || literalBefore.test(before))) ||
          (after &&
            (LETTER_OR_DIGIT.test(after) || literalAfter.test(after))) ||
          (after === "." && LETTER_OR_DIGIT.test(afterNext)) ||
          (after === ":" && afterNext === "/")
        ) {
          return match;
        }
        return all[match] ?? match;
      });
    };
  };

  const SETTINGS = "integration-atlas:reader:v1";
  const WORDING = "integration-atlas:wording:v1";
  const modes = ["en", "yue", "both"];
  const sizes = ["100", "112", "125", "150"];
  const types = ["editorial", "system"];
  const spacings = ["comfortable", "relaxed", "spacious"];
  const measures = ["narrow", "standard", "wide"];
  const colorModes = ["system", "light", "dark"];
  const defaults = {
    language: "en",
    size: "100",
    motion: "system",
    type: "editorial",
    spacing: "relaxed",
    measure: "standard",
    color: "system",
  };
  const messages = {
    settings: ["Settings", "設定"],
    title: ["Reader settings", "閱讀設定"],
    language: ["Control language", "控制項語言"],
    font: ["Text size", "字體大小"],
    motion: ["Motion", "動態效果"],
    type: ["Typeface", "字體風格"],
    spacing: ["Line spacing", "行距"],
    measure: ["Article width", "文章寬度"],
    color: ["Color mode", "顏色模式"],
    editorial: ["Editorial", "編輯字體"],
    systemType: ["System", "系統字體"],
    comfortable: ["Comfortable", "舒適"],
    relaxed: ["Relaxed", "寬鬆"],
    spacious: ["Spacious", "特寬鬆"],
    narrow: ["Narrow", "窄"],
    standard: ["Standard", "標準"],
    wide: ["Wide", "寬"],
    light: ["Light", "淺色"],
    dark: ["Dark", "深色"],
    system: ["Use device setting", "跟裝置設定"],
    reduced: ["Reduce motion", "減少動態效果"],
    close: ["Close", "關閉"],
    wording: ["Personal wording", "個人用詞"],
    choose: ["Import wording file", "匯入用詞檔案"],
    format: [
      "Choose a version 1 JSON wording file, up to 256 KiB. It stays in this browser.",
      "請選擇第 1 版 JSON 用詞檔案，最多 256 KiB。檔案只會喺呢個瀏覽器處理。",
    ],
    clear: ["Clear wording", "清除個人用詞"],
    reset: ["Reset reader settings", "重設閱讀設定"],
    count: ["Active wording entries", "已套用詞條"],
    resetDone: ["Reader settings reset.", "閱讀設定已重設。"],
    cleared: ["Personal wording cleared.", "個人用詞已清除。"],
    imported: ["Wording imported.", "用詞已匯入。"],
    invalid: [
      "Import failed. Check the file format and values.",
      "匯入失敗。請檢查檔案格式同詞條。",
    ],
    large: [
      "Choose a file smaller than or equal to 256 KiB.",
      "請選擇 256 KiB 或以下嘅檔案。",
    ],
    storage: [
      "Changes apply on this page. Browser storage is unavailable.",
      "變更只會喺呢頁生效。瀏覽器儲存功能暫時用唔到。",
    ],
  };
  const chrome = new Map([
    ["Skip to content", "跳至內容"],
    ["Directory", "整合目錄"],
    ["Directory ↗", "整合目錄 ↗"],
    ["Find an integration", "搵整合"],
    ["Search integrations", "搜尋整合"],
    ["All collections", "所有分類"],
    ["Collection", "分類"],
    ["Home", "首頁"],
    // Reusable interface copy shared by the homepage, directory, guides,
    // references, tour, and reading workspace. Keep this list to UI labels;
    // article prose and integration names remain in their source language.
    ["Workspace", "閱讀工作區"],
    ["Skip to content", "跳至內容"],
    ["Guided tour", "網站導覽"],
    ["Accessibility", "無障礙設定"],
    ["Accessibility tools", "無障礙工具"],
    ["Independent Home Assistant integration reference", "獨立 Home Assistant 整合參考資料"],
    ["Sources & attribution", "來源及鳴謝"],
    ["Offline guide", "離線指南"],
    ["Browse integrations", "瀏覽整合"],
    ["Name or domain", "名稱或網域"],
    ["Overview", "概覽"],
    ["Guide", "指南"],
    ["Reference", "參考資料"],
    ["Integration reference", "整合參考資料"],
    ["Reading workspace", "閱讀工作區"],
    ["Find a guide or pick up where you left off.", "搵指南，或者繼續上次睇到嘅地方。"],
    ["Go to an integration", "前往整合頁面"],
    ["Integration name or domain", "整合名稱或網域"],
    ["Open as", "開啟為"],
    ["Saved pages", "已儲存頁面"],
    ["Name for this page", "呢頁嘅名稱"],
    ["Save page", "儲存頁面"],
    ["Reading history", "閱讀記錄"],
    ["Save a page to find it here.", "儲存頁面後，就可以喺呢度搵到。"],
    ["Opened integration pages will appear here.", "開過嘅整合頁面會喺呢度顯示。"],
    ["Clear all", "全部清除"],
    ["Cancel", "取消"],
    ["Confirm clear", "確認清除"],
    ["Export all", "匯出全部"],
    ["Export", "匯出"],
    ["Remove", "移除"],
    ["Close", "關閉"],
    ["Current page", "目前頁面"],
    ["Search directory", "搜尋目錄"],
    ["Choose a matching integration", "選擇符合條件嘅整合"],
    ["Find an integration", "搵整合"],
    ["Change the search or collection in the directory. Open any matching result to continue.", "喺目錄更改搜尋內容或分類，再打開符合條件嘅結果繼續。"],
    ["Focus directory filters", "移到目錄篩選器"],
    ["Open first match", "打開第一個結果"],
    ["Return to results", "返回搜尋結果"],
    ["No matches. Change the name or collection and try again.", "搵唔到結果。請更改名稱或分類，再試一次。"],
    ["Explore the integration story", "了解整合用途"],
    ["Open setup guide", "打開設定指南"],
    ["Return to the overview", "返回概覽"],
    ["Track your setup progress", "記錄設定進度"],
    ["Go to checklist", "前往核對清單"],
    ["Finish tour", "完成導覽"],
    ["Return to the guide", "返回指南"],
  ]);
  function setup() {
    const trigger = document.getElementById("reader-settings");
    if (!trigger) return;
    function read(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    function store(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    let saved;
    try {
      saved = JSON.parse(read(SETTINGS));
    } catch {}
    let preferences = {
      language: modes.includes(saved?.language)
        ? saved.language
        : defaults.language,
      size: sizes.includes(saved?.size) ? saved.size : defaults.size,
      motion: saved?.motion === "reduced" ? "reduced" : "system",
      type: types.includes(saved?.type) ? saved.type : defaults.type,
      spacing: spacings.includes(saved?.spacing) ? saved.spacing : defaults.spacing,
      measure: measures.includes(saved?.measure) ? saved.measure : defaults.measure,
      color: colorModes.includes(saved?.color) ? saved.color : defaults.color,
    };
    const cached = parsePersonalVocabulary(read(WORDING) || "");
    let entries = cached.ok ? cached.entries : {};
    let rewrite = buildVocabularyReplacer(entries);
    let generation = 0;
    let messageKey;
    let persistFailed = false;
    const dialog = document.createElement("dialog");
    dialog.id = "atlas-reader-dialog";
    dialog.setAttribute("aria-labelledby", "reader-title");
    dialog.innerHTML = `<div class="reader-head"><h2 id="reader-title" data-reader-label="title"></h2><button type="button" id="reader-close" data-reader-label="close" autofocus></button></div>
    <label for="reader-language" data-reader-label="language"></label><select id="reader-language">
      <option value="en" lang="en">English</option><option value="yue" lang="yue-Hant">廣東話</option><option value="both">English · 廣東話</option></select>
    <label for="reader-size" data-reader-label="font"></label><select id="reader-size"></select>
    <label for="reader-motion" data-reader-label="motion"></label><select id="reader-motion"><option value="system" data-reader-label="system"></option><option value="reduced" data-reader-label="reduced"></option></select>
    <label for="reader-type" data-reader-label="type"></label><select id="reader-type"><option value="editorial" data-reader-label="editorial"></option><option value="system" data-reader-label="systemType"></option></select>
    <label for="reader-spacing" data-reader-label="spacing"></label><select id="reader-spacing"><option value="comfortable" data-reader-label="comfortable"></option><option value="relaxed" data-reader-label="relaxed"></option><option value="spacious" data-reader-label="spacious"></option></select>
    <label for="reader-measure" data-reader-label="measure"></label><select id="reader-measure"><option value="narrow" data-reader-label="narrow"></option><option value="standard" data-reader-label="standard"></option><option value="wide" data-reader-label="wide"></option></select>
    <label for="reader-color" data-reader-label="color"></label><select id="reader-color"><option value="system" data-reader-label="system"></option><option value="light" data-reader-label="light"></option><option value="dark" data-reader-label="dark"></option></select>
    <fieldset><legend data-reader-label="wording"></legend><p id="reader-format" data-reader-label="format"></p>
    <label for="reader-file" data-reader-label="choose"></label><input id="reader-file" type="file" accept=".json,application/json" aria-describedby="reader-format">
    <p id="reader-count"></p><button type="button" id="reader-clear" data-reader-label="clear"></button></fieldset>
    <button type="button" id="reader-reset" data-reader-label="reset"></button>
    <p id="reader-status" role="status" aria-live="polite"></p>`;
    document.body.append(dialog);
    const field = (id) => dialog.querySelector("#reader-" + id);
    for (const size of sizes) field("size").add(new Option(size + "%", size));
    const localized = ([en, yue]) =>
      preferences.language === "yue"
        ? yue
        : preferences.language === "both"
          ? en + " · " + yue
          : en;
    const label = (key) => rewrite(localized(messages[key]));
    const originals = new WeakMap();
    const attributes = new WeakMap();
    function transform(source) {
      const trimmed = source.trim();
      return rewrite(
        chrome.has(trimmed)
          ? source.replace(trimmed, () =>
              localized([trimmed, chrome.get(trimmed)]),
            )
          : source,
      );
    }
    function applyText(node) {
      if (
        !node.parentElement ||
        node.parentElement.closest(
          "script,style,code,pre,kbd,samp,textarea,[translate=no],#atlas-reader-dialog,#reader-settings",
        )
      )
        return;
      const previous = originals.get(node);
      const source =
        previous && previous.rendered === node.data
          ? previous.source
          : node.data;
      const rendered = transform(source);
      originals.set(node, { source, rendered });
      if (node.data !== rendered) node.data = rendered;
    }
    function refreshNode(root) {
      if (root.nodeType === Node.TEXT_NODE) {
        applyText(root);
        return;
      }
      if (
        root.nodeType !== Node.ELEMENT_NODE ||
        root.closest("#atlas-reader-dialog,#reader-settings")
      )
        return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) applyText(walker.currentNode);
      for (const el of [
        root,
        ...root.querySelectorAll("[aria-label],[placeholder]"),
      ]) {
        if (el.closest("#atlas-reader-dialog,#reader-settings,[translate=no]"))
          continue;
        for (const attr of ["aria-label", "placeholder"]) {
          if (!el.hasAttribute(attr)) continue;
          const state = attributes.get(el) || {};
          const current = el.getAttribute(attr);
          const source =
            state[attr]?.rendered === current ? state[attr].source : current;
          const rendered = transform(source);
          if (current !== rendered) el.setAttribute(attr, rendered);
          state[attr] = { source, rendered };
          attributes.set(el, state);
        }
      }
    }
    function renderStatus() {
      field("status").textContent = [
        messageKey && label(messageKey),
        persistFailed && label("storage"),
      ]
        .filter(Boolean)
        .join(" ");
    }
    function render() {
      document.documentElement.style.fontSize = preferences.size + "%";
      document.documentElement.toggleAttribute(
        "data-reader-reduced-motion",
        preferences.motion === "reduced",
      );
      document.documentElement.dataset.readerType = preferences.type;
      document.documentElement.dataset.readerSpacing = preferences.spacing;
      document.documentElement.dataset.readerMeasure = preferences.measure;
      document.documentElement.dataset.readerColor = preferences.color;
      dialog.lang = preferences.language === "yue" ? "yue-Hant" : "en";
      field("size").value = preferences.size;
      field("language").value = preferences.language;
      field("motion").value = preferences.motion;
      for (const name of ["type", "spacing", "measure", "color"])
        field(name).value = preferences[name];
      for (const el of dialog.querySelectorAll("[data-reader-label]"))
        el.textContent = label(el.dataset.readerLabel);
      trigger.textContent = label("settings");
      trigger.lang = dialog.lang;
      const count = Object.keys(entries).length;
      field("count").textContent = label("count") + " · " + count;
      field("clear").disabled = !count;
      renderStatus();
      refreshNode(document.body);
    }
    const observer = new MutationObserver((records) => {
      if (!Object.keys(entries).length && preferences.language === "en") return;
      for (const record of records) {
        if (record.type === "characterData") applyText(record.target);
        else for (const node of record.addedNodes) refreshNode(node);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    for (const name of ["language", "size", "motion", "type", "spacing", "measure", "color"])
      field(name).addEventListener("change", () => {
        preferences[name] = field(name).value;
        messageKey = undefined;
        persistFailed = !store(SETTINGS, JSON.stringify(preferences));
        render();
      });
    field("file").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      const request = ++generation;
      try {
        if (file.size > VOCABULARY_LIMITS.bytes) {
          messageKey = "large";
          renderStatus();
          return;
        }
        const result = parsePersonalVocabulary(
          new Uint8Array(await file.arrayBuffer()),
        );
        if (request !== generation) return;
        if (!result.ok) {
          messageKey = "invalid";
          renderStatus();
          return;
        }
        entries = result.entries;
        rewrite = buildVocabularyReplacer(entries);
        persistFailed = !store(
          WORDING,
          JSON.stringify({ schemaVersion: 1, entries }),
        );
        messageKey = "imported";
        render();
      } catch {
        if (request === generation) {
          messageKey = "invalid";
          renderStatus();
        }
      }
    });
    function clearWording() {
      generation++;
      entries = {};
      rewrite = buildVocabularyReplacer(entries);
      return store(WORDING, null);
    }
    field("clear").addEventListener("click", () => {
      persistFailed = !clearWording();
      messageKey = "cleared";
      render();
    });
    field("reset").addEventListener("click", () => {
      const cleared = clearWording();
      preferences = { ...defaults };
      persistFailed = !store(SETTINGS, null) || !cleared;
      messageKey = "resetDone";
      render();
    });
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", dialog.id);
    trigger.addEventListener("click", () => dialog.showModal());
    field("close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => trigger.focus());
    render();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})();
