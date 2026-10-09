// ウェブプッシュ通知の土台(第8弾テーマ26-2・26-3)。
// サービスワーカーの登録・通知許可・ローカルでのテスト表示に加え、
// 端末の登録(api/push-subscribe.js への送信)・登録状態の確認を行う。
// 登録はセルフサービスで誰でもできるが、サーバー側で必ずenabled=falseで保存され、
// 管理者がONにするまで通知は届かない(push_subscriptionsはanonから直接触れない設計)。

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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 端末の判別用ラベル(管理者の一覧で「誰のどの端末か」が分かるようにするための参考情報)
export function getDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/ipad/i.test(ua)) return "iPad";
  if (/iphone|ipod/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android";
  if (/macintosh/i.test(ua)) return "PC(Mac)";
  if (/windows/i.test(ua)) return "PC(Windows)";
  return "PC";
}

async function getOrCreateSubscription(registration) {
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    if (!VAPID_PUBLIC_KEY) {
      throw new Error("通知の設定(VAPID公開鍵)が未設定です");
    }
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub;
}

// 通知の許可・サービスワーカー登録・購読(subscribe)・サーバーへの登録を一気に行う。
// サーバー側は必ずenabled=falseで保存するため、ここでONにはならない。
export async function registerForPush(staffName) {
  if (!staffName) {
    throw new Error("お名前を選んでください");
  }

  const registration = await requestPermissionAndRegister();
  const sub = await getOrCreateSubscription(registration);

  const res = await fetch("/api/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64Url(sub.getKey("p256dh")),
        auth: arrayBufferToBase64Url(sub.getKey("auth")),
      },
      staff_name: staffName,
      device_label: getDeviceLabel(),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "登録に失敗しました");
  }
  return data;
}

// この端末が登録済みか・管理者にONにされているかを確認する。
// 自分のendpointだけを問い合わせるため、パスコードは不要。
export async function checkOwnStatus() {
  if (!isPushSupported() || Notification.permission !== "granted") {
    return { registered: false, enabled: false };
  }

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return { registered: false, enabled: false };

  const sub = await registration.pushManager.getSubscription();
  if (!sub) return { registered: false, enabled: false };

  const res = await fetch("/api/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status", endpoint: sub.endpoint }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "確認に失敗しました");
  }
  return { registered: !!data.registered, enabled: !!data.enabled };
}
