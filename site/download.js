(function () {
  const EXE =
    "https://github.com/haikuotianko/free-welfare/releases/download/v0.1.0/Free-Welfare-Setup-0.1.0.exe";

  const recommendations = {
    windows: {
      os: "Windows",
      title: "Windows 安装包",
      desc: "下载 exe 后双击安装；自带 Node 22，首次启动自动下载内置 PostgreSQL，不需要 Docker。",
      action: "下载 Windows 安装包",
      href: EXE,
      alt: "或查看 Docker / NAS 方式",
      altHref: "#docker",
      method: "windows",
    },
    macos: {
      os: "macOS",
      title: "macOS 双击启动",
      desc: "需要 Node.js 22+。双击 deploy/macos/start.command，首次运行会自动安装依赖和内置 PostgreSQL。",
      action: "查看 macOS 步骤",
      href: "#macos",
      alt: "或使用 Docker Compose",
      altHref: "#docker",
      method: "macos",
    },
    linux: {
      os: "Linux",
      title: "Linux 推荐 Docker Compose",
      desc: "服务器推荐 Docker，一条命令带 PostgreSQL / API / Worker / Caddy；已有 Node 22 也可以用 Linux 原生脚本。",
      action: "查看 Docker 步骤",
      href: "#docker",
      alt: "使用 Linux 原生脚本",
      altHref: "#linux",
      method: "docker",
    },
    android: {
      os: "Android",
      title: "手机 / 平板访问",
      desc: "手机端不需要安装桌面程序；把平台部署到电脑或 NAS，再用手机浏览器访问。",
      action: "查看 Docker / NAS 方式",
      href: "#docker",
      alt: "查看 NAS 方式",
      altHref: "#nas",
      method: "docker",
    },
    ios: {
      os: "iPhone / iPad",
      title: "手机 / 平板访问",
      desc: "手机端不需要安装桌面程序；把平台部署到电脑或 NAS，再用手机浏览器访问。",
      action: "查看 Docker / NAS 方式",
      href: "#docker",
      alt: "查看 NAS 方式",
      altHref: "#nas",
      method: "docker",
    },
    unknown: {
      os: "当前设备",
      title: "选择适合你的安装方式",
      desc: "Windows 推荐安装包；macOS / Linux 可用脚本或 Docker；NAS 用 Docker Compose。",
      action: "查看全部方式",
      href: "#methods",
      alt: "直接看 Docker",
      altHref: "#docker",
      method: "docker",
    },
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

  function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  function applyRecommendation() {
    const key = detectSystem();
    const recommendation = recommendations[key] || recommendations.unknown;

    setText("reco-os", recommendation.os);
    setText("reco-title", recommendation.title);
    setText("reco-desc", recommendation.desc);

    const action = document.getElementById("reco-action");
    if (action) {
      action.href = recommendation.href;
      action.textContent = recommendation.action;
    }

    const alt = document.getElementById("reco-alt");
    if (alt) {
      alt.href = recommendation.altHref;
      alt.textContent = recommendation.alt;
    }

    document.querySelectorAll(".method-card").forEach((card) => {
      card.classList.toggle("is-recommended", card.dataset.method === recommendation.method);
    });

    document.documentElement.dataset.os = key;
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

  function bindCopyButtons() {
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
  }

  applyRecommendation();
  bindCopyButtons();
})();
