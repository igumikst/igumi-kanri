import { supabase } from "./supabase";

// 案件に紐づける報告書ファイルを保管する Storage のバケット(非公開。公開URLは作らない)
export const REPORT_FILE_BUCKET = "report-files";

export const REPORT_FILE_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pdf: "application/pdf",
};

// 1ファイルあたりの上限(30MB)。再圧縮の仕組みは作らない方針のため、超えたら受け付けない
export const REPORT_FILE_MAX_SIZE = 30 * 1024 * 1024;

export const reportFileExt = name => (name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();

// 署名付きURL(60秒だけ有効)を作って開く。quoteFiles.js の openQuoteFile と同じ作り
export async function openReportFile(file) {
  const win = window.open("about:blank", "_blank");
  const { data, error } = await supabase.storage.from(REPORT_FILE_BUCKET).createSignedUrl(file.storage_path, 60, { download: file.original_name });
  if (error) { win?.close(); alert("ファイルを開けませんでした: " + error.message); return; }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
