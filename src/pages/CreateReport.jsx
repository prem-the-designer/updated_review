import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, Plus, Search, Trash2, CheckCircle, ArrowLeft, BarChart2,
    Calendar, AlertCircle, X, GripVertical
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

export default function CreateReport() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errors, setErrors] = useState({});

    // Report form
    const [form, setForm] = useState({
        title: '',
        client_name: '',
        description: '',
        period_start: '',
        period_end: '',
        report_type: 'weekly',
        notes: '',
    });

    // Articles
    const [allArticles, setAllArticles] = useState([]);
    const [selectedArticles, setSelectedArticles] = useState([]);
    const [articleSearch, setArticleSearch] = useState('');
    const [loadingArticles, setLoadingArticles] = useState(false);
    const [articlePage, setArticlePage] = useState(0);
    const PAGE = 20;

    const fetchArticles = useCallback(async () => {
        setLoadingArticles(true);
        try {
            let query = supabase
                .from('articles')
                .select('id, heading, published_date, content_type, content_categories')
                .order('published_date', { ascending: false })
                .range(articlePage * PAGE, (articlePage + 1) * PAGE - 1);

            if (articleSearch) query = query.ilike('heading', `%${articleSearch}%`);

            const { data, error } = await query;
            if (error) throw error;
            setAllArticles(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingArticles(false);
        }
    }, [articleSearch, articlePage]);

    useEffect(() => { setArticlePage(0); }, [articleSearch]);
    useEffect(() => { fetchArticles(); }, [fetchArticles]);

    const validate = () => {
        const e = {};
        if (!form.title.trim()) e.title = 'Report title is required';
        if (!form.client_name.trim()) e.client_name = 'Client name is required';
        if (!form.period_start) e.period_start = 'Start date is required';
        if (!form.period_end) e.period_end = 'End date is required';
        if (selectedArticles.length === 0) e.articles = 'Please add at least one article';
        return e;
    };

    const toggleArticle = (article) => {
        setSelectedArticles(prev => {
            const exists = prev.find(a => a.id === article.id);
            if (exists) return prev.filter(a => a.id !== article.id);
            return [...prev, article];
        });
    };

    const isSelected = (id) => selectedArticles.some(a => a.id === id);

    const handleChange = (field, val) => {
        setForm(prev => ({ ...prev, [field]: val }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length) { setErrors(errs); return; }

        setSubmitting(true);
        try {
            // Create report
            const { data: reportData, error: reportErr } = await supabase
                .from('reports')
                .insert([{
                    title: form.title.trim(),
                    client_name: form.client_name.trim(),
                    description: form.description.trim() || null,
                    period_start: form.period_start,
                    period_end: form.period_end,
                    report_type: form.report_type,
                    notes: form.notes.trim() || null,
                    status: 'draft',
                    article_count: selectedArticles.length,
                }])
                .select()
                .single();

            if (reportErr) throw reportErr;

            // Link articles
            const links = selectedArticles.map((a, idx) => ({
                report_id: reportData.id,
                article_id: a.id,
                order_index: idx,
            }));
            const { error: linkErr } = await supabase.from('report_articles').insert(links);
            if (linkErr) throw linkErr;

            setSuccess(true);
            setTimeout(() => navigate(`/reports/${reportData.id}`), 1800);
        } catch (err) {
            console.error(err);
            setErrors({ submit: err.message || 'Failed to create report' });
        } finally {
            setSubmitting(false);
        }
    };

    const REPORT_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'custom'];

    return (
        <div>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <span className="breadcrumb-link" onClick={() => navigate('/')}>Home</span>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-link" onClick={() => navigate('/reports')}>Reports</span>
                <span className="breadcrumb-sep">/</span>
                <span>Create Report</span>
            </div>

            {/* Page Header */}
            <div className="page-header">
                <BarChart2 className="page-header-icon" size={22} />
                <h1>Create Insight Brief</h1>
            </div>

            {success && (
                <div className="alert alert-success">
                    <CheckCircle size={16} />
                    Report created! Redirecting to review page...
                </div>
            )}

            {errors.submit && (
                <div className="alert alert-error">
                    <AlertCircle size={16} />
                    {errors.submit}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }}>

                    {/* Left: Report Details */}
                    <div>
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div className="section-title"><FileText size={16} /> Report Information</div>

                            <div className="form-group">
                                <label className="form-label required">Report Title</label>
                                <input
                                    className="form-input"
                                    placeholder="e.g. J&J Japan Weekly Analysis"
                                    value={form.title}
                                    onChange={e => handleChange('title', e.target.value)}
                                />
                                {errors.title && <span className="form-error">{errors.title}</span>}
                            </div>

                            <div className="form-group">
                                <label className="form-label required">Client Name</label>
                                <input
                                    className="form-input"
                                    placeholder="e.g. J&J Innovative Medicine"
                                    value={form.client_name}
                                    onChange={e => handleChange('client_name', e.target.value)}
                                />
                                {errors.client_name && <span className="form-error">{errors.client_name}</span>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Report Type</label>
                                <select className="form-select" value={form.report_type} onChange={e => handleChange('report_type', e.target.value)}>
                                    {REPORT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label required">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> Period Start</span>
                                    </label>
                                    <input className="form-input" type="date" value={form.period_start} onChange={e => handleChange('period_start', e.target.value)} />
                                    {errors.period_start && <span className="form-error">{errors.period_start}</span>}
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label required">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> Period End</span>
                                    </label>
                                    <input className="form-input" type="date" value={form.period_end} onChange={e => handleChange('period_end', e.target.value)} />
                                    {errors.period_end && <span className="form-error">{errors.period_end}</span>}
                                </div>
                            </div>

                            <div className="form-group" style={{ marginTop: 14 }}>
                                <label className="form-label">Description</label>
                                <textarea className="form-textarea" rows={2} placeholder="Brief description of this report..." value={form.description} onChange={e => handleChange('description', e.target.value)} />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Internal Notes</label>
                                <textarea className="form-textarea" rows={2} placeholder="Notes for reviewers..." value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
                            </div>
                        </div>

                        {/* Selected Articles Summary */}
                        <div className="card">
                            <div className="section-title" style={{ justifyContent: 'space-between' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileText size={16} /> Selected Articles
                                </span>
                                <span style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 700 }}>
                                    {selectedArticles.length}
                                </span>
                            </div>

                            {errors.articles && (
                                <div className="alert alert-error" style={{ marginBottom: 12 }}>
                                    <AlertCircle size={14} /> {errors.articles}
                                </div>
                            )}

                            {selectedArticles.length === 0 ? (
                                <p style={{ color: 'var(--color-gray-400)', fontSize: 13.5, textAlign: 'center', padding: '16px 0' }}>
                                    No articles selected. Use the picker on the right.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                                    {selectedArticles.map((a, idx) => (
                                        <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-gray-200)' }}>
                                            <GripVertical size={14} style={{ color: 'var(--color-gray-300)', marginTop: 2 }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-gray-800)', lineHeight: 1.3 }}>{a.heading}</div>
                                                <div style={{ fontSize: 11.5, color: 'var(--color-gray-400)', marginTop: 2 }}>{a.content_type?.replace(/_/g, ' ')}</div>
                                            </div>
                                            <button type="button" onClick={() => toggleArticle(a)} style={{ color: 'var(--color-danger)', padding: 2, borderRadius: 4, transition: 'background 0.15s' }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Article Picker */}
                    <div className="card">
                        <div className="section-title"><Search size={16} /> Add Articles to Report</div>

                        <div className="table-search" style={{ marginBottom: 14 }}>
                            <Search size={15} />
                            <input
                                placeholder="Search articles..."
                                value={articleSearch}
                                onChange={e => setArticleSearch(e.target.value)}
                            />
                        </div>

                        {loadingArticles ? (
                            <div className="loading-wrapper" style={{ padding: 30 }}>
                                <div className="spinner" />
                            </div>
                        ) : allArticles.length === 0 ? (
                            <div className="empty-state" style={{ padding: 30 }}>
                                <FileText size={32} />
                                <p>No articles found. <span className="breadcrumb-link" onClick={() => navigate('/articles/add')}>Add some first.</span></p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
                                {allArticles.map(article => {
                                    const selected = isSelected(article.id);
                                    return (
                                        <div
                                            key={article.id}
                                            onClick={() => toggleArticle(article)}
                                            style={{
                                                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                                                border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                                                borderRadius: 'var(--radius-md)',
                                                background: selected ? 'var(--color-primary-light)' : 'var(--color-white)',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <div style={{
                                                width: 20, height: 20, flexShrink: 0, borderRadius: 4,
                                                border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-gray-300)'}`,
                                                background: selected ? 'var(--color-primary)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                marginTop: 1, transition: 'all 0.15s',
                                            }}>
                                                {selected && <CheckCircle size={12} color="white" />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13.5, fontWeight: selected ? 600 : 400, color: 'var(--color-gray-800)', lineHeight: 1.35 }}>
                                                    {article.heading}
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span style={{ fontSize: 11.5, color: 'var(--color-gray-500)' }}>{article.content_type?.replace(/_/g, ' ')}</span>
                                                    {article.content_categories?.[0] && (
                                                        <span style={{ fontSize: 10.5, background: 'var(--color-gray-100)', color: 'var(--color-gray-500)', padding: '1px 7px', borderRadius: 10 }}>
                                                            {article.content_categories[0].replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    {article.published_date && (
                                                        <span style={{ fontSize: 11, color: 'var(--color-gray-400)' }}>
                                                            {format(new Date(article.published_date), 'dd MMM yyyy')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Article Pagination */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                            <button type="button" className="btn btn-secondary btn-sm" disabled={articlePage === 0} onClick={() => setArticlePage(p => p - 1)}>
                                ← Prev
                            </button>
                            <span style={{ fontSize: 12, color: 'var(--color-gray-400)' }}>Page {articlePage + 1}</span>
                            <button type="button" className="btn btn-secondary btn-sm" disabled={allArticles.length < PAGE} onClick={() => setArticlePage(p => p + 1)}>
                                Next →
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, padding: '16px 24px', background: 'var(--color-white)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray-200)' }}>
                    <div style={{ fontSize: 13.5, color: 'var(--color-gray-600)' }}>
                        <strong>{selectedArticles.length}</strong> articles selected for this report
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/reports')}>
                            <ArrowLeft size={15} /> Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? (
                                <><span className="spinner spinner-sm" /> Creating...</>
                            ) : (
                                <><Plus size={15} /> Create Report</>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
