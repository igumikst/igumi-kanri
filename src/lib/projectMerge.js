// 案件の統合(テーマ32)。統合元の案件は削除せず、merged_into_id を立てて
// 一覧・検索・集計・候補から隠すだけにする(統合先へのリンクから直接開けば今まで通り見える)。
export const visibleProjects = pjs => (pjs || []).filter(p => !p.merged_into_id);

// 統合の確認画面用: 統合元の案件にぶら下がる件数(見積・予定・報告書・見積ファイル・報告書ファイル)を数える
export const fetchMergeCounts = async (supabase, sourceId) => {
  const [quotes, schedules, reports, quoteFiles, reportFiles] = await Promise.all([
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("project_id", sourceId),
    supabase.from("schedules").select("id", { count: "exact", head: true }).eq("project_id", sourceId),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("project_id", sourceId),
    supabase.from("quote_files").select("id", { count: "exact", head: true }).eq("project_id", sourceId),
    supabase.from("report_files").select("id", { count: "exact", head: true }).eq("project_id", sourceId),
  ]);
  return {
    quotes: quotes.count || 0,
    schedules: schedules.count || 0,
    reports: reports.count || 0,
    quoteFiles: quoteFiles.count || 0,
    reportFiles: reportFiles.count || 0,
  };
};

// 統合先の詳細画面に出す統合履歴(新しい順)
export const fetchMergeHistory = async (supabase, targetId) => {
  const { data } = await supabase.from("project_merges").select("*").eq("target_project_id", targetId).order("merged_at", { ascending: false });
  return data || [];
};

export const mergeProjects = (supabase, { sourceId, targetId, performedBy }) =>
  supabase.rpc("merge_projects", { p_source_id: sourceId, p_target_id: targetId, p_performed_by: performedBy || null });

export const unmergeProjects = (supabase, { sourceId, performedBy }) =>
  supabase.rpc("unmerge_projects", { p_source_id: sourceId, p_performed_by: performedBy || null });
