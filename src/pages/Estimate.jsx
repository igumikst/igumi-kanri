export default function Estimate() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      <iframe
        src="/estimate.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="見積書作成"
      />
    </div>
  );
}