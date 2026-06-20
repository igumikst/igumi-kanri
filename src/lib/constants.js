export const STATUSES = ["発注待ち","見積中","着工","進行中","完了","中断"];
export const COMPANY_TYPES = ["取引先","協力業者","その他"];
export const CONTACT_ROLES = ["営業","現場監督","職人","事務","その他"];
export const STATUS_STYLE = {
  "発注待ち":{bg:"#FFF3CD",text:"#856404",border:"#FFCA2C"},
  "見積中":{bg:"#E0F0FF",text:"#0B4F8A",border:"#60A5FA"},
  "着工":{bg:"#D1FAE5",text:"#065F46",border:"#34D399"},
  "進行中":{bg:"#D1E7DD",text:"#0A3622",border:"#20C997"},
  "完了":{bg:"#E2E3E5",text:"#41464B",border:"#ADB5BD"},
  "中断":{bg:"#F8D7DA",text:"#58151C",border:"#F1707A"},
};
export const DEFAULT_FINANCE_ITEMS = [
  {id:"invoice",label:"請求書PDF",icon:"🧾"},
  {id:"receipt",label:"領収書",icon:"📄"},
  {id:"outsource",label:"外注請求書",icon:"📋"},
  {id:"order",label:"発注書",icon:"📝"},
  {id:"delivery",label:"納品書",icon:"📦"},
  {id:"bankbook",label:"通帳確認",icon:"🏦"},
  {id:"settlement",label:"決算資料",icon:"📊"},
  {id:"insurance",label:"保険関係",icon:"🛡"},
  {id:"tax",label:"税務書類",icon:"📑"},
];
export const TEMPLATE_CATS = [
  {id:"notice",label:"居住者へのお知らせ",icon:"📢"},
  {id:"est_base",label:"見積もりベース",icon:"📊"},
  {id:"contract",label:"契約書・書類",icon:"📄"},
  {id:"report",label:"報告書・議事録",icon:"📝"},
  {id:"other",label:"その他",icon:"📁"},
];
export const DEFAULT_LINKS = [
  {id:"l1",cat:"ツール・サービス",label:"Dropbox",url:"https://www.dropbox.com",icon:"📦"},
  {id:"l2",cat:"ツール・サービス",label:"サイボウズ",url:"https://garoon.cybozu.co.jp",icon:"🗂"},
  {id:"l3",cat:"ツール・サービス",label:"イシグロ",url:"https://www.ishiguro-group.co.jp",icon:"🏗"},
  {id:"l4",cat:"Google",label:"Google ToDo",url:"https://tasks.google.com",icon:"✅"},
];
export const DEFAULT_TILE_CONF = [
  {key:"projects",icon:"📋",label:"案件管理",sub:"件進行中",color:"#1A3A5C",visible:true},
  {key:"companies",icon:"🏢",label:"取引先・協力業者",sub:"社登録",color:"#E07B39",visible:true},
  {key:"tasks",icon:"✅",label:"タスク",sub:"未完了",color:"#059669",visible:true},
  {key:"links",icon:"🔗",label:"リンク集",sub:"外部サービス",color:"#7C3AED",visible:true},
  {key:"finance",icon:"🗃",label:"財務・書類管理",sub:"書類一覧",color:"#0891B2",visible:true},
  {key:"templates",icon:"📂",label:"お知らせ・雛形",sub:"テンプレート",color:"#D97706",visible:true},
  {key:"estimate",icon:"📝",label:"見積書作成",sub:"CSV出力対応",color:"#BE185D",visible:true},
  {key:"analytics",icon:"📊",label:"分析ダッシュボード",sub:"グラフ・集計",color:"#0F766E",visible:true},
  {key:"ai",icon:"🤖",label:"AIアシスタント",sub:"データに質問",color:"#6D28D9",visible:true},
  {key:"chatgpt",icon:"💬",label:"ChatGPT",sub:"外部AIを開く",color:"#10A37F",visible:true},
  {key:"report",icon:"📋",label:"報告書作成",sub:"工事写真報告書",color:"#7C3AED",visible:true},
  {key:"board",icon:"📌",label:"社内掲示板",sub:"お知らせ・連絡",color:"#DC2626",visible:true},
  {key:"fishing",icon:"🎣",label:"釣り情報",sub:"天気・釣果・リンク",color:"#0284C7",visible:true},
  {key:"autoedit",icon:"🤖",label:"Auto-Edit",sub:"AIが自動でアプリを改修",color:"#6D28D9",visible:true},
  {key:"calls",icon:"📞",label:"電話受付",sub:"入電案件一覧",color:"#0EA5E9",visible:true},
  {key:"linesettings",icon:"📲",label:"LINE通知設定",sub:"キーワード・スタッフ管理",color:"#06B6D4",visible:true},
];
export const DEFAULT_CUST = {name:"株式会社IGUMI",sys:"案件管理システム",c1:"#1A3A5C",c2:"#2563EB",acc:"#E07B39",bg:"#F0F4F8",showSidebar:true,showRightPanel:true,showLauncher:true};
export const PRIO = {high:{l:"高",c:"#EF4444"},mid:{l:"中",c:"#F59E0B"},low:{l:"低",c:"#10B981"}};
export const fmt = n => n?"¥"+Number(n).toLocaleString():"—";
export const pct = (g,a) => a?((g/a)*100).toFixed(1)+"%":"—";