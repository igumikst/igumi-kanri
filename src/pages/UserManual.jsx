import { useState } from "react";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function UserManual({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, cos, tks, finFiles, tmplFiles, tileConf }) {
  const [tab, setTab] = useState("start");
  const pending = (tks || []).filter(t => !t.done);

  const s = {
    wrap: { fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp },
    inner: { maxWidth: 800, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" },
    title: { fontSize: isPC ? 24 : 20, fontWeight: 800, color: "#1A3A5C", marginBottom: 8 },
    subtitle: { fontSize: 13, color: "#64748B", marginBottom: 24 },
    tabs: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
    tab: (active) => ({ padding: "8px 16px", borderRadius: 8, border: "none", background: active ? "#1A3A5C" : "#E2E8F0", color: active ? "#fff" : "#475569", fontWeight: 700, cursor: "pointer", fontSize: 13 }),
    card: { background: "#fff", borderRadius: 14, padding: isPC ? 24 : 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
    sectionTitle: { fontSize: 16, fontWeight: 800, color: "#1A3A5C", marginBottom: 14, borderBottom: "2px solid #E0F2FE", paddingBottom: 8 },
    flowStep: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 },
    stepNum: { width: 28, height: 28, borderRadius: "50%", background: "#1A3A5C", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0, marginTop: 2 },
    tip: { background: "#EFF6FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 13, color: "#0369A1" },
    warn: { background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 13, color: "#92400E" },
    featureCard: { background: "#F8FAFC", borderRadius: 10, padding: 16, marginBottom: 10, border: "1px solid #E2E8F0" },
    featureTitle: { fontWeight: 700, fontSize: 15, color: "#1A3A5C", marginBottom: 6 },
    featureDesc: { fontSize: 13, color: "#374151", lineHeight: 1.7 },
  };

  return (
    <div style={s.wrap}>
      {isPC && <PCSidebar nav={nav} page="usermanual" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} />}

      <div style={s.inner}>
        <div style={s.title}>📗 使い方マニュアル</div>
        <div style={s.subtitle}>株式会社IGUMI｜社員向け IGUMI管理システム 操作ガイド</div>

        <div style={s.tabs}>
          {[
            { id: "start", label: "🚀 はじめに" },
            { id: "line", label: "📱 LINE通知" },
            { id: "calls", label: "📞 電話受付" },
            { id: "projects", label: "📋 案件管理" },
            { id: "tasks", label: "✅ タスク" },
            { id: "features", label: "🔧 その他機能" },
          ].map(t => (
            <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* ── はじめに ── */}
        {tab === "start" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>IGUMI管理システムとは？</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, marginBottom: 16 }}>
              IGUMIの仕事をスムーズにするための社内ツールです。電話が来たら自動でLINEに通知が届き、案件の管理・タスク・見積書作成・掲示板など、仕事に必要なことがひとつのアプリで完結します。
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isPC ? "1fr 1fr" : "1fr", gap: 10 }}>
              {[
                ["📞", "電話が来たら自動でLINEに通知"],
                ["📋", "案件を一覧で管理・担当者アサイン"],
                ["✅", "タスクを登録して抜け漏れ防止"],
                ["📝", "見積書を816品目から作成"],
                ["📌", "社内掲示板でお知らせ共有"],
                ["🗃", "財務書類を一元管理"],
                ["📊", "工事写真報告書を自動作成"],
                ["🎣", "釣り情報・天気チェック"],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 10, padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, fontSize: 13, color: "#374151", alignItems: "center" }}>
                  <span style={{ fontSize: 20 }}>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>アプリへのアクセス方法</div>
            <div style={s.tip}>💡 スマホのホーム画面にアイコンを追加すると、アプリのように使えます！</div>
            <div style={s.flowStep}>
              <div style={s.stepNum}>1</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 4 }}>URLにアクセス</div>
                <div style={{ fontSize: 13, color: "#374151" }}>ブラウザで <strong>https://igumi-kanri.vercel.app</strong> を開く</div>
              </div>
            </div>
            <div style={s.flowStep}>
              <div style={s.stepNum}>2</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 4 }}>iPhoneの場合</div>
                <div style={{ fontSize: 13, color: "#374151" }}>Safariで開く → 下の共有ボタン（□↑）→「ホーム画面に追加」</div>
              </div>
            </div>
            <div style={s.flowStep}>
              <div style={s.stepNum}>3</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 4 }}>Androidの場合</div>
                <div style={{ fontSize: 13, color: "#374151" }}>Chromeで開く → 右上メニュー → 「ホーム画面に追加」</div>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>画面の見方（PC版）</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              左側：メニュー（各機能に移動）<br />
              中央：メインコンテンツ<br />
              右側：今日の状況・タスク一覧・AIアシスタント
            </div>
          </div>
        </>}

        {/* ── LINE通知 ── */}
        {tab === "line" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>LINE通知に登録する方法</div>
            <div style={s.tip}>📱 登録するとIGUMIに電話が来たとき、自動でLINEに通知が届きます！</div>
            <div style={s.flowStep}>
              <div style={s.stepNum}>1</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 4 }}>IGUMI管理Botを友だち追加</div>
                <div style={{ fontSize: 13, color: "#374151" }}>LINEで「IGUMI管理」を検索して友だち追加、またはQRコードで追加</div>
              </div>
            </div>
            <div style={s.flowStep}>
              <div style={s.stepNum}>2</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 4 }}>名前をフルネームで送る</div>
                <div style={{ fontSize: 13, color: "#374151" }}>BotのトークにLINEで自分のフルネームを送信<br />例：<strong>崎岡 ○○</strong></div>
              </div>
            </div>
            <div style={s.flowStep}>
              <div style={s.stepNum}>3</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 4 }}>登録完了！</div>
                <div style={{ fontSize: 13, color: "#374151" }}>「✅ 〇〇さんを通知スタッフに登録しました！」とメッセージが届いたら完了</div>
              </div>
            </div>
            <div style={s.warn}>⚠️ このBotは通知専用です。メッセージを送っても返信は確認できません。案件の対応はIGUMIアプリから行ってください。</div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>通知が届いたら</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, marginBottom: 12 }}>
              通知にはこんな情報が届きます👇
            </div>
            <div style={{ background: "#F0F4F8", borderRadius: 10, padding: 16, fontFamily: "monospace", fontSize: 12, color: "#1F2937", lineHeight: 2 }}>
              【IGUMI】新規案件が入電しました<br /><br />
              📋 案件番号：TEL-20260620-001<br />
              🏢 管理会社：〇〇管理<br />
              👤 担当者：山田様<br />
              📞 折返し先：090-XXXX-XXXX<br />
              🏠 物件：〇〇マンション 101号室<br />
              ⚡ 緊急度：通常<br />
              📝 用件：水漏れの相談<br /><br />
              🔗 案件詳細：https://igumi-kanri.vercel.app/calls
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>
              リンクをタップするとIGUMIアプリの電話受付ページが開きます。
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>名前を変更したい場合</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              IGUMI管理BotのトークにLINEで新しい名前を送るだけで自動的に更新されます。
            </div>
          </div>
        </>}

        {/* ── 電話受付 ── */}
        {tab === "calls" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>電話受付の仕組み</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, marginBottom: 12 }}>
              会社の固定電話に電話が来て3コール応答しないと、自動でIGUMIのシステムに転送されます。AIが電話を取って録音し、内容をテキスト化してLINEに通知します。
            </div>
            {[
              "固定電話が3コール鳴る",
              "自動で転送・AIが「はい、株式会社いぐみです」と応答",
              "電話主がメッセージを録音",
              "AIが内容を自動解析",
              "担当スタッフのLINEに通知が届く",
              "IGUMIアプリの電話受付ページに案件が登録される",
            ].map((step, i) => (
              <div key={i} style={s.flowStep}>
                <div style={s.stepNum}>{i + 1}</div>
                <div style={{ fontSize: 13, color: "#374151", paddingTop: 4 }}>{step}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>電話受付ページの使い方</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「📞 電話受付」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>案件一覧</div>
              <div style={s.featureDesc}>「未対応」「対応中」「完了」でフィルタリングできます。タグでも絞り込み可能。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>案件詳細を開く</div>
              <div style={s.featureDesc}>案件カードをタップすると詳細が表示されます。録音も再生できます。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>ステータスを変更する</div>
              <div style={s.featureDesc}>詳細画面の「未対応 → 対応中 → 完了」ボタンでステータスを変更できます。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>担当者を設定する</div>
              <div style={s.featureDesc}>詳細画面の「対応者」から担当者名をタップして設定します。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>折返し電話をする</div>
              <div style={s.featureDesc}>詳細画面の下にある「📞 折返し電話をする」ボタンをタップすると、すぐに発信できます。</div>
            </div>
          </div>

          <div style={s.tip}>💡 AIが自動で情報を抽出しますが、会社名や物件名が「不明」になることもあります。その場合は録音を再生して内容を確認してください。</div>
        </>}

        {/* ── 案件管理 ── */}
        {tab === "projects" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>工事案件の管理</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「📋 案件管理」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>新しい案件を登録する</div>
              <div style={s.featureDesc}>右上の「＋ 新規案件」ボタンから登録。工事名・金額・担当者・ステータスを入力します。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>ステータスを更新する</div>
              <div style={s.featureDesc}>「発注待ち→見積中→着工→進行中→完了」の流れで更新します。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>金額・粗利を管理する</div>
              <div style={s.featureDesc}>受注金額・粗利を入力すると、分析ページで自動集計されます。</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>取引先・協力業者の管理</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「🏢 取引先・協力業者」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>会社情報を登録する</div>
              <div style={s.featureDesc}>会社名・担当者・連絡先・種別（取引先/協力業者/その他）を登録できます。</div>
            </div>
          </div>
        </>}

        {/* ── タスク ── */}
        {tab === "tasks" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>タスク管理の使い方</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「✅ タスク」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>タスクを追加する</div>
              <div style={s.featureDesc}>「＋ 新規タスク」からタスク名・優先度（高/中/低）・期限・担当者を入力します。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>完了にする</div>
              <div style={s.featureDesc}>タスクのチェックボックスをタップすると完了になります。右パネルの「直近タスク」からも確認できます。</div>
            </div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>優先度で色分け</div>
              <div style={s.featureDesc}>赤＝高優先度、黄＝中優先度、緑＝低優先度で表示されます。</div>
            </div>
          </div>
        </>}

        {/* ── その他機能 ── */}
        {tab === "features" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>見積書作成ツール</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「📝 見積書作成」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>使い方</div>
              <div style={s.featureDesc}>
                1. 大カテゴリを選んで追加する<br />
                2. 細項目を選んで数量・単価を入力<br />
                3. 「Excelで出力」ボタンで見積書を生成<br />
                ※816品目の中から選択できます
              </div>
            </div>
            <div style={s.warn}>⚠️ 内部原価（掛け率・卸値など）は自動的に除外されます。お客様に見せても安心です。</div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>工事写真報告書作成ツール</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「📋 報告書作成」から開く（別ページで開きます）</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>使い方</div>
              <div style={s.featureDesc}>
                1. 報告書タイプを選択（通常/多摩/ユニオン）<br />
                2. 基本情報（工事名・日付・担当者）を入力<br />
                3. 写真を選択してアップロード<br />
                4. 「Excelで出力」ボタンでダウンロード
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>社内掲示板</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「📌 社内掲示板」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>投稿する</div>
              <div style={s.featureDesc}>「＋ 新規投稿」からカテゴリ・内容を入力して投稿できます。コメントの返信も可能です。</div>
            </div>
            <div style={s.tip}>💡 ホーム画面に最新3件が表示されます。</div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>財務・書類管理</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「🗃 財務・書類管理」から開く（パスワードロックあり）</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>ファイルのアップロード</div>
              <div style={s.featureDesc}>請求書・領収書・発注書などをフォルダごとに整理してアップロードできます。</div>
            </div>
            <div style={s.tip}>💡 パスワードがわからない場合は虎生（崎岡）に確認してください。</div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>釣り情報</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「🎣 釣り情報」から開く</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>天気・波・風</div>
              <div style={s.featureDesc}>横須賀・外房（勝浦）の天気・波高・風速をリアルタイムで確認できます。新勝丸・第三新生合同丸の釣果もリンクから確認できます。</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>AIアシスタント</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>左メニューの「🤖 AIアシスタント」または右パネルから</div>
            <div style={s.featureCard}>
              <div style={s.featureTitle}>使い方</div>
              <div style={s.featureDesc}>仕事の相談・文書作成・計算・調べ物など、なんでも聞けます。右パネルの入力欄から素早くアクセスできます。</div>
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
