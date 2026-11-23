(function () {
  const tabs = Array.from(document.querySelectorAll("[data-deploy-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-deploy-panel]"));
  const hint = document.getElementById("deploy-hint");
  const labels = {
    windows: "Windows",
    docker: "NAS / Docker",
    macos: "macOS",
    linux: "Linux",
    npm: "开发者",
  };
  const hashMap = {
    windows: "windows",
    docker: "docker",
    nas: "docker",
    macos: "macos",
    linux: "linux",
    npm: "npm",
  };

  function detectSystem() {
    const ua = navigator.userAgent || "";
    const platform =
      (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";

    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Mac OS X|Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
    if (/CrOS/i.test(ua)) return "linux";
    if (/Linux/i.test(ua)) return "linux";
    if (/Windows/i.test(ua)) return "windows";
    if (/Mac/i.test(platform) && navigator.maxTouchPoints > 1) return "ios";
    if (/Mac/i.test(platform)) return "macos";
    if (/Linux/i.test(platform)) return "linux";
    if (/^Win/i.test(platform)) return "windows";
    return "unknown";
  }

  const recommendedTab = {
    windows: "windows",
    macos: "macos",
    linux: "docker",
    android: "docker",
    ios: "docker",
    unknown: "docker",
  };
  const systemLabels = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
    android: "手机",
    ios: "手机",
    unknown: "当前设备",
  };

  function setHint(text) {
    if (hint) hint.textContent = text;
  }

  function activate(key, options) {
    const settings = options || {};
    const nextTab = tabs.find((tab) => tab.dataset.deployTab === key) || tabs[0];
    if (!nextTab) return;
    const activeKey = nextTab.dataset.deployTab;

    tabs.forEach((tab) => {
      const active = tab === nextTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    panels.forEach((panel) => {
      const active = panel.dataset.deployPanel === activeKey;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (settings.focus) nextTab.focus();
    return activeKey;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = activate(tab.dataset.deployTab);
      if (key) {
        history.replaceState(null, "", "#" + key);
        setHint("已选择「" + labels[key] + "」，按步骤操作即可。");
      }
    });

    tab.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(tab);
      let next = null;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      const key = activate(tabs[next].dataset.deployTab, { focus: true });
      if (key) {
        history.replaceState(null, "", "#" + key);
        setHint("已选择「" + labels[key] + "」，按步骤操作即可。");
      }
    });
  });

  function activateFromHash() {
    const hash = location.hash.replace(/^#/, "");
    if (hash === "nas-compose-details") {
      const details = document.getElementById("nas-compose-details");
      if (details) details.open = true;
    }
    const key = hashMap[hash];
    if (!key) return false;
    const activeKey = activate(key);
    if (activeKey) setHint("已打开「" + labels[activeKey] + "」，按步骤操作即可。");
    return true;
  }

  const system = detectSystem();
  document.documentElement.dataset.os = system;
  if (!activateFromHash()) {
    const key = recommendedTab[system] || "docker";
    activate(key);
    if (system === "unknown") {
      setHint("不确定选哪个？Windows 用安装包，NAS / 服务器用 Docker。");
    } else {
      setHint("检测到 " + (systemLabels[system] || system) + "，已为你选中「" + labels[key] + "」。也可以切换其他方式。");
    }
  }

  window.addEventListener("hashchange", activateFromHash);

  document.querySelectorAll('a[href="#nas-compose-details"]').forEach((link) => {
    link.addEventListener("click", () => {
      const details = document.getElementById("nas-compose-details");
      if (details) details.open = true;
    });
  });

  function randomBase64(bytes) {
    const data = new Uint8Array(bytes);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(data);
    } else {
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.floor(Math.random() * 256);
      }
    }
    let binary = "";
    data.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return btoa(binary);
  }

  const generateButton = document.querySelector("[data-generate-secrets]");
  if (generateButton) {
    generateButton.addEventListener("click", () => {
      const appKey = document.getElementById("generated-app-key");
      const authKey = document.getElementById("generated-auth-key");
      if (appKey) appKey.textContent = randomBase64(32);
      if (authKey) authKey.textContent = randomBase64(32);
      const original = generateButton.textContent;
      generateButton.textContent = "已生成，点右侧复制";
      window.setTimeout(() => {
        generateButton.textContent = original;
      }, 1800);
    });
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // fall through to execCommand
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("copy failed");
  }

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const original = button.textContent;
      try {
        await copyText(target.textContent.trim());
        button.textContent = "已复制";
      } catch {
        button.textContent = "复制失败";
      }
      window.setTimeout(() => {
        button.textContent = original;
      }, 1600);
    });
  });
})();
