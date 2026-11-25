import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { QUOTE_FILE_BUCKET } from '../lib/quoteFiles';

// 会社共通の角印。画像は公開リポジトリに入れず、非公開の Storage(quote-files)に置く。
// 置き場所: system/kakuin/kakuin-<登録した時刻(ミリ秒)>.png。いちばん新しいものを使う(古いものは残る。Storage側で、削除・上書きは許可していないため)
const KAKUIN_DIR = 'system/kakuin';
const MAX_DATA_URL = 2_000_000; // 画像(データURL)の大きさの上限

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error('画像を読み込めませんでした'));
  fr.readAsDataURL(blob);
});

// 会社共通の角印を読む。未登録なら空の文字列
async function loadSharedKakuin() {
  const st = supabase.storage.from(QUOTE_FILE_BUCKET);
  const { data: list, error } = await st.list(KAKUIN_DIR, { limit: 100, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw error;
  const f = (list || []).find((x) => /^kakuin-\d+\.(png|jpe?g)$/i.test(x.name || ''));
  if (!f) return '';
  const { data, error: e2 } = await st.createSignedUrl(`${KAKUIN_DIR}/${f.name}`, 60);
  if (e2) throw e2;
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error('角印を読み込めませんでした(HTTP ' + res.status + ')');
  const type = /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg';
  return toDataUrl(new Blob([await res.arrayBuffer()], { type }));
}

// 会社共通の角印を登録する(画像は PNG か JPEG のデータURLだけ受け付ける)
async function saveSharedKakuin(dataUrl) {
  const m = /^data:image\/(png|jpeg);base64,/.exec(dataUrl || '');
  if (!m || dataUrl.length > MAX_DATA_URL) throw new Error('画像の形式か大きさが合いません(PNG・JPEGで、大きすぎないもの)');
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${KAKUIN_DIR}/kakuin-${Date.now()}.${ext}`;
  // contentType は、見積ファイルの取り込みと同じ「octet-stream」にする(バケットの形式の制限に引っかからないように)
  const { error } = await supabase.storage.from(QUOTE_FILE_BUCKET).upload(path, blob, { contentType: 'application/octet-stream', upsert: false });
  if (error) throw error;
  return dataUrl;
}

export default function Estimate({ nav }) {
  const frameRef = useRef(null);

  // 見積書作成の画面(iframe)との、やりとり。角印を、会社共通のものにそろえるため
  useEffect(() => {
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin) return;
      const win = frameRef.current && frameRef.current.contentWindow;
      if (!win || e.source !== win) return;
      const msg = e.data || {};
      const reply = (o) => win.postMessage(o, window.location.origin);
      if (msg.type === 'est-need-kakuin') {
        try {
          reply({ type: 'est-kakuin', dataUrl: await loadSharedKakuin() });
        } catch (err) {
          reply({ type: 'est-kakuin', dataUrl: '', error: String((err && err.message) || err) });
        }
      } else if (msg.type === 'est-save-kakuin') {
        try {
          reply({ type: 'est-kakuin-saved', ok: true, dataUrl: await saveSharedKakuin(msg.dataUrl) });
        } catch (err) {
          reply({ type: 'est-kakuin-saved', ok: false, error: String((err && err.message) || err) });
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 入力途中の下書き(estimate.html が、再読み込みに備えて、ブラウザの一時保存に置いている)は、
  // 自分で別の画面へ移ったときだけ消す。再読み込みでは消えないので、戻ってきたとき、続きから使える
  useEffect(() => () => {
    setTimeout(() => {
      try { sessionStorage.removeItem('igumi_est_draft'); } catch { /* ignore */ }
    }, 100);
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#1A3A5C', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => nav('home')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>← 戻る</button>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>📝 見積書作成</div>
      </div>
      <iframe
        ref={frameRef}
        src="/estimate.html"
        style={{ flex: 1, width: '100%', border: 'none' }}
        title="見積書作成"
      />
    </div>
  );
}
