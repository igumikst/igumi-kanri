// /api/blog-feed.js
// IGUMIブログ一覧ページをスクレイピングし、最新3件をJSONで返す

const BLOG_URL = "https://www.igumi-inc.jp/blog";
const BASE_URL = "https://www.igumi-inc.jp";

function absUrl(href) {
  if (!href) return "";
  const trimmed = href.trim().replace(/^['"]|['"]$/g, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${BASE_URL}${trimmed}`;
  return `${BASE_URL}/${trimmed}`;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(raw) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) return trimmed.replace(/\//g, "-");
  return trimmed;
}

function parseBlogPosts(html) {
  const listMatch = html.match(/<ul class="post_list">([\s\S]*?)<\/ul>/);
  if (!listMatch) return [];

  const posts = [];
  const itemRegex = /<li class="post_item">([\s\S]*?)<\/li>/g;
  let match;

  while ((match = itemRegex.exec(listMatch[1])) !== null && posts.length < 3) {
    const block = match[1];
    const hrefMatch = block.match(/class="post_item_link"\s+href="([^"]+)"/);
    const titleMatch = block.match(/<h2 class="blog_post_title">\s*([\s\S]*?)\s*<\/h2>/);
    if (!hrefMatch || !titleMatch) continue;

    const url = absUrl(hrefMatch[1]);
    const title = stripTags(titleMatch[1]);
    if (!title || !url) continue;

    const imgMatch = block.match(/background-image:\s*url\(([^)]+)\)/);
    const dateMatch = block.match(/<div class="blog_post_day"><time>([^<]+)<\/time><\/div>/);

    posts.push({
      id: hrefMatch[1],
      title,
      url,
      thumbnail_url: imgMatch ? absUrl(imgMatch[1]) : "",
      published_at: normalizeDate(dateMatch ? dateMatch[1] : ""),
    });
  }

  return posts;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600");

  if (req.method !== "GET") {
    return res.status(405).json({ posts: [] });
  }

  try {
    const response = await fetch(BLOG_URL, {
      headers: {
        "User-Agent": "IGUMI-OS-BlogFeed/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return res.status(200).json({ posts: [] });
    }

    const html = await response.text();
    const posts = parseBlogPosts(html);
    return res.status(200).json({ posts });
  } catch (_) {
    return res.status(200).json({ posts: [] });
  }
};
