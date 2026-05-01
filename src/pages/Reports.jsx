import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, Plus, Search, Eye, Trash2, RefreshCw,
    ChevronLeft, ChevronRight, BarChart2, CheckCircle, Clock,
    AlertCircle, BookOpen, TrendingUp, Layers, XCircle, Edit,
    Sparkles, X, Send, Copy, RotateCcw, Bot
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

const STATUS_CONFIG = {
    draft:     { badge: 'badge-gray',    icon: Clock,         label: 'Draft',          color: '#6c757d', bg: '#f0f0f0' },
    pending:   { badge: 'badge-warning', icon: Clock,         label: 'Pending Review', color: '#856404', bg: '#fff3cd' },
    reviewing: { badge: 'badge-info',    icon: RefreshCw,     label: 'Under Review',   color: '#004085', bg: '#cce5ff' },
    approved:  { badge: 'badge-success', icon: CheckCircle,   label: 'Approved',       color: '#155724', bg: '#d4edda' },
    rejected:  { badge: 'badge-danger',  icon: AlertCircle,   label: 'Rejected',       color: '#721c24', bg: '#f8d7da' },
};

const PAGE_SIZE = 12;

function isNewsletter(r) {
    return r.description && r.description.startsWith('[newsletter]');
}

/* ──────────────────────────────────────────────
   Simple Markdown → JSX Renderer
   ────────────────────────────────────────────── */
function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let keyCount = 0;

    lines.forEach((line) => {
        const k = keyCount++;
        if (line.startsWith('## ')) {
            elements.push(
                <div key={k} style={{ marginTop: 20, marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #e0e7ff' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#3730a3', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {line.replace('## ', '')}
                    </h3>
                </div>
            );
        } else if (line.startsWith('### ')) {
            elements.push(
                <h4 key={k} style={{ margin: '12px 0 4px', fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>
                    {line.replace('### ', '')}
                </h4>
            );
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            const content = line.replace(/^[-*] /, '');
            elements.push(
                <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ color: '#6366f1', fontWeight: 700, marginTop: 2, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                    />
                </div>
            );
        } else if (line.trim() === '') {
            elements.push(<div key={k} style={{ height: 6 }} />);
        } else {
            elements.push(
                <p key={k} style={{ margin: '0 0 6px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                />
            );
        }
    });
    return <>{elements}</>;
}

export default function Reports() {
    const navigate = useNavigate();
    const [allData, setAllData]       = useState([]);   // full unfiltered set for metrics
    const [rows, setRows]             = useState([]);   // paginated rows
    const [loading, setLoading]       = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [activeTab, setActiveTab]   = useState('all'); // 'all' | 'analysis' | 'newsletter'
    const [page, setPage]             = useState(1);
    const [total, setTotal]           = useState(0);
    const [deleteId, setDeleteId]     = useState(null);
    const [deleting, setDeleting]     = useState(false);
    const [metrics, setMetrics]       = useState({ total: 0, approved: 0, pending: 0, rejected: 0, draft: 0, articles: 0, newsletters: 0, analyses: 0 });



    /* ── Fetch summary metrics across ALL records ── */
    const fetchMetrics = useCallback(async () => {
        const { data } = await supabase
            .from('reports')
            .select('status, article_count, description');
        if (!data) return;
        const m = { total: data.length, approved: 0, pending: 0, rejected: 0, draft: 0, articles: 0, newsletters: 0, analyses: 0 };
        data.forEach(r => {
            m.articles += (r.article_count || 0);
            if (r.status === 'approved') m.approved++;
            else if (r.status === 'rejected') m.rejected++;
            else if (r.status === 'pending') m.pending++;
            else m.draft++;
            // newsletters have description starting with [newsletter]
            // analysis reports have null OR non-[newsletter] description
            if (isNewsletter(r)) m.newsletters++; else m.analyses++;
        });
        setMetrics(m);
    }, []);

    /* ── Fetch paginated rows ── */
    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('reports')
                .select('id, title, description, client_name, period_start, period_end, article_count, ai_score, status, created_at, report_articles(count)', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

            if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);
            if (filterStatus) query = query.eq('status', filterStatus);
            if (activeTab === 'newsletter') {
                // Only rows where description starts with [newsletter]
                query = query.like('description', '[newsletter]%');
            }
            if (activeTab === 'analysis') {
                // Rows where description is NULL OR does NOT start with [newsletter]
                // Using .or() to handle NULL descriptions correctly
                query = query.or('description.is.null,description.not.like.[newsletter]%');
            }

            const { data, error, count } = await query;
            if (error) throw error;
            setRows(data || []);
            setTotal(count || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, filterStatus, activeTab, page]);

    useEffect(() => { fetchMetrics(); }, [fetchMetrics]);
    useEffect(() => { setPage(1); }, [searchTerm, filterStatus, activeTab]);
    useEffect(() => { fetchRows(); }, [fetchRows]);



    const handleDelete = async (id) => {
        setDeleting(true);
        try {
            await supabase.from('report_articles').delete().eq('report_id', id);
            await supabase.from('reports').delete().eq('id', id);
            setDeleteId(null);
            fetchRows();
            fetchMetrics();
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);

    /* ── Metric card ── */
    const MetricCard = ({ icon: Icon, label, value, color, bg, onClick }) => (
        <div
            onClick={onClick}
            style={{
                background: bg || '#fff',
                border: `1px solid ${color}30`,
                borderRadius: 10,
                padding: '18px 22px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flex: 1,
                minWidth: 140,
                cursor: onClick ? 'pointer' : 'default',
                transition: 'box-shadow 0.15s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)')}
            onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
        >
            <div style={{ background: color + '20', borderRadius: 8, padding: 10, display: 'flex' }}>
                <Icon size={20} color={color} />
            </div>
            <div>
                <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>{label}</div>
            </div>
        </div>
    );

    /* ── Status badge ── */
    const StatusBadge = ({ status }) => {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
        return (
            <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <cfg.icon size={10} /> {cfg.label}
            </span>
        );
    };

    /* ── Type badge ── */
    const TypeBadge = ({ row }) => {
        const nl = isNewsletter(row);
        return (
            <span style={{
                background: nl ? '#e8f4fd' : '#f0f4ff',
                color: nl ? '#1a6fa8' : '#3651a8',
                borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
                {nl ? <><BookOpen size={10} /> Newsletter</> : <><BarChart2 size={10} /> Analysis</>}
            </span>
        );
    };

    const tabs = [
        { key: 'all',        label: `All (${metrics.total})` },
        { key: 'analysis',   label: `Insight Briefs (${metrics.analyses})` },
        { key: 'newsletter', label: `Newsletters (${metrics.newsletters})` },
    ];

    return (
        <div>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <span className="breadcrumb-link" onClick={() => navigate('/')}>Home</span>
                <span className="breadcrumb-sep">/</span>
                <span>Insight Brief</span>
            </div>

            {/* Page Header */}
            <div className="page-header">
                <BarChart2 className="page-header-icon" size={22} />
                <h1>Insight Brief</h1>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => { fetchRows(); fetchMetrics(); }} title="Refresh">
                        <RefreshCw size={14} />
                    </button>
                    <button className="btn btn-primary btn-sm" style={{ display:'flex', alignItems:'center', gap:6 }} onClick={() => navigate('/reports/create')}>
                        <Plus size={14} /> Create Report
                    </button>
                </div>
            </div>

            {/* ── Metrics Row ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <MetricCard icon={Layers}       label="Total Records"      value={metrics.total}       color="#555b6e" bg="#f8f8f8" />
                <MetricCard icon={CheckCircle}  label="Approved"           value={metrics.approved}    color="#155724" bg="#eaf6ec"
                    onClick={() => { setFilterStatus('approved'); setActiveTab('all'); }} />
                <MetricCard icon={Clock}        label="Pending / Draft"    value={metrics.pending + metrics.draft} color="#856404" bg="#fffbf0"
                    onClick={() => { setFilterStatus('draft'); setActiveTab('all'); }} />
                <MetricCard icon={XCircle}      label="Rejected"           value={metrics.rejected}    color="#721c24" bg="#fdf0f0"
                    onClick={() => { setFilterStatus('rejected'); setActiveTab('all'); }} />
                <MetricCard icon={TrendingUp}   label="Total Articles"     value={metrics.articles}    color="#004085" bg="#eef4ff" />
                <MetricCard icon={BookOpen}     label="Newsletters"        value={metrics.newsletters} color="#1a6fa8" bg="#e8f4fd"
                    onClick={() => { setActiveTab('newsletter'); setFilterStatus(''); }} />
                <MetricCard icon={BarChart2}    label="Insight Briefs"   value={metrics.analyses}    color="#3651a8" bg="#f0f4ff"
                    onClick={() => { setActiveTab('analysis'); setFilterStatus(''); }} />
            </div>

            {/* ── Table Container ── */}
            <div className="table-container">
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-gray-200)', padding: '0 20px', gap: 4 }}>
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => { setActiveTab(t.key); setFilterStatus(''); setSearchTerm(''); }}
                            style={{
                                padding: '10px 18px',
                                border: 'none',
                                borderBottom: activeTab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                                background: 'none',
                                color: activeTab === t.key ? 'var(--color-primary)' : 'var(--color-gray-500)',
                                fontWeight: activeTab === t.key ? 700 : 400,
                                fontSize: 13,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                            }}
                        >{t.label}</button>
                    ))}
                </div>

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
                        {filterStatus && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setFilterStatus('')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <XCircle size={12} /> Clear Filter
                            </button>
                        )}
                        <select
                            className="form-select"
                            style={{ minWidth: 160, padding: '7px 12px' }}
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <option value="">All Statuses</option>
                            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="loading-wrapper">
                        <div className="spinner" />
                        <span>Loading...</span>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">
                        <FileText size={48} />
                        <h3>No Records Found</h3>
                        <p>Create an insight brief or newsletter to get started.</p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
                            <button className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:6 }} onClick={() => navigate('/reports/create')}>
                                <Plus size={14} /> Create Report
                            </button>
                            <button className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:6 }} onClick={() => navigate('/newsletters/create')}>
                                <Plus size={14} /> Create Newsletter
                            </button>
                        </div>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Title</th>
                                <th>Type</th>
                                <th>Client</th>
                                <th>Period</th>
                                <th>Articles</th>
                                <th>AI Score</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((report, i) => {
                                const nl = isNewsletter(report);
                                return (
                                    <tr key={report.id}>
                                        <td style={{ color: 'var(--color-gray-400)', fontSize: 12 }}>
                                            {(page - 1) * PAGE_SIZE + i + 1}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--color-gray-800)', maxWidth: 240 }}>{report.title}</div>
                                            {report.description && !nl && (
                                                <div style={{ fontSize: 11.5, color: 'var(--color-gray-400)', marginTop: 2, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {report.description}
                                                </div>
                                            )}
                                        </td>
                                        <td><TypeBadge row={report} /></td>
                                        <td style={{ fontWeight: 500, fontSize: 13 }}>{report.client_name || '—'}</td>
                                        <td style={{ fontSize: 12 }}>
                                            {report.period_start && report.period_end ? (
                                                <span>
                                                    {format(new Date(report.period_start), 'dd MMM yy')} –<br />
                                                    {format(new Date(report.period_end), 'dd MMM yy')}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 15 }}>
                                                {report.report_articles?.[0]?.count ?? report.article_count ?? '—'}
                                            </span>
                                        </td>
                                        <td>
                                            {report.ai_score != null ? (
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: 14, color: report.ai_score >= 75 ? 'var(--color-success)' : report.ai_score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                                                        {report.ai_score}%
                                                    </div>
                                                    <div className="progress-bar" style={{ width: 56 }}>
                                                        <div className={`progress-fill ${report.ai_score >= 75 ? 'high' : report.ai_score >= 50 ? 'medium' : 'low'}`}
                                                            style={{ width: `${report.ai_score}%` }} />
                                                    </div>
                                                </div>
                                            ) : <span style={{ color: 'var(--color-gray-300)', fontSize: 12 }}>—</span>}
                                        </td>
                                        <td><StatusBadge status={report.status} /></td>
                                        <td style={{ fontSize: 12 }}>
                                            {report.created_at ? format(new Date(report.created_at), 'dd MMM yyyy') : '—'}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                {nl ? (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        title="Edit Newsletter"
                                                        onClick={() => navigate(`/newsletters/${report.id}`)}
                                                    >
                                                        <Edit size={12} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        title="View & Review"
                                                        onClick={() => navigate(`/reports/${report.id}`)}
                                                    >
                                                        <Eye size={12} />
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    title="Delete"
                                                    onClick={() => setDeleteId(report.id)}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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
                            <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>
                        ))}
                        <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Modal */}
            {deleteId && (
                <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                    <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><Trash2 size={18} /> Delete Record</h2>
                            <button className="modal-close" onClick={() => setDeleteId(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--color-gray-600)', lineHeight: 1.6 }}>
                                Are you sure? This will permanently delete this record and all its linked articles. This action <strong>cannot be undone</strong>.
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

        </div>
    );
}
