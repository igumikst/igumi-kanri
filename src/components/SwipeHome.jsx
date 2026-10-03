import { useEffect, useRef, useState } from "react";
import "./SwipeHome.css";

/** 画面幅が狭い（スマホ）かどうか。アプリのPC判定（768px）に合わせる */
function useIsMobile(query = "(max-width: 767px)") {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

/**
 * ホーム画面は既存のまま `home` に渡す。ダッシュボードは横スワイプで出てくる。
 * スマホのときだけスワイプ。PCは既存どおり `home` だけ（ダッシュボードはサイドバーから開く）。
 * dashboardOn: "right" = ホームの右隣（指を左に動かすと出る） / "left" = ホームの左隣（指を右に動かすと出る）
 *
 * 既存ホームは中で3画面を横にめくる。ブラウザの横スクロールと重ならないよう、
 * ホーム側の端（igumi-swipe-edge）に達したときだけ、こちらがページを送る。
 */
export default function SwipeHome({ home, dashboard, dashboardOn = "right" }) {
  const isMobile = useIsMobile();
  const ref = useRef(null);
  const touch = useRef(null);
  const [page, setPage] = useState(0);
  const homeIdx = dashboardOn === "right" ? 0 : 1;
  const dashIdx = dashboardOn === "right" ? 1 : 0;
  const panes = dashboardOn === "right" ? [home, dashboard] : [dashboard, home];

  const scrollToIndex = (i) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !isMobile) return;
    el.style.scrollBehavior = "auto";
    el.scrollLeft = homeIdx * el.clientWidth;
    el.style.scrollBehavior = "";
  }, [homeIdx, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const onEdge = (e) => {
      if (e.detail === "next" && dashboardOn === "right") scrollToIndex(dashIdx);
      if (e.detail === "prev" && dashboardOn === "left") scrollToIndex(dashIdx);
    };
    window.addEventListener("igumi-swipe-edge", onEdge);
    return () => window.removeEventListener("igumi-swipe-edge", onEdge);
  }, [isMobile, dashboardOn, dashIdx]);

  if (!isMobile) return home;
  return (
    <div className="swipehome">
      <div
        className="sh-pager"
        ref={ref}
        onScroll={(e) => {
          const w = e.currentTarget.clientWidth;
          if (!w) return;
          setPage(Math.round(e.currentTarget.scrollLeft / w));
        }}
        onTouchStart={(e) => {
          const pane = e.target.closest?.("[data-pane]");
          touch.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            pane: pane?.getAttribute("data-pane") || "",
          };
        }}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t || t.pane !== "dash") return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
          const towardHome = dashboardOn === "right" ? dx > 0 : dx < 0;
          if (towardHome) scrollToIndex(homeIdx);
        }}
      >
        {panes.map((p, i) => (
          <section className="sh-pane" key={i} data-pane={i === dashIdx ? "dash" : "home"}>{p}</section>
        ))}
      </div>
      <div className="sh-dots">
        {panes.map((_, i) => (
          <button
            key={i}
            type="button"
            className={i === page ? "on" : ""}
            aria-label={i === homeIdx ? "ホーム" : "ダッシュボード"}
            onClick={() => scrollToIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
