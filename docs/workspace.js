(() => {
  "use strict";
  // Resolve routes from the script so project hosting and local previews both work.
  const base = new URL("./", document.currentScript.src);
  const routes = {
    discover: "Overview",
    integrations: "Guide",
    references: "Reference",
  };
  const pages = {
    home: "index.html",
    directory: "directory.html",
    credits: "credits.html",
    license: "article-license.html",
  };
  const storageKey = "integration-atlas:workspace:v1";
  const safeDomain = /^[a-z0-9_]+$/;
  const MAX_SAVED = 500,
    MAX_HISTORY = 100;
  const empty = () => ({ saved: [], history: [] });

  function address(key) {
    if (typeof key !== "string") return null;
    if (Object.hasOwn(pages, key)) return new URL(pages[key], base);
    const parts = key.split("/");
    if (
      parts.length !== 2 ||
      !Object.hasOwn(routes, parts[0]) ||
      !safeDomain.test(parts[1])
    )
      return null;
    return new URL(key + "/", base);
  }
  function currentPage() {
    if (
      location.origin !== base.origin ||
      !location.pathname.startsWith(base.pathname)
    )
      return null;
    const relative = location.pathname
      .slice(base.pathname.length)
      .replace(/(^|\/)index\.html$/, "$1")
      .replace(/\/$/, "");
    if (!relative) return "home";
    for (const [key, path] of Object.entries(pages))
      if (path === relative) return key;
    return address(relative) ? relative : null;
  }
  function safeTitle(value) {
    return typeof value === "string"
      ? value
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim()
          .slice(0, 180)
      : "";
  }
  function validRecords(list, limit) {
    const seen = new Set(),
      rows = [];
    for (const row of Array.isArray(list) ? list : []) {
      if (
        row &&
        address(row.key) &&
        safeTitle(row.name) &&
        !seen.has(row.key)
      ) {
        rows.push({ key: row.key, name: safeTitle(row.name) });
        seen.add(row.key);
        if (rows.length === limit) break;
      }
    }
    return rows;
  }
  let state = empty(),
    storageAvailable = true;
  function load() {
    if (!storageAvailable) return state;
    try {
      const serialized = localStorage.getItem(storageKey);
      if (!serialized) return empty();
      const data = JSON.parse(serialized);
      return {
        saved: validRecords(data?.saved, MAX_SAVED),
        history: validRecords(data?.history, MAX_HISTORY),
      };
    } catch {
      return state;
    }
  }
  function modify(change) {
    state = load();
    change(state);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    const control = element("button", text);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }
  function link(row) {
    const a = element("a", row.name);
    a.href = address(row.key).href;
    return a;
  }
  function init() {
    const opener = document.getElementById("workspace-open");
    if (!opener) return;
    const activeKey = currentPage();
    const title =
      safeTitle(document.title.replace(/\s+·\s+Integration Atlas$/, "")) ||
      "Current page";
    state = load();
    if (activeKey?.includes("/"))
      modify((data) => {
        data.history = [
          { key: activeKey, name: title },
          ...data.history.filter((item) => item.key !== activeKey),
        ].slice(0, MAX_HISTORY);
      });
    const dialog = element("dialog");
    dialog.id = "atlas-workspace";
    dialog.setAttribute("aria-labelledby", "workspace-title");
    dialog.innerHTML = `<div class="ws-head"><div><h2 id="workspace-title">Reading workspace</h2><p>Find a guide or pick up where you left off.</p></div><button type="button" id="ws-close">Close</button></div>
      <section aria-labelledby="ws-find-title"><h3 id="ws-find-title">Go to an integration</h3><div class="ws-query"><label for="ws-query">Integration name or domain<input id="ws-query" type="search" autocomplete="off"></label><label for="ws-route">Open as<select id="ws-route"><option value="integrations">Guide</option><option value="discover">Overview</option><option value="references">Reference</option></select></label></div>
      <p id="ws-found" role="status"></p><ul id="ws-results" class="ws-results"></ul></section>
      <section aria-labelledby="ws-saved-title"><h3 id="ws-saved-title">Saved pages</h3><form id="ws-save"><label for="ws-name">Name for this page<input id="ws-name" maxlength="180" required></label><button type="submit">Save page</button></form><div id="ws-saved"></div></section>
      <section aria-labelledby="ws-history-title"><h3 id="ws-history-title">Reading history</h3><div id="ws-resume"></div><div id="ws-history"></div></section>
      <p id="ws-status" role="status"></p>`;
    document.body.append(dialog);
    const el = (name) => dialog.querySelector("#ws-" + name);
    let originator, index, loading;
    const status = (message) => {
      el("status").textContent = [
        message,
        storageAvailable
          ? ""
          : "Browser storage is unavailable. Changes last for this page.",
      ]
        .filter(Boolean)
        .join(" ");
    };
    function download(kind, rows) {
      const payload = {
        schemaVersion: 1,
        collection: kind,
        pages: rows.map((row) => ({ title: row.name, page: row.key })),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const a = element("a");
      a.href = url;
      a.download = "integration-atlas-" + kind + ".json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status("Export prepared.");
    }
    function drawCollection(kind) {
      const target = el(kind),
        rows = state[kind],
        noun = kind === "saved" ? "saved pages" : "reading history";
      target.replaceChildren();
      if (!rows.length) {
        target.append(
          element(
            "p",
            kind === "saved"
              ? "Save a page to find it here."
              : "Opened integration pages will appear here.",
          ),
        );
        return;
      }
      const toolbar = element("div", undefined, "ws-toolbar");
      const clear = button("Clear all", () => {
        const prompt = element("div", undefined, "ws-confirm");
        prompt.append(element("span", "Clear all " + noun + "?"));
        const cancel = button("Cancel", () => {
          prompt.replaceWith(toolbar);
          clear.focus();
        });
        const confirm = button("Confirm clear", () => {
          modify((data) => {
            data[kind] = [];
          });
          draw();
          status("Cleared " + noun + ".");
          el(kind === "saved" ? "name" : "query").focus();
        });
        prompt.append(cancel, confirm);
        toolbar.replaceWith(prompt);
        cancel.focus();
      });
      toolbar.append(
        element(
          "span",
          String(rows.length) + (rows.length === 1 ? " page" : " pages"),
        ),
        button("Export all", () => download(kind, rows)),
        clear,
      );
      const list = element("ul", undefined, "ws-list");
      rows.forEach((row, i) => {
        const item = element("li");
        const details = element("div", undefined, "ws-page");
        details.append(link(row), element("small", row.key));
        const actions = element("div", undefined, "ws-row-actions");
        const exportOne = button("Export", () => download(kind, [row]));
        const forget = button("Remove", () => {
          modify((data) => {
            data[kind] = data[kind].filter((other) => other.key !== row.key);
          });
          draw();
          status("Removed " + row.name + ".");
          const remaining = el(kind).querySelectorAll(".ws-list a");
          (
            remaining[Math.min(i, remaining.length - 1)] ||
            el(kind === "saved" ? "name" : "query")
          ).focus();
        });
        exportOne.setAttribute("aria-label", "Export " + row.name);
        forget.setAttribute("aria-label", "Remove " + row.name);
        actions.append(exportOne, forget);
        item.append(details, actions);
        list.append(item);
      });
      target.append(toolbar, list);
    }
    function draw() {
      el("save").hidden = !activeKey;
      el("name").value =
        state.saved.find((row) => row.key === activeKey)?.name || title;
      const last = state.history.find((item) => item.key !== activeKey);
      const resume = el("resume");
      resume.replaceChildren();
      if (last) {
        const resumeLink = link(last);
        resumeLink.textContent = "Return to " + last.name;
        resume.append(resumeLink);
      }
      drawCollection("saved");
      drawCollection("history");
    }
    function lookupStatus(english, cantonese) {
      const found = el("found");
      found.dataset.readerCantonese = cantonese;
      found.textContent = english;
    }
    function search() {
      const query = el("query").value.trim().toLocaleLowerCase();
      el("results").replaceChildren();
      if (!index) return;
      if (!query) {
        const count = index.length.toLocaleString();
        lookupStatus(
          "Type to search " + count + " integrations.",
          "輸入名稱就可以搜尋 " + count + " 個整合。",
        );
        return;
      }
      const matches = index.filter(
        (row) =>
          row[0].includes(query) || row[1].toLocaleLowerCase().includes(query),
      );
      matches.sort((a, b) => Number(b[0] === query) - Number(a[0] === query));
      for (const [domain, name] of matches.slice(0, 12)) {
        const item = element("li"),
          a = link({ key: el("route").value + "/" + domain, name });
        a.append(element("small", domain));
        item.append(a);
        el("results").append(item);
      }
      const count = matches.length.toLocaleString();
      if (matches.length > 12) {
        lookupStatus("Showing 12 of " + count + " matches", "共搵到 " + count + " 個結果，顯示頭 12 個。");
      } else if (matches.length) {
        lookupStatus(count + (matches.length === 1 ? " match" : " matches"), "搵到 " + count + " 個結果。");
      } else {
        lookupStatus("No matching integrations.", "搵唔到符合條件嘅整合。");
      }
    }
    async function ensureIndex() {
      if (index) {
        search();
        return;
      }
      if (loading) return;
      lookupStatus("Loading integration names…", "載入緊整合名稱…");
      loading = true;
      try {
        const response = await fetch(new URL("lookup.json", base), {
          redirect: "error",
          mode: "same-origin",
        });
        if (!response.ok) throw Error("Catalog unavailable");
        const data = await response.json();
        if (!Array.isArray(data)) throw Error("Invalid catalog");
        index = data.filter(
          (row) =>
            Array.isArray(row) &&
            typeof row[0] === "string" &&
            safeDomain.test(row[0]) &&
            typeof row[1] === "string",
        );
        search();
      } catch {
        lookupStatus(
          "Integration search is unavailable. Reopen the workspace to retry.",
          "暫時用唔到整合搜尋。請重新開啟閱讀工作區再試。",
        );
      } finally {
        loading = false;
      }
    }
    function open() {
      if (dialog.open || document.querySelector("dialog[open]")) return;
      originator = document.activeElement;
      state = load();
      draw();
      status("");
      dialog.showModal();
      el("query").focus();
      ensureIndex();
    }
    opener.setAttribute("aria-controls", dialog.id);
    opener.setAttribute("aria-haspopup", "dialog");
    opener.setAttribute("aria-keyshortcuts", "Control+k Meta+k");
    opener.title = "Reading workspace (Ctrl+K or ⌘K)";
    opener.addEventListener("click", open);
    el("close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () =>
      (originator instanceof HTMLElement &&
      originator !== document.body &&
      originator.isConnected
        ? originator
        : opener
      ).focus(),
    );
    document.addEventListener("keydown", (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input,textarea,select,[contenteditable]:not([contenteditable=false])",
        )
      )
        return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      open();
    });
    el("query").addEventListener("input", search);
    el("route").addEventListener("change", search);
    el("query").addEventListener("keydown", (event) => {
      if (event.isComposing || !["ArrowDown", "Enter"].includes(event.key))
        return;
      const first = el("results").querySelector("a");
      if (first) {
        event.preventDefault();
        if (event.key === "Enter") first.click();
        else first.focus();
      }
    });
    el("results").addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
      const links = [...el("results").querySelectorAll("a")];
      const i = links.indexOf(event.target);
      if (i < 0) return;
      event.preventDefault();
      (event.key === "ArrowUp" && i === 0
        ? el("query")
        : links[
            Math.min(links.length - 1, i + (event.key === "ArrowDown" ? 1 : -1))
          ]
      ).focus();
    });
    el("save").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = safeTitle(el("name").value);
      if (!name || !activeKey) {
        status("Enter a name to save this page.");
        return;
      }
      let full = false;
      modify((data) => {
        full =
          data.saved.length >= MAX_SAVED &&
          !data.saved.some((row) => row.key === activeKey);
        if (!full)
          data.saved = [
            { key: activeKey, name },
            ...data.saved.filter((row) => row.key !== activeKey),
          ];
      });
      if (!full) draw();
      status(
        full
          ? "Saved page limit reached. Remove a page before saving another."
          : "Saved " + name + ".",
      );
    });
    window.addEventListener("storage", (event) => {
      if (!dialog.open || (event.key !== storageKey && event.key !== null))
        return;
      const draft = el("name").value;
      state = load();
      draw();
      el("name").value = draft;
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
