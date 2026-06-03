export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { instruction } = req.body;
  if (!instruction) {
    return res.status(400).json({ error: '指示が空です' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    // 1. GitHubから現在のApp.jsxを取得
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/src/App.jsx`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'igumi-auto-edit' } }
    );
    if (!ghRes.ok) throw new Error('GitHubからファイルを取得できませんでした');
    const ghData = await ghRes.json();
    const currentCode = Buffer.from(ghData.content, 'base64').toString('utf-8');
    const sha = ghData.sha;

    // 2. Claudeに修正を依頼
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: `あなたはIGUMI管理アプリのReact開発者です。
以下の指示に従ってApp.jsxを修正してください。

修正指示: ${instruction}

重要なルール:
- 完全なApp.jsxのコードのみを返してください
- コードブロック（\`\`\`）は使わないでください
- 説明文は一切不要です
- コードの先頭は必ず import から始めてください
- 既存の機能は壊さないように注意してください

現在のApp.jsx:
${currentCode}`
        }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      throw new Error(`Claude APIエラー: ${err.error?.message || 'Unknown error'}`);
    }

    const claudeData = await claudeRes.json();
    let newCode = claudeData.content[0].text.trim();

    // コードブロックが含まれていたら除去
    if (newCode.startsWith('```')) {
      newCode = newCode.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    // 3. GitHubにコミット
    const encoded = Buffer.from(newCode).toString('base64');
    const commitRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/src/App.jsx`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'igumi-auto-edit',
        },
        body: JSON.stringify({
          message: `Auto-edit: ${instruction.substring(0, 60)}`,
          content: encoded,
          sha: sha,
        }),
      }
    );

    if (!commitRes.ok) {
      const err = await commitRes.json();
      throw new Error(`GitHubコミットエラー: ${err.message}`);
    }

    return res.status(200).json({
      success: true,
      message: '✅ 完了！Vercelが自動デプロイ中です（1〜2分で反映されます）'
    });

  } catch (error) {
    console.error('Auto-edit error:', error);
    return res.status(500).json({ error: error.message });
  }
}