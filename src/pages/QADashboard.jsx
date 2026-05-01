import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
    LayoutDashboard, FileText, AlertTriangle, TrendingUp, Lightbulb, 
    Search, Filter, Calendar, Users, ChevronRight, RefreshCw, BarChart2, Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getQAMetrics, generateQAInsights } from '../lib/qaEngine';

const SEVERITY_COLORS = {
    critical: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function QADashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshingAI, setRefreshingAI] = useState(false);
    const [clientName, setClientName] = useState('General');
    const [clients, setClients] = useState([]);
    const [metrics, setMetrics] = useState({ stats: [], logs: [] });
    const [aiInsight, setAiInsight] = useState(null);
    const [datePreset, setDatePreset] = useState('All time');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedReport, setSelectedReport] = useState('All');

    useEffect(() => {
        async function loadClients() {
            const { data } = await supabase.from('client_standards').select('client_name');
            if (data) setClients(['General', ...data.map(d => d.client_name)]);
        }
        loadClients();
    }, []);

    useEffect(() => {
        const fetchMetrics = async () => {
            setLoading(true);
            const data = await getQAMetrics(clientName === 'General' ? null : clientName);
            setMetrics(data);
            
            // Fetch existing AI insights if any
            const { data: insights } = await supabase
                .from('client_qa_insights')
                .select('*')
                .eq('client_name', clientName)
                .maybeSingle();
            setAiInsight(insights);
            setLoading(false);
        };
        fetchMetrics();
    }, [clientName]);

    const handleRefreshAI = async () => {
        setRefreshingAI(true);
        const newInsight = await generateQAInsights(clientName);
        if (newInsight) setAiInsight(newInsight);
        setRefreshingAI(false);
    };

    const exportToCSV = () => {
        if (filteredLogs.length === 0) return;
        const headers = ['Date', 'Client', 'Type', 'Severity', 'Message', 'Field'];
        const csvContent = [
            headers.join(','),
            ...filteredLogs.map(l => [
                new Date(l.created_at).toLocaleDateString(),
                l.client_name,
                l.error_type,
                l.severity,
                `"${l.message.replace(/"/g, '""')}"`,
                l.field_name
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QA_Report_${clientName}_${new Date().toLocaleDateString()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Filter Data
    const { start: activeStart, end: activeEnd } = (function() {
        if (datePreset === 'All time') return { start: null, end: null };
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        if (datePreset === 'Today') return { start: startOfToday, end: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1) };
        if (datePreset === 'Yesterday') {
            const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
            return { start: startOfYesterday, end: new Date(startOfYesterday.getTime() + 24 * 60 * 60 * 1000 - 1) };
        }
        if (datePreset === 'Past 3 days') {
            return { start: new Date(startOfToday.getTime() - 3 * 24 * 60 * 60 * 1000), end: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1) };
        }
        if (datePreset === 'This Month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start: startOfMonth, end: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1) };
        }
        if (datePreset === 'Custom range') {
            return {
                 start: startDate ? new Date(startDate) : null,
                 end: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : null
            };
        }
        return { start: null, end: null };
    })();

    const filteredStats = metrics.stats.filter(s => {
        let keep = true;
        const d = new Date(s.analyzed_at);
        if (activeStart) keep = keep && d >= activeStart;
        if (activeEnd) keep = keep && d <= activeEnd;
        if (selectedReport !== 'All') keep = keep && s.newsletter_id === selectedReport;
        return keep;
    });

    const filteredLogs = metrics.logs.filter(l => {
        let keep = true;
        const d = new Date(l.created_at);
        if (activeStart) keep = keep && d >= activeStart;
        if (activeEnd) keep = keep && d <= activeEnd;
        if (selectedReport !== 'All') keep = keep && l.newsletter_id === selectedReport;
        return keep;
    });

    const uniqueReportsMap = new Map();
    metrics.stats.forEach(s => {
        if (!uniqueReportsMap.has(s.newsletter_id)) {
            uniqueReportsMap.set(s.newsletter_id, s.newsletter_title || 'Untitled Newsletter');
        }
    });
    metrics.logs.forEach(l => {
         if (l.newsletter_id && !uniqueReportsMap.has(l.newsletter_id)) {
             uniqueReportsMap.set(l.newsletter_id, 'Report ' + l.newsletter_id.substring(0, 6));
         }
    });
    const uniqueReports = Array.from(uniqueReportsMap.entries()).map(([id, title]) => ({id, title}));

    // Data Processing
    const totalNewsletters = filteredStats.length;
    const avgScore = filteredStats.length > 0 
        ? (filteredStats.reduce((acc, s) => acc + Number(s.quality_score), 0) / filteredStats.length).toFixed(1)
        : 100;
    const totalErrors = filteredLogs.length;

    const severityData = [
        { name: 'Critical', value: filteredLogs.filter(l => l.severity === 'critical').length },
        { name: 'Warning', value: filteredLogs.filter(l => l.severity === 'warning').length },
        { name: 'Info', value: filteredLogs.filter(l => l.severity === 'info').length },
    ].filter(d => d.value > 0);

    const typeData = Object.entries(
        filteredLogs.reduce((acc, l) => {
            const type = l.error_type || 'Unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const trendData = filteredStats
        .slice().reverse()
        .map(s => ({
            date: new Date(s.analyzed_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            score: Number(s.quality_score)
        }));

    const topViolations = Object.entries(
        filteredLogs.reduce((acc, l) => {
            acc[l.message] = (acc[l.message] || 0) + 1;
            return acc;
        }, {})
    ).sort(([, a], [, b]) => b - a).slice(0, 5);

    if (loading) return <div className="loading-wrapper"><div className="spinner" /></div>;

    return (
        <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--color-gray-900)' }}>QA Reporting & AI Insights</h1>
                    <p style={{ color: 'var(--color-gray-500)', marginTop: 4 }}>Monitor and improve content quality across all newsletters</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <div style={{ position: 'relative' }}>
                            <Calendar style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={16} />
                            <select 
                                className="form-select" 
                                style={{ paddingLeft: 34, width: 160, borderRadius: 12 }} 
                                value={datePreset} 
                                onChange={e => setDatePreset(e.target.value)}
                            >
                                <option value="All time">All time</option>
                                <option value="Today">Today</option>
                                <option value="Yesterday">Yesterday</option>
                                <option value="Past 3 days">Past 3 days</option>
                                <option value="This Month">This Month</option>
                                <option value="Custom range">Custom range</option>
                            </select>
                        </div>
                        
                        {datePreset === 'Custom range' && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input type="date" className="form-input" style={{ borderRadius: 12, padding: '6px 12px', fontSize: 14 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                                <span style={{ fontSize: 13, color: '#64748b' }}>to</span>
                                <input type="date" className="form-input" style={{ borderRadius: 12, padding: '6px 12px', fontSize: 14 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        )}
                        
                        <div style={{ position: 'relative' }}>
                            <FileText style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={16} />
                            <select 
                                className="form-select" 
                                style={{ paddingLeft: 34, width: 200, borderRadius: 12 }} 
                                value={selectedReport} 
                                onChange={e => setSelectedReport(e.target.value)}
                            >
                                <option value="All">All Reports</option>
                                {uniqueReports.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                            </select>
                        </div>
                        
                        <div style={{ position: 'relative' }}>
                            <Filter style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={16} />
                            <select 
                                className="form-select" 
                                style={{ paddingLeft: 34, width: 220, borderRadius: 12 }} 
                                value={clientName} 
                                onChange={e => setClientName(e.target.value)}
                            >
                                {clients.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn btn-primary" style={{ borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }} onClick={handleRefreshAI} disabled={refreshingAI}>
                            {refreshingAI ? <RefreshCw className="spinner" size={16} /> : <Lightbulb size={16} />} 
                            Generate AI Insights
                        </button>
                        <button className="btn btn-secondary" style={{ borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }} onClick={exportToCSV}>
                            <Download size={16} /> 
                            Export CSV
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 30 }}>
                <StatsCard icon={<BarChart2 color="#3b82f6" />} label="Avg Quality Score" value={`${avgScore}%`} color="#3b82f6" trend="+2.4%" />
                <StatsCard icon={<FileText color="#10b981" />} label="Analyzed Newsletters" value={totalNewsletters} color="#10b981" />
                <StatsCard icon={<AlertTriangle color="#ef4444" />} label="Total QA Errors" value={totalErrors} color="#ef4444" trend="-5%" />
                <StatsCard icon={<Users color="#8b5cf6" />} label="Client Coverage" value={clients.length - 1} color="#8b5cf6" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, marginBottom: 30 }}>
                {/* Left: Quality Trend */}
                <div className="card" style={{ padding: 24, borderRadius: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} /> Quality Trend</h3>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Last 10 Newsletters</span>
                    </div>
                    <div style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                                <Tooltip />
                                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right: Error Severity distribution */}
                <div className="card" style={{ padding: 24, borderRadius: 16 }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: 18 }}>Error Severity</h3>
                    <div style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={severityData} 
                                    innerRadius={60} 
                                    outerRadius={80} 
                                    paddingAngle={5} 
                                    dataKey="value"
                                >
                                    {severityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name.toLowerCase()]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" align="center" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* AI Insights and Patterns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
                {/* AI Insights Panel */}
                <div className="card" style={{ padding: 24, borderRadius: 16, border: '1px solid #e0e7ff', background: '#f8faff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{ background: '#e0e7ff', padding: 8, borderRadius: 10, color: '#4f46e5' }}><Lightbulb size={20} /></div>
                        <h3 style={{ margin: 0, fontSize: 18, color: '#1e1b4b' }}>AI Insight Layer</h3>
                    </div>

                    {aiInsight ? (
                        <>
                            <div style={{ marginBottom: 20 }}>
                                <p style={{ fontSize: 15, lineHeight: 1.6, color: '#312e81', fontWeight: 500 }}>{aiInsight.summary}</p>
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#4f46e5', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Common Error Patterns</h4>
                                {aiInsight.patterns?.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 14, color: '#475569' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', marginTop: 7 }} />
                                        {p}
                                    </div>
                                ))}
                            </div>
                            <div>
                                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Smart Recommendations</h4>
                                {aiInsight.recommendations?.map((r, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 10, background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 10, fontSize: 14, color: '#334155', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                        <ChevronRight size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                                        {r}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <p style={{ color: '#64748b' }}>No insights generated yet. Click "Generate AI Insights" to analyze errors.</p>
                        </div>
                    )}
                </div>

                {/* Top Recurring Violations */}
                <div className="card" style={{ padding: 24, borderRadius: 16 }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: 18 }}>Top Rule Violations</h3>
                    <div className="table-wrapper">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Rule Violation</th>
                                    <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase', width: 100 }}>Frequency</th>
                                    <th style={{ textAlign: 'center', padding: '12px 8px', width: 40 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {topViolations.map(([msg, count], i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                                        <td style={{ padding: '16px 8px', fontSize: 14, color: '#1e293b', fontWeight: 500 }}>{msg}</td>
                                        <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                                            <span style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#475569' }}>{count}</span>
                                        </td>
                                        <td style={{ padding: '16px 8px' }}><ChevronRight size={14} color="#cbd5e1" /></td>
                                    </tr>
                                ))}
                                {topViolations.length === 0 && (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>No errors recorded for this period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Consolidated Newsletter Performance Table */}
            <div className="card" style={{ padding: 24, borderRadius: 16, marginTop: 24 }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={18} color="#3b82f6" /> Recent Newsletter Quality Checks
                </h3>
                <div className="table-wrapper">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Newsletter Title</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Score</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Total Errors</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Crit / Warn / Info</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Last Analyzed</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px', width: 40 }} />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStats.map((s, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s', cursor: 'pointer' }} onClick={() => navigate(`/newsletters/${s.newsletter_id}`)}>
                                    <td style={{ padding: '16px 8px', fontSize: 14, color: '#1e293b', fontWeight: 600 }}>{s.newsletter_title || 'Untitled Newsletter'}</td>
                                    <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                                        <div style={{ 
                                            padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800, display: 'inline-block',
                                            background: s.quality_score > 90 ? '#f0fdf4' : s.quality_score > 70 ? '#fffbeb' : '#fef2f2',
                                            color: s.quality_score > 90 ? '#10b981' : s.quality_score > 70 ? '#f59e0b' : '#ef4444',
                                            border: `1px solid ${s.quality_score > 90 ? '#bbf7d0' : s.quality_score > 70 ? '#fef3c7' : '#fecaca'}`
                                        }}>
                                            {s.quality_score}%
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 8px', textAlign: 'center', fontSize: 14, color: '#475569' }}>{s.total_errors}</td>
                                    <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                            <span title="Critical" style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{s.critical_errors}</span>
                                            <span style={{ color: '#cbd5e1' }}>/</span>
                                            <span title="Warning" style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{s.warning_errors}</span>
                                            <span style={{ color: '#cbd5e1' }}>/</span>
                                            <span title="Info" style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>{s.info_errors}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 8px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                                        {new Date(s.analyzed_at).toLocaleDateString()} at {new Date(s.analyzed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td style={{ padding: '16px 8px' }}><ChevronRight size={14} color="#3b82f6" /></td>
                                </tr>
                            ))}
                            {filteredStats.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                                        <RefreshCw size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                                        <p>No quality metrics found. Try performing a review on a newsletter first.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatsCard({ icon, label, value, color, trend }) {
    return (
        <div className="card" style={{ padding: '20px', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ background: `${color}15`, padding: 10, borderRadius: 12 }}>
                    {icon}
                </div>
                {trend && (
                    <span style={{ 
                        fontSize: 12, fontWeight: 700, 
                        color: trend.startsWith('+') ? '#10b981' : '#ef4444',
                        background: trend.startsWith('+') ? '#f0fdf4' : '#fef2f2',
                        padding: '2px 8px', borderRadius: 20
                    }}>
                        {trend}
                    </span>
                )}
            </div>
            <div>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</p>
                <h4 style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{value}</h4>
            </div>
        </div>
    );
}
