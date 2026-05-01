import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Plus, Search, Trash2, FileText, RefreshCw, ExternalLink, Tag, Calendar, ChevronLeft, ChevronRight, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import EditArticleModal from '../components/EditArticleModal';

const SENTIMENT_BADGE = {
    Positive: 'badge-success',
    Neutral: 'badge-info',
    Negative: 'badge-danger',
};

// Removed hardcoded PAGE_SIZE to use dynamic state

export default function ViewArticles() {
    const navigate = useNavigate();
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [filterSent, setFilterSent] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(15);
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [editingArticle, setEditingArticle] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkDelete, setBulkDelete] = useState(false);

    const fetchArticles = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('articles')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range((page - 1) * pageSize, page * pageSize - 1);

            if (searchTerm) query = query.ilike('heading', `%${searchTerm}%`);
            if (filterCat) query = query.contains('content_categories', [filterCat]);
            if (filterSent) query = query.eq('sentiment', filterSent);

            const { data, error, count } = await query;
            if (error) throw error;
            setArticles(data || []);
            setTotal(count || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, filterCat, filterSent, page, pageSize]);

    useEffect(() => {
        setPage(1);
        setSelectedIds([]);
    }, [searchTerm, filterCat, filterSent, pageSize]);

    useEffect(() => {
        fetchArticles();
        setSelectedIds([]);
    }, [fetchArticles]);

    const handleDelete = async (id) => {
        setDeleting(true);
        try {
            await supabase.from('articles').delete().eq('id', id);
            setDeleteId(null);
            setSelectedIds(prev => prev.filter(pId => pId !== id));
            fetchArticles();
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        setDeleting(true);
        try {
            await supabase.from('articles').delete().in('id', selectedIds);
            setSelectedIds([]);
            setBulkDelete(false);
            fetchArticles();
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <span className="breadcrumb-link" onClick={() => navigate('/')}>Home</span>
                <span className="breadcrumb-sep">/</span>
                <span>Articles</span>
            </div>

            {/* Page Header */}
            <div className="page-header">
                <FileText className="page-header-icon" size={22} />
                <h1>View Articles</h1>
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/articles/add')}>
                        <Plus size={14} /> Add Article
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                {/* Toolbar */}
                <div className="table-toolbar">
                    <div className="table-search">
                        <Search size={15} />
                        <input
                            placeholder="Search by title..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <select
                            className="form-select"
                            style={{ minWidth: 140, padding: '7px 12px' }}
                            value={filterCat}
                            onChange={e => setFilterCat(e.target.value)}
                        >
                            <option value="">All Categories</option>
                            {[
                                'corporate', 'finance', 'cardiovascular_metabolism', 'immunology',
                                'infectious_diseases_vaccines', 'neuroscience', 'oncology',
                                'pulmonary_hypertension', 'pharma_trends', 'drug_pricing',
                                'politics_policy', 'regulatory', 'rnd'
                            ].map(c => (
                                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                        <select
                            className="form-select"
                            style={{ minWidth: 130, padding: '7px 12px' }}
                            value={filterSent}
                            onChange={e => setFilterSent(e.target.value)}
                        >
                            <option value="">All Sentiments</option>
                            <option value="Positive">Positive</option>
                            <option value="Neutral">Neutral</option>
                            <option value="Negative">Negative</option>
                        </select>
                        <select
                            className="form-select"
                            style={{ minWidth: 90, padding: '7px 12px' }}
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            title="Rows per page"
                        >
                            {[15, 50, 100, 500, 1000].map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={fetchArticles} title="Refresh">
                            <RefreshCw size={14} />
                        </button>
                        {selectedIds.length > 0 && (
                            <button className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setBulkDelete(true)}>
                                <Trash2 size={13} /> Delete ({selectedIds.length})
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Row */}
                {!loading && (
                    <div style={{ padding: '8px 20px', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)', fontSize: 12.5, color: 'var(--color-gray-500)' }}>
                        Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of <strong>{total}</strong> articles
                    </div>
                )}

                {loading ? (
                    <div className="loading-wrapper">
                        <div className="spinner" />
                        <span>Loading articles...</span>
                    </div>
                ) : articles.length === 0 ? (
                    <div className="empty-state">
                        <FileText size={48} />
                        <h3>No Articles Found</h3>
                        <p>{searchTerm || filterCat ? 'Try adjusting your filters.' : 'No articles yet.'}</p>
                        <button className="btn btn-primary mt-4" onClick={() => navigate('/articles/add')}>
                            <Plus size={14} /> Add First Article
                        </button>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>
                                    <input 
                                        type="checkbox" 
                                        checked={articles.length > 0 && selectedIds.length === articles.length}
                                        onChange={e => {
                                            if (e.target.checked) setSelectedIds(articles.map(a => a.id));
                                            else setSelectedIds([]);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th>#</th>
                                <th>Title</th>
                                <th>Source</th>
                                <th>Category</th>
                                <th>Sentiment</th>
                                <th>Language</th>
                                <th>Date</th>
                                <th>Words</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {articles.map((article, i) => (
                                <tr key={article.id}>
                                    <td>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.includes(article.id)}
                                            onChange={e => {
                                                if (e.target.checked) setSelectedIds([...selectedIds, article.id]);
                                                else setSelectedIds(selectedIds.filter(id => id !== article.id));
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ color: 'var(--color-gray-400)', fontSize: 12 }}>
                                        {(page - 1) * pageSize + i + 1}
                                    </td>
                                    <td style={{ maxWidth: 300 }}>
                                        <div style={{ fontWeight: 500, color: 'var(--color-gray-800)', lineHeight: 1.4 }}>
                                            {article.heading}
                                        </div>
                                        {article.tags?.length > 0 && (
                                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                                {article.tags.slice(0, 3).map((t, ti) => (
                                                    <span key={ti} style={{ fontSize: 10, background: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '1px 7px', borderRadius: 10, fontWeight: 500 }}>
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{article.source || 'Unknown'}</div>
                                        {article.article_url && (
                                            <a href={article.article_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <ExternalLink size={10} /> Link
                                            </a>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {article.content_categories?.map(cat => (
                                                <span key={cat} className="badge badge-gray" style={{ fontSize: 10 }}>
                                                    {cat.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                            {(!article.content_categories || article.content_categories.length === 0) && '—'}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${SENTIMENT_BADGE[article.sentiment] || 'badge-gray'}`}>
                                            {article.sentiment}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 13 }}>{article.language}</td>
                                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Calendar size={11} />
                                            {article.published_date ? format(new Date(article.published_date), 'dd MMM yyyy') : '—'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 12.5 }}>{article.word_count?.toLocaleString() || '—'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => navigate(`/articles/${article.id}`)}
                                                title="View"
                                            >
                                                <Eye size={13} />
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setEditingArticle(article)}
                                                title="Edit"
                                            >
                                                <Edit size={13} />
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => setDeleteId(article.id)}
                                                title="Delete"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--color-gray-200)' }}>
                        <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft size={14} />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                            <button
                                key={p}
                                className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setPage(p)}
                            >
                                {p}
                            </button>
                        ))}
                        <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Confirm Modal */}
            {deleteId && (
                <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                    <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><Trash2 size={18} /> Delete Article</h2>
                            <button className="modal-close" onClick={() => setDeleteId(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--color-gray-600)', lineHeight: 1.6 }}>
                                Are you sure you want to delete this article? This action <strong>cannot be undone</strong>.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
                            <button className="btn btn-danger" disabled={deleting} onClick={() => handleDelete(deleteId)}>
                                {deleting ? <><span className="spinner spinner-sm" /> Deleting...</> : <><Trash2 size={14} /> Delete</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirm Modal */}
            {bulkDelete && (
                <div className="modal-overlay" onClick={() => setBulkDelete(false)}>
                    <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><Trash2 size={18} /> Bulk Delete Articles</h2>
                            <button className="modal-close" onClick={() => setBulkDelete(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--color-gray-600)', lineHeight: 1.6 }}>
                                Are you sure you want to delete <strong>{selectedIds.length}</strong> selected articles? This action <strong>cannot be undone</strong>.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setBulkDelete(false)}>Cancel</button>
                            <button className="btn btn-danger" disabled={deleting} onClick={handleBulkDelete}>
                                {deleting ? <><span className="spinner spinner-sm" /> Deleting...</> : <><Trash2 size={14} /> Delete Selected</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Article Modal */}
            {editingArticle && (
                <EditArticleModal 
                    article={editingArticle} 
                    onClose={() => setEditingArticle(null)} 
                    onSave={(updated) => {
                        setArticles(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
                        alert('Article updated successfully!');
                    }} 
                />
            )}
        </div>
    );
}
