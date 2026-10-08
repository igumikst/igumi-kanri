import { supabase } from "./supabase";

// 見積の元ファイルを保管する Storage のバケット(非公開。公開URLは作らない)
export const QUOTE_FILE_BUCKET = "quote-files";

export const FILE_TYPES = {
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  est: "application/octet-stream",
};

// 添付ファイルの一覧表示用のアイコン。ExcelとPDFを見分けられるように(第8弾テーマ21-B)
export const fileIcon = name => (/\.(xlsx|xls)$/i.test(name || "") ? "📗" : "📎");

// 署名付きURL(60秒だけ有効)を作って開く。ダウンロード時の名前は元のファイル名
export async function openQuoteFile(file) {
  // ポップアップブロックを避けるため、クリック直後に先にタブを開いておく
  const win = window.open("about:blank", "_blank");
  const { data, error } = await supabase.storage.from(QUOTE_FILE_BUCKET).createSignedUrl(file.storage_path, 60, { download: file.original_name });
  if (error) { win?.close(); alert("ファイルを開けませんでした: " + error.message); return; }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
