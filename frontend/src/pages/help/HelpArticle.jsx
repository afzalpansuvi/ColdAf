import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../contexts/AuthContext';
import { findArticleBySlug, fetchArticle, getRelatedArticles, findArticleByFile } from './helpData';
import { articlesByCategory } from './manifest';
import { setMeta, setCanonical } from './seo';
import {
  BookOpen, ArrowLeft, Clock, Hash, Loader2, AlertTriangle, FileText
} from 'lucide-react';
import './helpMarkdown.css';

// Custom remark plugin: parse "Related Articles" section to make links clickable
function relatedArticlesPlugin() {
  return (tree) => {
    // Find the "Related Articles" heading and linkify the list items below it
    let inRelated = false;
    for (const node of tree.children || []) {
      if (node.type === 'heading' && node.depth === 2) {
        const text = node.children?.map(c => c.value || '').join('') || '';
        inRelated = text.toLowerCase().includes('related articles');
      }
      if (inRelated && node.type === 'list') {
        for (const item of node.children || []) {
          const textNode = item.children?.[0];
          if (textNode && textNode.type === 'paragraph') {
            const text = textNode.children?.map(c => c.value || '').join('') || '';
            // Find matching article by title
            for (const cat of Object.values(articlesByCategory)) {
              for (const art of cat) {
                if (text.toLowerCase().includes(art.title.toLowerCase())) {
                  textNode.children = [{
                    type: 'link',
                    url: `/help/${art.slug}`,
                    children: [{ type: 'text', value: art.title }]
                  }];
                  break;
                }
              }
            }
          }
        }
      }
    }
  };
}

export default function HelpArticle() {
  const { user, loading } = useAuth();
  const slug = window.location.pathname.split('/help/')[1];
  const [article, setArticle] = useState(null);
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(true);
  const [error, setError] = useState(null);

  const related = useMemo(() => article ? getRelatedArticles(article) : [], [article]);

  useEffect(() => {
    if (!slug) return;
    const found = findArticleBySlug(slug);
    if (!found) {
      setError('Article not found');
      setLoadingContent(false);
      return;
    }
    setArticle(found);
    setError(null);
    setLoadingContent(true);
    fetchArticle(found.file)
      .then(text => setContent(text))
      .catch(err => setError(err.message))
      .finally(() => setLoadingContent(false));
  }, [slug]);

  // Update document title + SEO meta
  useEffect(() => {
    if (article) {
      document.title = `${article.title} — ColdAF Help`;
      setMeta('description', `${article.title}. Step-by-step guide for ColdAF Email Tool (${article.category}).`);
      setCanonical(`https://coldaf.ataflexsolutions.com/help/${article.slug}`);
    } else {
      document.title = 'Help Center — ColdAF';
    }
  }, [article]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="w-10 h-10 text-gray-400" />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-800 mb-1">
            {error === 'Article not found' ? 'Article Not Found' : 'Something Went Wrong'}
          </h1>
          <p className="text-sm text-gray-500">
            {error === 'Article not found'
              ? 'The help article you\'re looking for doesn\'t exist.'
              : 'We couldn\'t load this article. Please try again.'}
          </p>
        </div>
        <Link to="/help" className="btn-primary btn-sm">
          Back to Help Center
        </Link>
      </div>
    );
  }

  // Extract meta from markdown content
  const lastUpdateMatch = content.match(/\*\*Last Update:\*\* (.+)/);
  const postIdMatch = content.match(/\*\*Post ID:\*\* (\d+)/);
  const lastUpdate = lastUpdateMatch ? lastUpdateMatch[1] : '—';
  const postId = postIdMatch ? postIdMatch[1] : '—';

  return (
    <div className="animate-fade-in">
      {/* Back + Breadcrumb */}
      <div className="mb-6">
        <Link
          to="/help"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Help Center
        </Link>
      </div>

      {/* Article card */}
      <div className="card card-accent-purple">
        {/* Meta */}
        <div className="help-meta">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <strong>Last Update:</strong> {lastUpdate}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            <strong>Post ID:</strong> {postId}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            <strong>Category:</strong> {article.category}
          </span>
        </div>

        {/* Loading state */}
        {loadingContent ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          </div>
        ) : (
          <div className="help-article-content">
            <ReactMarkdown
              components={{
                a: ({ node, href, children, ...props }) => {
                  // Internal help links
                  if (href && href.startsWith('/help/')) {
                    return <Link to={href} {...props}>{children}</Link>;
                  }
                  return <a href={href} {...props}>{children}</a>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Related Articles */}
      {related.length > 0 && (
        <div className="card mt-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-500" />
            Related Articles
          </h2>
          <div className="space-y-1">
            {related.map(art => (
              <Link
                key={art.id}
                to={`/help/${art.slug}`}
                className="block text-sm text-brand-600 hover:text-brand-700 hover:underline py-1 transition-colors"
              >
                {art.title}
                <span className="text-xs text-gray-400 ml-2">{art.category}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
