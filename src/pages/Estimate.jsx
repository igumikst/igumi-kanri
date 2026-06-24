export default function Estimate({ nav }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#1A3A5C', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => nav('home')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>← 戻る</button>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>📝 見積書作成</div>
      </div>
      <iframe
        src="/estimate.html"
        style={{ flex: 1, width: '100%', border: 'none' }}
        title="見積書作成"
      />
    </div>
  );
}