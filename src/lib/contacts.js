// 取引先の担当者(companies.contacts)の追加・編集・削除を1か所にまとめる(第8弾テーマ6)。
// Companies.jsx(取引先詳細の担当者欄)・ClientBranchRepPicker.jsx(案件の営業担当選択)の
// 両方から使う。役割が「営業」の担当者だけ sales_reps と同期する(案件の営業担当の
// 選択肢に出るのは sales_reps だけなので)。
//
// 担当者(ct)の形: { id, name, role, tel, email, memo, branchId, salesRepId? }
// branchId は company_branches.id。古いデータ(branchId が無いもの)は、
// branch(営業所名の文字列)を今の営業所一覧と名前で照合して表示する(データの書き換えはしない)。

// 担当者の営業所idを解決する(branchIdがあればそれを使う。無ければ古いbranch名から探す)
export function resolveContactBranchId(ct, branchesForCompany) {
  if (ct.branchId) return ct.branchId;
  if (ct.branch) return (branchesForCompany || []).find(b => b.name === ct.branch)?.id || null;
  return null;
}

// 担当者の営業所の表示名(営業所一覧から今の名前を引く。見つからなければ古いbranch名を出す)
export function contactBranchName(ct, branchesForCompany) {
  const id = resolveContactBranchId(ct, branchesForCompany);
  if (id) return (branchesForCompany || []).find(b => b.id === id)?.name || ct.branch || null;
  return ct.branch || null;
}

// 同じ名前・同じ営業所(どちらも未設定を含む)の担当者が、すでにいるか。
// 古いデータ(branchIdが無く、branch名だけ)も resolveContactBranchId で解決して比べる
export function findDuplicateContact(contacts, { name, branchId, excludeId }, branchesForCompany) {
  return (contacts || []).find(ct => ct.id !== excludeId && ct.name === name && (resolveContactBranchId(ct, branchesForCompany) || null) === (branchId || null));
}

// その担当者(sales_repsのid)が割り当てられている案件を探す
function findLinkedProjects(projects, salesRepId) {
  return (projects || []).filter(p => p.salesRepId === salesRepId);
}

function linkedProjectsMessage(linked) {
  return `この担当者は${linked.length}件の案件(${linked.map(p => p.name).join("、")})に割り当てられています。先に担当者を変更してください`;
}

// 担当者を追加する。役割が「営業」ならsales_repsにも作り、そのidをcontactに持たせる
export async function addContact(supabase, { companyId, contacts, name, role, tel, email, memo, branchId }) {
  let salesRepRow = null;
  if (role === "営業") {
    const { data, error } = await supabase.from("sales_reps").insert([{ company_id: companyId, branch_id: branchId || null, name }]).select();
    if (error) throw new Error("営業担当(sales_reps)の追加に失敗しました: " + error.message);
    salesRepRow = data[0];
  }
  const ct = {
    id: "ct" + Date.now(), name, role, tel: tel || "", email: email || "", memo: memo || "",
    branchId: branchId || null, ...(salesRepRow ? { salesRepId: salesRepRow.id } : {}),
  };
  const newContacts = [...(contacts || []), ct];
  const { error } = await supabase.from("companies").update({ contacts: newContacts }).eq("id", companyId);
  if (error) throw new Error("担当者の追加に失敗しました(sales_repsには追加されています): " + error.message);
  return { contact: ct, contacts: newContacts, salesRepRow };
}

// 担当者を編集する。営業所を変えたらsales_reps.branch_idも同期する。
// 役割を「営業」に変えた場合はsales_repsを新規作成、「営業」から外した場合は
// 案件に割り当てられていなければsales_repsを削除する(割り当てがあれば止める)
export async function updateContact(supabase, { companyId, contacts, projects, ctId, patch }) {
  const ct = (contacts || []).find(c => c.id === ctId);
  if (!ct) throw new Error("担当者が見つかりません");
  const next = { ...ct, ...patch };
  const willBeSales = next.role === "営業";
  let salesRepId = ct.salesRepId || null;
  let salesRepRow = null;
  let deletedSalesRep = false;

  if (willBeSales) {
    if (salesRepId) {
      const { error } = await supabase.from("sales_reps").update({ name: next.name, branch_id: next.branchId || null }).eq("id", salesRepId);
      if (error) throw new Error("営業担当(sales_reps)の更新に失敗しました: " + error.message);
      salesRepRow = { id: salesRepId, company_id: companyId, name: next.name, branch_id: next.branchId || null };
    } else {
      const { data, error } = await supabase.from("sales_reps").insert([{ company_id: companyId, branch_id: next.branchId || null, name: next.name }]).select();
      if (error) throw new Error("営業担当(sales_reps)の追加に失敗しました: " + error.message);
      salesRepRow = data[0];
      salesRepId = salesRepRow.id;
    }
  } else if (salesRepId) {
    const linked = findLinkedProjects(projects, salesRepId);
    if (linked.length) throw new Error(linkedProjectsMessage(linked));
    const { error } = await supabase.from("sales_reps").delete().eq("id", salesRepId);
    if (error) throw new Error("営業担当(sales_reps)の削除に失敗しました: " + error.message);
    salesRepId = null;
    deletedSalesRep = true;
  }

  const finalCt = { ...next, branchId: next.branchId || null };
  if (salesRepId) finalCt.salesRepId = salesRepId; else delete finalCt.salesRepId;
  const newContacts = contacts.map(c => c.id === ctId ? finalCt : c);
  const { error } = await supabase.from("companies").update({ contacts: newContacts }).eq("id", companyId);
  if (error) throw new Error("担当者の更新に失敗しました: " + error.message);
  return { contact: finalCt, contacts: newContacts, salesRepRow, deletedSalesRepId: deletedSalesRep ? ct.salesRepId : null };
}

// 担当者を削除する。案件に割り当てられていれば止める(sales_repsも削除しない)
export async function deleteContact(supabase, { companyId, contacts, projects, ctId }) {
  const ct = (contacts || []).find(c => c.id === ctId);
  if (!ct) throw new Error("担当者が見つかりません");
  if (ct.salesRepId) {
    const linked = findLinkedProjects(projects, ct.salesRepId);
    if (linked.length) throw new Error(linkedProjectsMessage(linked));
    const { error } = await supabase.from("sales_reps").delete().eq("id", ct.salesRepId);
    if (error) throw new Error("営業担当(sales_reps)の削除に失敗しました: " + error.message);
  }
  const newContacts = (contacts || []).filter(c => c.id !== ctId);
  const { error } = await supabase.from("companies").update({ contacts: newContacts }).eq("id", companyId);
  if (error) throw new Error("担当者の削除に失敗しました: " + error.message);
  return { contacts: newContacts, deletedSalesRepId: ct.salesRepId || null };
}
