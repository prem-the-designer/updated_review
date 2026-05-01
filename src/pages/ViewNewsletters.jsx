import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Trash2, RefreshCw, Eye, Edit, Search, ChevronLeft, ChevronRight, ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

const PAGE_SIZE = 10;

export default function ViewNewsletters() {
    const navigate = useNavigate();
    const [newsletters, setNewsletters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [qaDetails, setQaDetails] = useState(null); // { newsletter_id, title, sessions: { batch_id: logs } }
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [loadingQA, setLoadingQA] = useState(false);
    const [approving, setApproving] = useState(false);

    const fetchNewsletters = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('reports')
                .select(`
                    id, 
                    title, 
                    article_count, 
                    created_at, 
                    period_start, 
                    period_end, 
                    notes, 
                    status, 
                    newsletter_quality_stats (
                        quality_score, 
                        total_errors, 
                        critical_errors, 
                        warning_errors
                    )
                `, { count: 'exact' })
                .like('description', '[newsletter]%')
                .order('created_at', { ascending: false })
                .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

            if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);

            const { data, error, count } = await query;
            if (error) {
                // If the error is about a missing relation, it means the user hasn't run the QA schema SQL yet
                if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                    console.error('QA Schema Missing: Please run the content of qa_schema.sql in your Supabase SQL Editor.');
                }
                throw error;
            }
            setNewsletters(data || []);
            setTotal(count || 0);
        } catch (err) {
            console.error('Fetch newsletters error:', err);
            // Optionally set an error state to show in UI
        } finally {
            setLoading(false);
        }
    }, [page, searchTerm]);

    const handleApprove = async (reportId) => {
        // Temporarily bypassing confirm to rule out popup blocking
        try {
            setApproving(true);
            console.log(`[Dashboard] Attempting to approve newsletter ID: ${reportId}`);
            const { data, error } = await supabase
                .from('reports')
                .update({ status: 'approved' })
                .eq('id', reportId)
                .select();
            
            console.log('[Dashboard] Update result:', { data, error });
            if (error) throw error;
            
            if (!data || data.length === 0) {
                console.warn('[Dashboard] No rows were updated. Check if ID matches.');
            }

            console.log('[Dashboard] Refreshing newsletters...');
            await fetchNewsletters();
            setQaDetails(null);
            alert('Newsletter marked as Approved (Status: approved)!');
        } catch (err) {
            console.error('[Dashboard] Approval error:', err);
            alert('Failed to approve: ' + err.message);
        } finally {
            setApproving(false);
        }
    };

    useEffect(() => { setPage(1); }, [searchTerm]);
    useEffect(() => { fetchNewsletters(); }, [fetchNewsletters]);

    const handleDelete = async (id) => {
        setDeleting(true);
        try {
            await supabase.from('report_articles').delete().eq('report_id', id);
            await supabase.from('reports').delete().eq('id', id);
            setDeleteId(null);
            fetchNewsletters();
        } catch (err) {
            console.error('Delete error:', err);
        } finally {
            setDeleting(false);
        }
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div style={{ backgroundColor: '#fff', minHeight: 'calc(100vh - 60px)' }}>
            {/* Header Bar */}
            <div style={{
                padding: '12px 24px',
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8f9fa'
            }}>
                <button
                    style={{ background: '#9fa3a7', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => navigate('/')}
                >
                    ← Back to Dashboard
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#337ab7', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <Users size={16} /> VIEW NEWSLETTERS - J&J INNOVATIVE MEDICINE
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        style={{ background: '#337ab7', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                        onClick={() => navigate('/newsletters/create')}
                    >
                        + Create New
                    </button>
                    <button
                        style={{ background: '#d9534f', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: deleteId ? 1 : 0.7 }}
                        onClick={() => { /* bulk delete if needed */ }}
                    >
                        Delete
                    </button>
                </div>
            </div>

            {/* Toolbar: Search + Pagination */}
            <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
                {/* Pagination buttons */}
                <div style={{ display: 'flex', fontSize: 13 }}>
                    <button
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        style={pageBtnStyle(false)}
                    >First</button>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{ ...pageBtnStyle(false), borderLeft: 'none' }}
                    >Previous</button>
                    {Array.from({ length: Math.min(totalPages || 1, 10) }, (_, i) => i + 1).map(p => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            style={{ ...pageBtnStyle(p === page), borderLeft: 'none' }}
                        >{p}</button>
                    ))}
                    {totalPages > 10 && <button style={{ ...pageBtnStyle(false), borderLeft: 'none' }}>...</button>}
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || totalPages === 0}
                        style={{ ...pageBtnStyle(false), borderLeft: 'none' }}
                    >Next</button>
                    <button
                        onClick={() => setPage(totalPages || 1)}
                        disabled={page === totalPages || totalPages === 0}
                        style={{ ...pageBtnStyle(false), borderLeft: 'none', borderTopRightRadius: 4, borderBottomRightRadius: 4 }}
                    >Last</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Search */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
                        <Search size={14} style={{ margin: '0 8px', color: '#999' }} />
                        <input
                            placeholder="Search newsletters..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ border: 'none', outline: 'none', padding: '6px 8px 6px 0', fontSize: 13, minWidth: 180 }}
                        />
                    </div>
                    <span style={{ border: '1px solid #ddd', padding: '6px 12px', borderRadius: 4, background: '#fff', fontSize: 13, color: '#555' }}>
                        Records: ({Math.min((page - 1) * PAGE_SIZE + 1, total)}-{Math.min(page * PAGE_SIZE, total)}) / {total}
                    </span>
                    <span style={{ border: '1px solid #ddd', padding: '6px 12px', borderRadius: 4, background: '#fff', fontSize: 13, color: '#555' }}>
                        Page: {page} / {totalPages || 1}
                    </span>
                    <button
                        onClick={fetchNewsletters}
                        title="Refresh"
                        style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', color: '#555' }}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div style={{ padding: '0 24px 24px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
                        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                        <div style={{ fontSize: 13 }}>Loading newsletters...</div>
                    </div>
                ) : newsletters.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa' }}>
                        <Users size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No Newsletters Found</div>
                        <div style={{ fontSize: 13 }}>Click <strong>Create New</strong> to build your first newsletter.</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #ddd', marginTop: 0 }}>
                        <thead>
                            <tr style={{ background: '#555', color: 'white' }}>
                                <th style={thStyle()}>#</th>
                                <th style={{ ...thStyle(), textAlign: 'left', minWidth: 300 }}>Title</th>
                                <th style={thStyle()}># of Articles</th>
                                <th style={thStyle()}>Created Date</th>
                                <th style={thStyle()}>Period</th>
                                <th style={thStyle()}>Status</th>
                                <th style={thStyle()}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {newsletters.map((nl, idx) => (
                                <tr
                                    key={nl.id}
                                    style={{ background: idx % 2 === 0 ? '#f9f9f9' : '#fff', borderBottom: '1px solid #ddd' }}
                                >
                                    <td style={tdStyle()}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                                    <td
                                        style={{ ...tdStyle(), textAlign: 'left', color: '#337ab7', cursor: 'pointer', fontWeight: 500 }}
                                        onClick={() => navigate(`/newsletters/${nl.id}`)}
                                        title="Click to edit"
                                    >
                                        {nl.title}
                                    </td>
                                    <td style={tdStyle()}>{nl.article_count ?? 0}</td>
                                    <td style={tdStyle()}>
                                        {nl.created_at ? format(new Date(nl.created_at), 'MMM dd, yyyy h:mm a') : '—'}
                                    </td>
                                    <td style={tdStyle()}>
                                        {nl.period_start ? format(new Date(nl.period_start), 'dd MMM yyyy') : '—'}
                                        {nl.period_end ? ` – ${format(new Date(nl.period_end), 'dd MMM yyyy')}` : ''}
                                    </td>
                                    <td style={tdStyle()}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: 10,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            background: nl.status === 'approved' ? '#d4edda' : nl.status === 'draft' ? '#e9ecef' : '#fff3cd',
                                            color: nl.status === 'approved' ? '#155724' : nl.status === 'draft' ? '#6c757d' : '#856404',
                                        }}>
                                            {nl.status ? nl.status.charAt(0).toUpperCase() + nl.status.slice(1) : 'Draft'}
                                        </span>
                                    </td>
                                    <td style={tdStyle()}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                            <button
                                                title="QA Review Summary"
                                                onClick={async () => {
                                                    setLoadingQA(true);
                                                    const { data } = await supabase.from('qa_error_logs').select('*').eq('newsletter_id', nl.id).order('created_at', { ascending: true });
                                                    
                                                    // Group by created_at (batch sessions)
                                                    const sessions = (data || []).reduce((acc, log) => {
                                                        const bid = log.created_at; 
                                                        if (!acc[bid]) acc[bid] = [];
                                                        acc[bid].push(log);
                                                        return acc;
                                                    }, {});

                                                    const sessionIds = Object.keys(sessions);
                                                    setQaDetails({ id: nl.id, title: nl.title, status: nl.status, sessions });
                                                    setActiveSessionId(sessionIds[sessionIds.length - 1] || null);
                                                    setLoadingQA(false);
                                                }}
                                                style={actionBtnStyle('#10b981')}
                                            >
                                                <ShieldCheck size={13} />
                                            </button>
                                                {nl.status !== 'approved' && (
                                                    <button 
                                                        title="Mark as Approved"
                                                        onClick={() => {
                                                            console.log('Button Clicked for ID:', nl.id);
                                                            handleApprove(nl.id);
                                                        }} 
                                                        disabled={approving}
                                                        style={actionBtnStyle('#44b55a')}
                                                    >
                                                        {approving ? <RefreshCw className="spinner" size={13} /> : <CheckCircle size={13} />}
                                                    </button>
                                                )}
                                            <button
                                                title="Edit Newsletter"
                                                onClick={() => navigate(`/newsletters/${nl.id}`)}
                                                style={actionBtnStyle('#337ab7')}
                                            >
                                                <Edit size={13} />
                                            </button>
                                            <button
                                                title="View in Insight Brief"
                                                onClick={() => navigate(`/reports/${nl.id}`)}
                                                style={actionBtnStyle('#5b6e7c')}
                                            >
                                                <Eye size={13} />
                                            </button>
                                            <button
                                                title="Delete"
                                                onClick={() => setDeleteId(nl.id)}
                                                style={actionBtnStyle('#d9534f')}
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
            </div>

            {/* QA Summary Modal */}
            {qaDetails && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setQaDetails(null)}
                >
                    <div style={{ background: '#fff', borderRadius: 8, padding: 0, maxWidth: 800, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', background: '#f8faff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}>
                                    <ShieldCheck size={20} color="#10b981" /> QA Review History: {qaDetails.title}
                                </h3>
                                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                                    {Object.keys(qaDetails.sessions).map((sid, idx) => (
                                        <button
                                            key={sid}
                                            onClick={() => setActiveSessionId(sid)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 6,
                                                fontSize: 11,
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                border: activeSessionId === sid ? '1px solid #10b981' : '1px solid #e2e8f0',
                                                background: activeSessionId === sid ? '#ecfdf5' : '#fff',
                                                color: activeSessionId === sid ? '#059669' : '#64748b',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            Review {idx + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setQaDetails(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>
                        
                         <div style={{ overflowY: 'auto', padding: 24 }}>
                            {!activeSessionId ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                    <AlertCircle size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                                    <p>No quality issues tracked for this report yet.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {Object.values(qaDetails.sessions[activeSessionId].reduce((acc, log) => {
                                        const key = log.message || 'Unknown Rule';
                                        if (!acc[key]) acc[key] = { ...log, count: 0 };
                                        acc[key].count++;
                                        return acc;
                                    }, {})).map((log, i) => (
                                        <div key={i} style={{ 
                                            padding: '16px 20px', 
                                            border: '1px solid #e2e8f0', 
                                            borderRadius: 16, 
                                            background: '#fff',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ 
                                                    width: 10, height: 10, borderRadius: '50%', 
                                                    background: log.severity === 'critical' ? '#ef4444' : log.severity === 'warning' ? '#f59e0b' : '#3b82f6' 
                                                }} />
                                                <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{log.message}</span>
                                            </div>
                                            <div style={{ 
                                                padding: '6px 14px', 
                                                borderRadius: 12, 
                                                background: log.severity === 'critical' ? '#fef2f2' : log.severity === 'warning' ? '#fffbeb' : '#f0f9ff',
                                                color: log.severity === 'critical' ? '#ef4444' : log.severity === 'warning' ? '#d97706' : '#2563eb',
                                                fontSize: 13,
                                                fontWeight: 800,
                                                border: `1px solid ${log.severity === 'critical' ? '#fee2e2' : log.severity === 'warning' ? '#fef3c7' : '#e0f2fe'}`
                                            }}>
                                                {log.count} {log.count === 1 ? 'Error' : 'Errors'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            {qaDetails.status !== 'approved' && (
                                <button 
                                    onClick={() => handleApprove(qaDetails.id)} 
                                    disabled={approving}
                                    className="btn btn-success" 
                                    style={{ padding: '8px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}
                                >
                                    {approving ? <RefreshCw className="spinner" size={16} /> : <CheckCircle size={16} />} Approve Newsletter
                                </button>
                            )}
                            <button onClick={() => setQaDetails(null)} className="btn btn-primary" style={{ padding: '8px 24px', borderRadius: 8 }}>Close Log</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteId && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setDeleteId(null)}
                >
                    <div style={{ background: '#fff', borderRadius: 8, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#d9534f' }}>
                            <Trash2 size={18} /> Delete Newsletter
                        </h3>
                        <p style={{ color: '#666', lineHeight: 1.6, fontSize: 14, margin: '0 0 20px 0' }}>
                            Are you sure? This will permanently delete the newsletter and all its article links. This action <strong>cannot be undone</strong>.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button onClick={() => setDeleteId(null)} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                            <button
                                onClick={() => handleDelete(deleteId)}
                                disabled={deleting}
                                style={{ padding: '8px 18px', border: 'none', borderRadius: 4, background: '#d9534f', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                            >
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Style helpers
function pageBtnStyle(active) {
    return {
        padding: '6px 12px',
        background: active ? '#337ab7' : '#fff',
        border: '1px solid ' + (active ? '#337ab7' : '#ddd'),
        color: active ? '#fff' : '#555',
        cursor: 'pointer',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
    };
}

function thStyle() {
    return { padding: '10px 12px', fontWeight: 600, border: '1px solid #444', textAlign: 'center', whiteSpace: 'nowrap' };
}

function tdStyle() {
    return { padding: '10px 12px', border: '1px solid #e0e0e0', textAlign: 'center', verticalAlign: 'middle' };
}

function actionBtnStyle(color) {
    return { background: color, color: '#fff', border: 'none', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' };
}
