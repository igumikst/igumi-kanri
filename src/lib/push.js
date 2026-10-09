// ウェブプッシュ通知の土台(第8弾テーマ26-2)。
// この段階ではサービスワーカーの登録・通知許可・ローカルでのテスト表示のみを行う。
// サーバーへのsubscribe送信・DB保存は次のステップ(26-3)で行う。

// 次のステップ(26-3)でpushManager.subscribe()に使う予定。今回はまだ使用しない。
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// iOS Safariは、ホーム画面に追加してそこから起動した状態(standalone)でないと
// 通知の許可自体が求められない(iOS/iPadOS 16.4以降)。
export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

export function isStandaloneDisplay() {
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  return navigator.standalone === true;
}

export function getIosHint() {
  if (isIos() && !isStandaloneDisplay()) {
    return "iPhoneでは、ホーム画面に追加したアイコンから開いた場合のみ通知を使えます。Safariのタブのままでは通知を有効にできません。";
  }
  return "";
}

// "unsupported" | "default"(未許可) | "granted"(許可済み) | "denied"(拒否)
export function getPermissionState() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js");
}

export async function requestPermissionAndRegister() {
  if (!isPushSupported()) {
    throw new Error("このブラウザまたは端末はプッシュ通知に対応していません");
  }

  // iOSの仕様上、requestPermission()はユーザー操作(クリック)から間を置かずに
  // 呼び出す必要があるため、他のawaitより先に呼ぶ。
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("通知が許可されませんでした(ブラウザの設定で拒否されています)");
  }

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  return registration;
}

export async function showTestNotification() {
  if (!isPushSupported()) {
    throw new Error("このブラウザまたは端末はプッシュ通知に対応していません");
  }
  if (Notification.permission !== "granted") {
    throw new Error("先に通知を有効にしてください");
  }

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification("テスト通知", {
    body: "この通知が表示されていれば、プッシュ通知の土台は正常に動いています。",
    icon: "/logo192.png",
    badge: "/logo192.png",
    data: { url: "/" },
  });
}
