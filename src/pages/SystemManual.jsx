import { useState } from "react";
import { supabase } from "../lib/supabase";
import { PCSidebar, PCRightPanel, FloatLauncher } from "../components/Layout";

export default function SystemManual({ isPC, pp, nav, rpOpen, setRpOpen, SB_W, RP_W, cust, pjs, cos, tks, finFiles, tmplFiles, tileConf }) {
  const [tab, setTab] = useState("overview");
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const pending = (tks || []).filter(t => !t.done);

  const handleUnlock = async () => {
    setPwLoading(true);
    const { data } = await supabase.from("home_settings").select("value").eq("id", "finance_password").single();
    const savedPw = data?.value?.password || null;
    if (!savedPw || pwInput === savedPw) {
      setUnlocked(true);
      setPwErr("");
    } else {
      setPwErr("パスワードが違います");
    }
    setPwLoading(false);
  };

  const s = {
    wrap: { fontFamily: "'Hiragino Sans',sans-serif", background: "#F0F4F8", minHeight: "100vh", ...pp },
    inner: { maxWidth: 800, margin: "0 auto", padding: isPC ? "32px 24px" : "16px 12px" },
    title: { fontSize: isPC ? 24 : 20, fontWeight: 800, color: "#1A3A5C", marginBottom: 8 },
    subtitle: { fontSize: 13, color: "#64748B", marginBottom: 24 },
    tabs: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
    tab: (active) => ({ padding: "8px 16px", borderRadius: 8, border: "none", background: active ? "#1A3A5C" : "#E2E8F0", color: active ? "#fff" : "#475569", fontWeight: 700, cursor: "pointer", fontSize: 13 }),
    card: { background: "#fff", borderRadius: 14, padding: isPC ? 24 : 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
    sectionTitle: { fontSize: 16, fontWeight: 800, color: "#1A3A5C", marginBottom: 14, borderBottom: "2px solid #E0F2FE", paddingBottom: 8 },
    row: { display: "flex", borderBottom: "1px solid #F1F5F9", padding: "10px 0", gap: 16 },
    label: { fontSize: 13, color: "#64748B", width: isPC ? 160 : 120, flexShrink: 0, fontWeight: 600 },
    value: { fontSize: 13, color: "#1F2937", flex: 1, wordBreak: "break-all" },
    costCard: { background: "#F8FAFC", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" },
    flowStep: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 },
    stepNum: { width: 28, height: 28, borderRadius: "50%", background: "#1A3A5C", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 },
    alertCard: (color) => ({ background: color + "10", border: `1px solid ${color}40`, borderRadius: 10, padding: 14, marginBottom: 10 }),
    code: { background: "#F1F5F9", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontFamily: "monospace", color: "#1A3A5C" },
  };

  // パスワードロック画面
  if (!unlocked) return (
    <div style={s.wrap}>
      {isPC && <PCSidebar nav={nav} page="systemmanual" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} />}
      <div style={{ ...s.inner, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 320, boxSizing: "border-box", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6, color: "#1A3A5C" }}>🔒 システムマニュアル</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>パスワードを入力してください</div>
          <input
            type="password" value={pwInput} autoFocus
            onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
            onKeyDown={e => e.key === "Enter" && handleUnlock()}
            placeholder="パスワード"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: pwErr ? "2px solid #DC2626" : "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box", marginBottom: 4, color: "#1F2937", outline: "none" }}
          />
          {pwErr && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>{pwErr}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => nav("home")} style={{ flex: 1, padding: 12, background: "#F3F4F6", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", color: "#374151" }}>戻る</button>
            <button onClick={handleUnlock} disabled={pwLoading} style={{ flex: 1, padding: 12, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
              {pwLoading ? "..." : "開く"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      {isPC && <PCSidebar nav={nav} page="systemmanual" cust={cust} SB_W={SB_W} pjs={pjs || []} cos={cos || []} pending={pending} tileConf={tileConf || []} setModal={() => {}} setEc={() => {}} />}
      {isPC && <PCRightPanel rpOpen={rpOpen} setRpOpen={setRpOpen} RP_W={RP_W} nav={nav} cust={cust} pjs={pjs || []} tks={tks || []} finFiles={finFiles || []} tmplFiles={tmplFiles || []} fishWeather={null} setAiInput={() => {}} />}
      {!isPC && <FloatLauncher nav={nav} cust={cust} links={[]} />}

      <div style={s.inner}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={s.title}>📘 システムマニュアル</div>
          <button onClick={() => setUnlocked(false)} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#64748B", cursor: "pointer", fontWeight: 700 }}>🔒 ロック</button>
        </div>
        <div style={s.subtitle}>株式会社IGUMI｜IGUMI管理システム 会社保管用ドキュメント｜最終更新：2026/06/20</div>

        <div style={s.tabs}>
          {[
            { id: "overview", label: "🏗 システム概要" },
            { id: "accounts", label: "🔑 アカウント情報" },
            { id: "flow", label: "📞 電話受付フロー" },
            { id: "cost", label: "💰 料金・コスト" },
            { id: "trouble", label: "🔧 トラブル対応" },
            { id: "dev", label: "💻 開発環境" },
          ].map(t => (
            <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === "overview" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>会社情報</div>
            {[
              ["会社名", "株式会社IGUMI"],
              ["代表取締役", "上村一揮（Ikki Uemura）"],
              ["事業内容", "緊急水道・配管・リフォーム工事等の設備管理系業務"],
              ["メール", "info@igumi-inc.jp"],
              ["会社住所", "東京都八王子市上柚木428"],
              ["登録番号", "T6021001069892"],
              ["TEL", "042（718）8848"],
            ].map(([l, v]) => (
              <div key={l} style={s.row}><div style={s.label}>{l}</div><div style={s.value}>{v}</div></div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>アプリ概要</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, marginBottom: 16 }}>
              社員全員が使う業務ダッシュボード「IGUMI管理システム」。電話の自動受付をコアに、工事管理・見積書作成・社内掲示板・財務管理・釣り情報など多機能を統合した社内プラットフォーム。
            </div>
            {[
              ["本番URL", "https://igumi-kanri.vercel.app/"],
              ["GitHubリポジトリ", "igumikst/igumi-kanri"],
              ["スタッフ", "崎岡・後藤・赤岡・上村・綱島・伊藤"],
            ].map(([l, v]) => (
              <div key={l} style={s.row}><div style={s.label}>{l}</div><div style={s.value}>{v}</div></div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>技術スタック</div>
            {[
              ["フロントエンド", "React + Vite"],
              ["データベース", "Supabase（PostgreSQL）"],
              ["デプロイ", "Vercel（Proプラン）"],
              ["電話受付", "Twilio"],
              ["音声認識", "OpenAI Whisper API"],
              ["AI解析", "Claude API（claude-sonnet-4-6）"],
              ["LINE通知", "LINE Messaging API"],
              ["帳票作成", "ExcelJS + FileSaver.js"],
              ["天気情報", "Open-Meteo API（無料）"],
            ].map(([l, v]) => (
              <div key={l} style={s.row}><div style={s.label}>{l}</div><div style={s.value}>{v}</div></div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>実装済み機能</div>
            <div style={{ display: "grid", gridTemplateColumns: isPC ? "1fr 1fr" : "1fr", gap: 8 }}>
              {[
                ["✅", "電話自動受付（着信→AI解析→LINE通知）"],
                ["✅", "案件管理（CallsPage）"],
                ["✅", "工事管理（Projects）"],
                ["✅", "取引先・協力業者管理"],
                ["✅", "タスク管理"],
                ["✅", "財務・書類管理（パスワードロック付き）"],
                ["✅", "お知らせ・雛形管理"],
                ["✅", "見積書作成ツール（見積ベース対応）"],
                ["✅", "分析ダッシュボード"],
                ["✅", "AIアシスタント"],
                ["✅", "社内掲示板"],
                ["✅", "釣り情報"],
                ["✅", "工事写真報告書作成ツール"],
                ["✅", "LINE通知設定（キーワード別）"],
                ["✅", "PWA対応（スマホホーム画面追加）"],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13, color: "#374151" }}>
                  <span>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </>}

        {tab === "accounts" && <>
          <div style={{ ...s.alertCard("#EF4444"), marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#991B1B", fontWeight: 700 }}>⚠️ 注意：このページの情報は機密です。取り扱いに十分注意してください。</div>
          </div>

          {[
            {
              title: "Vercel（デプロイ）", items: [
                ["プロジェクト名", "igumi-kanri（Proプラン）"],
                ["ログインアカウント", "igumi.kst@gmail.com"],
                ["本番URL", "https://igumi-kanri.vercel.app/"],
                ["Proプラン料金", "約3,000円/月"],
              ]
            },
            {
              title: "Supabase（データベース）", items: [
                ["プロジェクトID", "zejpcwpoqcncnwlwhnjv"],
                ["URL", "https://zejpcwpoqcncnwlwhnjv.supabase.co"],
                ["プラン", "無料プラン（DB 500MBまで）"],
              ]
            },
            {
              title: "Twilio（電話受付）", items: [
                ["Account SID", "Vercel環境変数を参照（TWILIO_ACCOUNT_SID）"],
                ["電話番号", "+81 50 1792 1641"],
                ["Regulatory Bundle SID", "Vercel環境変数を参照"],
                ["Auth Token", "Vercel環境変数に設定済み"],
                ["着信URL", "https://igumi-kanri.vercel.app/api/voice"],
              ]
            },
            {
              title: "LINE Messaging API", items: [
                ["Channel ID", "2010349986"],
                ["Channel Secret", "Vercel環境変数を参照"],
                ["アクセストークン", "Vercel環境変数に設定済み"],
                ["通知方式", "スタッフ個別送信（Supabase line_staff_names管理）"],
              ]
            },
            {
              title: "Anthropic（Claude API）", items: [
                ["アカウント", "igumi.k.s.t@gmail.com"],
                ["使用モデル", "claude-sonnet-4-6"],
                ["クレジット", "$20（自動リロードON）"],
                ["APIキー", "Vercel環境変数に設定済み"],
              ]
            },
            {
              title: "OpenAI（Whisper）", items: [
                ["用途", "電話録音の音声→テキスト変換"],
                ["モデル", "whisper-1"],
                ["APIキー", "Vercel環境変数に設定済み"],
              ]
            },
          ].map(section => (
            <div key={section.title} style={s.card}>
              <div style={s.sectionTitle}>{section.title}</div>
              {section.items.map(([l, v]) => (
                <div key={l} style={s.row}>
                  <div style={s.label}>{l}</div>
                  <div style={s.value}><span style={s.code}>{v}</span></div>
                </div>
              ))}
            </div>
          ))}

          <div style={s.card}>
            <div style={s.sectionTitle}>Vercel環境変数一覧</div>
            {[
              "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "OPENAI_API_KEY",
              "ANTHROPIC_API_KEY", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_USER_ID",
              "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "GITHUB_TOKEN",
              "GITHUB_REPO", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY",
            ].map(key => (
              <div key={key} style={{ padding: "6px 0", borderBottom: "1px solid #F1F5F9" }}>
                <span style={s.code}>{key}</span>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>開発環境</div>
            {[
              ["GitHubリポジトリ", "igumikst/igumi-kanri"],
              ["ローカルパス（会社PC）", "C:\\Users\\kst22\\Desktop\\igumi-kanri-1"],
              ["ローカルパス（自宅PC）", "D:\\デスクトップ\\igumi-kanri"],
              ["会社PC ユーザー名", "kst22"],
              ["使用エディタ", "Visual Studio Code"],
            ].map(([l, v]) => (
              <div key={l} style={s.row}><div style={s.label}>{l}</div><div style={s.value}><span style={s.code}>{v}</span></div></div>
            ))}
          </div>
        </>}

        {tab === "flow" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>自動受付フロー</div>
            {[
              ["固定電話に入電", "#1A3A5C"],
              ["即時転送でTwilio番号に転送", "#0891B2"],
              ["TwilioがWebhookでvoice.jsを呼ぶ", "#0891B2"],
              ['自動音声：「はい、株式会社いぐみです。担当者へ直接共有いたしますのでご用件をお聞かせください。」', "#0891B2"],
              ["録音開始（最大3分・無音5秒で自動終了）", "#0891B2"],
              ["録音完了でrecording.jsを呼ぶ", "#7C3AED"],
              ["OpenAI WhisperAPIで文字起こし", "#7C3AED"],
              ["Claude APIで解析（会社名・担当者・物件・用件・緊急度を抽出）", "#6D28D9"],
              ["Supabaseのcallsテーブルに登録", "#059669"],
              ["キーワードルールに従い対象スタッフにLINE通知", "#059669"],
              ["IGUMIアプリの電話受付ページに反映", "#1A3A5C"],
            ].map(([text, color], i) => (
              <div key={i} style={s.flowStep}>
                <div style={{ ...s.stepNum, background: color }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: "#374151", paddingTop: 4 }}>{text}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>APIファイル構成</div>
            {[
              ["api/voice.js", "Twilio着信→TwiML自動音声応答・録音開始"],
              ["api/recording.js", "録音完了Webhook→文字起こし→解析パイプライン"],
              ["api/transcribe.js", "OpenAI Whisperで文字起こし"],
              ["api/analyze.js", "Claudeで解析→Supabase登録→LINE通知"],
              ["api/pipeline.js", "パイプライン処理"],
              ["api/linegroup.js", "LINE Webhookでスタッフ名を登録・保存"],
              ["api/recording-proxy.js", "Twilioの録音URLをプロキシ（認証ポップアップ回避）"],
            ].map(([file, desc]) => (
              <div key={file} style={s.row}>
                <div style={{ ...s.label, fontFamily: "monospace" }}>{file}</div>
                <div style={s.value}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>Supabaseテーブル（callsテーブル）</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>電話受付案件のメインテーブル</div>
            {[
              ["case_number", "案件番号（例：TEL-20260620-001）"],
              ["received_at", "受電日時"],
              ["company_name", "管理会社名"],
              ["contact_name", "担当者名"],
              ["phone_number", "折返し先電話番号"],
              ["property_name", "物件名"],
              ["room_number", "部屋番号"],
              ["case_type", "用件種類"],
              ["urgency", "緊急度（緊急/通常/低）"],
              ["ai_summary", "AI要約"],
              ["transcript", "文字起こし全文"],
              ["recording_url", "録音ファイルURL"],
              ["assignee", "担当者"],
              ["status", "未対応/対応中/完了"],
              ["tags", "タグ（配列）"],
            ].map(([col, desc]) => (
              <div key={col} style={s.row}>
                <div style={{ ...s.label, fontFamily: "monospace", fontSize: 12 }}>{col}</div>
                <div style={s.value}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>home_settingsテーブル</div>
            {[
              ["tiles", "ホーム画面タイル設定"],
              ["finance_password", "財務ページパスワード"],
              ["assignee_names", "担当者名リスト"],
              ["call_tags", "電話受付タグ"],
              ["fish_locations", "釣りページ天気地点"],
              ["fish_links", "釣りページクイックリンク"],
              ["line_staff_ids", "LINE通知スタッフのUSER ID一覧"],
              ["line_staff_names", "LINE通知スタッフの名前とID"],
              ["line_keyword_rules", "キーワード別通知ルール"],
            ].map(([id, desc]) => (
              <div key={id} style={s.row}>
                <div style={{ ...s.label, fontFamily: "monospace", fontSize: 12 }}>{id}</div>
                <div style={s.value}>{desc}</div>
              </div>
            ))}
          </div>
        </>}

        {tab === "cost" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>月額ランニングコスト（月100件想定）</div>
            {[
              { name: "Vercel Pro", cost: "約3,000円/月", note: "デプロイ・サーバーレス関数", color: "#0891B2" },
              { name: "Twilio（番号+通話料）", cost: "約1,000円/月", note: "050番号 $4.75/月 + 着信 $0.01/分 + 録音 $0.0025/分", color: "#E07B39" },
              { name: "OpenAI Whisper", cost: "約200円/月", note: "$0.006/分 × 200分（100件×2分）", color: "#7C3AED" },
              { name: "Claude API", cost: "約200円/月", note: "$20クレジットで数ヶ月持つ（自動リロードON）", color: "#6D28D9" },
              { name: "Supabase", cost: "0円", note: "無料プラン（DB 500MBまで）", color: "#059669" },
              { name: "LINE公式アカウント", cost: "0円", note: "無料プラン（月200通まで）", color: "#059669" },
            ].map(item => (
              <div key={item.name} style={s.costCard}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2937", marginBottom: 2 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{item.note}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: item.color }}>{item.cost}</div>
              </div>
            ))}
            <div style={{ background: "#1A3A5C", borderRadius: 10, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ color: "#fff", fontWeight: 700 }}>月額合計</div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>約4,400円/月</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>電話件数が増えた場合の試算</div>
            {[
              ["月100件 × 2人通知", "約4,400円/月（現状）"],
              ["月300件 × 2人通知", "約6,000円/月"],
              ["月300件 × 6人通知（LINE有料化）", "約11,000円/月（LINEライトプラン追加）"],
            ].map(([scenario, cost]) => (
              <div key={scenario} style={s.row}>
                <div style={s.label}>{scenario}</div>
                <div style={{ ...s.value, fontWeight: 700, color: "#1A3A5C" }}>{cost}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>LINE有料化の判断基準</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              現在の無料プランは月200通まで。スタッフ2人で月100件の電話 = 200通でちょうど上限。<br />
              スタッフが増えたり電話件数が増えた場合は<strong>ライトプラン（月5,000円・5,000通）</strong>へのアップグレードを検討。
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>各サービスの詳細料金</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A3A5C", marginBottom: 8 }}>Twilio Voice（日本）</div>
            {[
              ["050番号 月額", "$4.75/月（約700円）"],
              ["着信料金", "$0.0100/分"],
              ["録音料金", "$0.0025/分"],
              ["録音ストレージ", "$0.0005/分/月（月1万分まで無料）"],
            ].map(([l, v]) => (
              <div key={l} style={s.row}><div style={s.label}>{l}</div><div style={s.value}>{v}</div></div>
            ))}
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A3A5C", margin: "16px 0 8px" }}>Supabase</div>
            {[
              ["無料プラン（Free）", "DB 500MB・MAU 50,000人まで"],
              ["Proプラン", "$25/月（DB 8GB）"],
              ["ストレージ超過分", "$0.021/GB"],
            ].map(([l, v]) => (
              <div key={l} style={s.row}><div style={s.label}>{l}</div><div style={s.value}>{v}</div></div>
            ))}
          </div>
        </>}

        {tab === "trouble" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>タイルが壊れた・アプリが古いバージョンになった</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, marginBottom: 12 }}>
              Supabaseのtiles設定が壊れている場合、以下のSQLを実行してリセット。
            </div>
            <div style={{ background: "#1A3A5C", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 13, color: "#E0F2FE" }}>
              UPDATE home_settings SET value = '[]'::jsonb WHERE id = 'tiles';
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>App.jsxの編集・デプロイ方法</div>
            {[
              "VSCodeでsrc/App.jsxを開く",
              "Claudeのアーティファクトから Ctrl+A → コピー",
              "App.jsxに貼り付けて Ctrl+S で保存",
              "コマンドプロンプトでgit add src/App.jsx を実行",
              'git commit -m "コメント" を実行',
              "git push を実行",
              "Vercelが自動でデプロイ（1〜2分で反映）",
            ].map((step, i) => (
              <div key={i} style={s.flowStep}>
                <div style={s.stepNum}>{i + 1}</div>
                <div style={{ fontSize: 13, color: "#374151", paddingTop: 4 }}>{step}</div>
              </div>
            ))}
            <div style={{ ...s.alertCard("#EF4444"), marginTop: 12 }}>
              <div style={{ fontSize: 13, color: "#991B1B" }}>⚠️ <strong>copyコマンドは使わない！</strong>ファイル名が「App.jsx(1)」になるため使用禁止。必ずCtrl+A→ペースト方式で。</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>Twilioの署名検証エラー（403）</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              voice.js・recording.jsのURL検証部分でVERCEL_URLではなく固定URLを使用すること。
            </div>
            <div style={{ background: "#1A3A5C", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 13, color: "#E0F2FE", marginTop: 8 }}>
              {`const url = "https://igumi-kanri.vercel.app/api/voice";`}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>PowerShellでnpmが動かない</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              コマンドプロンプト（cmd）を使う。PowerShellではなくcmdを使用すること。
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>vercel.jsonのビルドエラー</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              vercel.jsonが原因でビルドエラーが出た場合はファイルを削除することで解決した実績あり。
            </div>
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>使用するClaudeモデル名</div>
            <div style={{ background: "#1A3A5C", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 13, color: "#E0F2FE" }}>
              claude-sonnet-4-6
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 8 }}>analyze.jsで使用。モデル名が変わるとエラーになるため注意。</div>
          </div>
        </>}

        {tab === "dev" && <>
          <div style={s.card}>
            <div style={s.sectionTitle}>開発環境セットアップ</div>
            {[
              "Node.js（LTS版）をnodejs.orgからインストール",
              "Visual Studio Codeをインストール",
              "GitHubアカウント（igumikst）でログイン",
              "リポジトリをクローン：igumikst/igumi-kanri",
              "プロジェクトフォルダで npm install を実行",
              "npm run dev でローカル開発サーバー起動（localhost:5173）",
            ].map((step, i) => (
              <div key={i} style={s.flowStep}>
                <div style={s.stepNum}>{i + 1}</div>
                <div style={{ fontSize: 13, color: "#374151", paddingTop: 4 }}>{step}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>gitコマンド（1行ずつ実行）</div>
            {[
              ["最新を取得", "git pull"],
              ["ファイルを追加", "git add ファイル名"],
              ["コミット", 'git commit -m "コメント"'],
              ["プッシュ", "git push"],
            ].map(([label, cmd]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>{label}</div>
                <div style={{ background: "#1A3A5C", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 13, color: "#E0F2FE" }}>{cmd}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>ファイル構成</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#374151", lineHeight: 2, background: "#F8FAFC", borderRadius: 8, padding: 14 }}>
              {`igumi-kanri/
├── api/
│   ├── voice.js         ← 着信→自動音声
│   ├── recording.js     ← 録音完了→パイプライン
│   ├── transcribe.js    ← Whisper文字起こし
│   ├── analyze.js       ← Claude解析→通知
│   ├── pipeline.js      ← パイプライン処理
│   ├── linegroup.js     ← LINEスタッフ登録
│   ├── recording-proxy.js ← 録音プロキシ
│   └── package.json
├── src/
│   ├── pages/           ← 各ページ（15ファイル）
│   ├── lib/
│   │   ├── supabase.js
│   │   └── constants.js
│   ├── components/
│   │   ├── Layout.jsx
│   │   └── UI.jsx
│   └── App.jsx
├── public/
│   ├── report.html      ← 工事写真報告書
│   ├── logo192.png
│   └── manifest.json
└── vercel.json`}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}