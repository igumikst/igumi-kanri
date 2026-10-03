/** Android Chrome / PWA で tel: 発信後などに白画面になる問題の復帰処理 */

const TEL_FLAG = "igumi_left_for_tel";
const PAGE_KEY = "igumi_resume_page";
const CALL_KEY = "igumi_resume_call_id";

// StrictMode の二重初期化でも値が消えないようにメモリキャッシュ
let cachedResumePage;
let cachedResumeCallId;

export function markLeavingForTel(page, callId) {
  try {
    sessionStorage.setItem(TEL_FLAG, String(Date.now()));
    if (page) sessionStorage.setItem(PAGE_KEY, page);
    if (callId) sessionStorage.setItem(CALL_KEY, String(callId));
    cachedResumePage = page || null;
    cachedResumeCallId = callId ? String(callId) : null;
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeResumePage() {
  if (cachedResumePage !== undefined) {
    const v = cachedResumePage;
    cachedResumePage = null;
    return v;
  }
  try {
    const page = sessionStorage.getItem(PAGE_KEY);
    sessionStorage.removeItem(PAGE_KEY);
    cachedResumePage = null;
    return page;
  } catch {
    cachedResumePage = null;
    return null;
  }
}

export function consumeResumeCallId() {
  if (cachedResumeCallId !== undefined) {
    const v = cachedResumeCallId;
    cachedResumeCallId = null;
    return v;
  }
  try {
    const callId = sessionStorage.getItem(CALL_KEY);
    sessionStorage.removeItem(CALL_KEY);
    cachedResumeCallId = null;
    return callId;
  } catch {
    cachedResumeCallId = null;
    return null;
  }
}

export function consumeResumeState() {
  return { page: consumeResumePage(), callId: consumeResumeCallId() };
}

function rootLooksEmpty() {
  const root = document.getElementById("root");
  if (!root) return true;
  if (root.childElementCount === 0) return true;
  const rect = root.getBoundingClientRect();
  return rect.width === 0 || rect.height === 0;
}

function consumeTelFlag() {
  try {
    const raw = sessionStorage.getItem(TEL_FLAG);
    if (!raw) return false;
    sessionStorage.removeItem(TEL_FLAG);
    const leftAt = Number(raw);
    if (!Number.isFinite(leftAt)) return true;
    return Date.now() - leftAt < 30 * 60 * 1000;
  } catch {
    return false;
  }
}

export function installAndroidResumeGuard() {
  let hiddenAt = 0;
  let bootChecked = false;

  const recover = (reason) => {
    try {
      if (sessionStorage.getItem("igumi_recovering") === "1") return;
      sessionStorage.setItem("igumi_recovering", "1");
    } catch {
      /* continue */
    }
    console.warn("[androidResume] reloading:", reason);
    window.location.reload();
  };

  // 初回 pageshow 時点では React 未マウントで root が空なのが正常。
  // bfcache 復帰、または tel: 発信からの復帰のみ即リロードする。
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      recover("bfcache");
      return;
    }
    if (rootLooksEmpty() && consumeTelFlag()) {
      recover("empty-root-pageshow-tel");
    }
  });

  // 起動後しばらく空のままなら（描画失敗）一度だけ復帰を試みる
  window.setTimeout(() => {
    if (bootChecked) return;
    bootChecked = true;
    if (rootLooksEmpty()) recover("empty-root-boot");
  }, 4000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (document.visibilityState !== "visible") return;

    const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
    // ダイヤル起動時の一瞬の hidden フリッカーは無視
    if (awayMs < 500) return;

    if (rootLooksEmpty()) {
      recover("empty-root-visible");
      return;
    }
    if (consumeTelFlag()) {
      // tel: 復帰後に描画が壊れる Android 向け。page/callId は sessionStorage に残してリロード復元
      recover("return-from-tel");
    }
  });

  try {
    sessionStorage.removeItem("igumi_recovering");
  } catch {
    /* ignore */
  }
}
