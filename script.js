/* ════════════════════════════════════════════════
   DEBLOCK STUDIOS — blog.js
   Markdown parser + article loader
   ════════════════════════════════════════════════ */

/* ── Minimal Markdown → HTML parser ── */
const md = (() => {
  function escape(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function inline(s) {
    return s
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
  }

  function parse(raw) {
    const lines = raw.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Blank line
      if (!line.trim()) { i++; continue; }

      // HR
      if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line.trim())) {
        out.push('<hr>'); i++; continue;
      }

      // Headings
      const hm = line.match(/^(#{1,6})\s+(.+)/);
      if (hm) {
        const lvl = hm[1].length;
        out.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`);
        i++; continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        const bqLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          bqLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push(`<blockquote>${parse(bqLines.join('\n'))}</blockquote>`);
        continue;
      }

      // Code block
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        i++;
        const codeLines = [];
        while (i < lines.length && !/^```/.test(lines[i])) {
          codeLines.push(escape(lines[i]));
          i++;
        }
        i++;
        out.push(`<pre><code class="lang-${lang}">${codeLines.join('\n')}</code></pre>`);
        continue;
      }

      // Unordered list
      if (/^[\*\-\+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[\*\-\+]\s/.test(lines[i])) {
          items.push(`<li>${inline(lines[i].replace(/^[\*\-\+]\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ul>${items.join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ol>${items.join('')}</ol>`);
        continue;
      }

      // Paragraph
      const paraLines = [];
      while (i < lines.length && lines[i].trim() && 
             !/^#{1,6}\s/.test(lines[i]) && 
             !/^[\*\-\+]\s/.test(lines[i]) && 
             !/^\d+\.\s/.test(lines[i]) && 
             !/^```/.test(lines[i]) && 
             !/^>\s?/.test(lines[i]) &&
             !/^-{3,}$|^\*{3,}$|^_{3,}$/.test(lines[i].trim())) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length) {
        out.push(`<p>${inline(paraLines.join(' '))}</p>`);
      }
    }
    return out.join('\n');
  }

  return { parse };
})();

/* ── Date formatter ── */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Parse markdown file content ── */
function parseArticleFile(filename, content) {
  const lines = content.split('\n');
  
  // First non-empty line must be the date (YYYY-MM-DD)
  let dateStr = '';
  let bodyStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      dateStr = trimmed;
      bodyStart = i + 1;
    }
    break;
  }

  // Title = filename without extension, dashes → spaces, capitalize
  const slug = filename.replace(/\.md$/, '');
  const title = slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Body = everything after the date line
  const bodyRaw = lines.slice(bodyStart).join('\n').trim();

  // Excerpt = first 20 words of plain text
  const plainText = bodyRaw
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_`[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = plainText.split(' ');
  const excerpt = words.slice(0, 20).join(' ') + (words.length > 20 ? '…' : '');

  // Date sort value
  const sortDate = dateStr ? new Date(dateStr).getTime() : 0;

  return { slug, title, dateStr, dateFormatted: dateStr ? formatDate(dateStr) : '', bodyRaw, bodyHtml: md.parse(bodyRaw), excerpt, sortDate };
}

/* ── Blog State ── */
const Blog = {
  articles: [],
  currentSlug: null,

  async init() {
    // Load article index
    await this.loadArticles();
    this.renderList();
    this.bindNav();
    this.initScrollReveal();
    this.initNavbar();

    // Handle hash navigation
    const hash = window.location.hash.slice(1);
    if (hash && hash !== 'blog') {
      const art = this.articles.find(a => a.slug === hash);
      if (art) this.openArticle(art.slug, false);
    }

    window.addEventListener('popstate', () => {
      const h = window.location.hash.slice(1);
      if (!h || h === 'blog') {
        this.showList();
      } else {
        const art = this.articles.find(a => a.slug === h);
        if (art) this.openArticle(art.slug, false);
      }
    });
  },

  async loadArticles() {
    // Try to fetch the manifest first, then fall back to individual loading
    // Admin drops .md files in /posts/ — we fetch a manifest or scan known files
    let files = [];
    
    try {
      const r = await fetch('posts/index.json');
      if (r.ok) {
        files = await r.json();
      }
    } catch(e) {}

    if (!files.length) {
      // Fallback: try to fetch a directory listing or use known files
      // In a real server with directory listing enabled:
      try {
        const r = await fetch('posts/');
        if (r.ok) {
          const html = await r.text();
          const matches = [...html.matchAll(/href="([^"]+\.md)"/g)];
          files = matches.map(m => m[1]);
        }
      } catch(e) {}
    }

    // Load each file
    const results = await Promise.allSettled(
      files.map(async (fname) => {
        const name = fname.split('/').pop();
        const r = await fetch(`posts/${name}`);
        if (!r.ok) throw new Error(`Failed to load ${name}`);
        const content = await r.text();
        return parseArticleFile(name, content);
      })
    );

    this.articles = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.sortDate - a.sortDate);
  },

  renderList() {
    const container = document.getElementById('articles-container');
    const count = document.getElementById('articles-count');
    if (!container) return;

    count.textContent = `${this.articles.length} article${this.articles.length !== 1 ? 's' : ''}`;

    if (!this.articles.length) {
      container.innerHTML = `
        <div class="blog-empty">
          <h3>Aucun article pour l'instant</h3>
          <p>Les articles apparaîtront ici dès qu'un fichier .md sera ajouté dans le dossier <code>posts/</code>.</p>
        </div>`;
      return;
    }

    container.innerHTML = this.articles.map((art, i) => `
      <a class="article-card reveal${i > 0 ? ` reveal-delay-${Math.min(i, 3)}` : ''}" 
         data-slug="${art.slug}" 
         href="#${art.slug}">
        <div class="article-meta">
          <span class="article-date">${art.dateFormatted}</span>
        </div>
        <h2 class="article-title">${art.title}</h2>
        <p class="article-excerpt">${art.excerpt}</p>
        <span class="article-read-more">
          Lire l'article
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </span>
      </a>
    `).join('');

    // Bind clicks
    container.querySelectorAll('.article-card').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.openArticle(el.dataset.slug);
      });
    });

    setTimeout(() => this.initScrollReveal(), 50);
  },

  openArticle(slug, pushState = true) {
    const art = this.articles.find(a => a.slug === slug);
    if (!art) return;

    this.currentSlug = slug;

    const page = document.getElementById('article-page');
    const listView = document.getElementById('blog-list-view');
    const titleEl = document.getElementById('article-title');
    const dateEl = document.getElementById('article-date');
    const bodyEl = document.getElementById('article-body');

    titleEl.textContent = art.title;
    dateEl.textContent = art.dateFormatted;
    bodyEl.innerHTML = art.bodyHtml;

    listView.classList.add('hidden');
    page.classList.add('visible');

    if (pushState) {
      window.history.pushState({ slug }, '', `#${slug}`);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = `${art.title} — Deblock Studios Blog`;
  },

  showList() {
    const page = document.getElementById('article-page');
    const listView = document.getElementById('blog-list-view');

    page.classList.remove('visible');
    listView.classList.remove('hidden');
    this.currentSlug = null;
    document.title = 'Blog — Deblock Studios';
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  bindNav() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.history.pushState({}, '', '#blog');
        this.showList();
      });
    }

    // Hamburger
    const hamburger = document.getElementById('hamburger-btn');
    const drawer = document.getElementById('nav-drawer');
    if (hamburger && drawer) {
      hamburger.addEventListener('click', () => {
        const open = drawer.classList.toggle('open');
        hamburger.setAttribute('aria-expanded', open);
      });
    }
  },

  initNavbar() {
    const navbar = document.getElementById('navbar');
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  },

  initScrollReveal() {
    const els = document.querySelectorAll('.reveal:not(.visible)');
    if (!els.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    els.forEach(el => obs.observe(el));
  }
};

document.addEventListener('DOMContentLoaded', () => Blog.init());
