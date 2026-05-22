import type { FastifyRequest, FastifyReply } from 'fastify';

const GITHUB_API = 'https://api.github.com';

function githubHeaders() {
  const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'AgentBuilderConsole/1.0' };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `token ${token}`;
  return h;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  for (const re of [/github\.com\/([^/]+)\/([^/?#]+)/, /^([^/]+)\/([^/]+)$/]) {
    const m = url.match(re);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  }
  return null;
}

export async function githubFetch(req: FastifyRequest, reply: FastifyReply) {
  const { repoUrl, branch, selectedPaths, filePath } = req.body as { repoUrl?: string; branch?: string; selectedPaths?: string[]; filePath?: string };
  if (!repoUrl) return reply.code(400).send({ error: 'repoUrl is required' });

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return reply.code(400).send({ error: 'Invalid GitHub URL' });
  const { owner, repo } = parsed;

  try {
    // Get default branch if not supplied
    let targetBranch = branch;
    if (!targetBranch) {
      const infoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: githubHeaders() });
      if (!infoRes.ok) throw new Error(`Failed to fetch repo info: ${infoRes.statusText}`);
      const info = await infoRes.json() as { default_branch: string };
      targetBranch = info.default_branch;
    }

    // If specific file requested
    if (filePath) {
      const fileRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${targetBranch}`, { headers: githubHeaders() });
      if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.statusText}`);
      const fileData = await fileRes.json() as { content?: string; encoding?: string; name?: string; path?: string; size?: number };
      let content = fileData.content ?? '';
      if (fileData.encoding === 'base64') content = Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8');
      return reply.send({ success: true, path: filePath, content, name: fileData.name, size: fileData.size });
    }

    // Fetch tree
    const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`, { headers: githubHeaders() });
    if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.statusText}`);
    const treeData = await treeRes.json() as { tree: Array<{ path: string; type: string; size?: number; url: string }> };

    const items = treeData.tree
      .filter((item) => item.type === 'blob')
      .map((item) => ({ path: item.path, size: item.size ?? 0, type: 'file' as const }));

    // If selectedPaths, fetch those files
    if (selectedPaths?.length) {
      const files: Array<{ path: string; content: string }> = [];
      for (const p of selectedPaths) {
        const fr = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${p}?ref=${targetBranch}`, { headers: githubHeaders() });
        if (!fr.ok) continue;
        const fd = await fr.json() as { content?: string; encoding?: string };
        let content = fd.content ?? '';
        if (fd.encoding === 'base64') content = Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8');
        files.push({ path: p, content });
      }
      return reply.send({ success: true, owner, repo, branch: targetBranch, files });
    }

    reply.send({ success: true, owner, repo, branch: targetBranch, tree: items });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
