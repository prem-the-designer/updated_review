import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    Sparkles, RefreshCw, ArrowRight, ArrowLeft, History as HistoryIcon, 
    CheckCircle, AlertCircle, Bot, Zap, Save, ChevronRight,
    Clock, Cpu, Shield, ExternalLink, Trash2, Edit3
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

export default function InsightBrief() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const initialSummary = location.state?.initialSummary;
    
    const [report, setReport] = useState(null);
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [versions, setVersions] = useState([]);
    const [activeVersion, setActiveVersion] = useState(null);
    const [error, setError] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    const abortControllerRef = useRef(null);

    const fetchReportData = useCallback(async () => {
        setLoading(true);
        setError(null);
        console.log('Fetching report data for ID:', id);
        try {
            // 1. Fetch report details with joined articles
            const { data: reportData, error: rErr } = await supabase
                .from('reports')
                .select(`
                    *,
                    report_articles (
                        article_id,
                        articles (*)
                    )
                `)
                .eq('id', id)
                .single();
            
            if (rErr) throw rErr;
            if (!reportData) throw new Error('Report not found');
            
            console.log('Report Data fetched:', reportData);
            setReport(reportData);

            // Correctly extract articles from the joined data
            const fetchedArticles = reportData.report_articles
                ?.map(ra => ra.articles)
                .filter(Boolean) || [];
            
            console.log('Articles extracted:', fetchedArticles.length);
            setArticles(fetchedArticles);

            // 2. Fetch existing versions
            const { data: versionsData, error: vErr } = await supabase
                .from('insight_brief_versions')
                .select('*')
                .eq('report_id', id)
                .order('version', { ascending: false });
            
            if (vErr) throw vErr;
            console.log('Versions fetched:', versionsData?.length || 0);
            
            setVersions(versionsData || []);
            
            // IF we have an initialSummary from AI Assist, ALWAYS create a new version from it
            if (initialSummary) {
                console.log('Using initial summary from AI Assist...');
                const nextVersion = (versionsData?.length > 0) ? (versionsData[0].version + 1) : 1;
                saveInitialVersion(initialSummary, nextVersion);
            } else if (versionsData && versionsData.length > 0) {
                const active = versionsData.find(v => v.is_active) || versionsData[0];
                console.log('Setting active version:', active.version);
                setActiveVersion(active);
            } else if (fetchedArticles.length > 0) {
                console.log('No versions found. Triggering auto-generation...');
                generateVersion(1, fetchedArticles, reportData);
            } else {
                console.warn('No articles available to generate brief.');
                setError("No articles found in this report. Please add articles to the report before generating an insight brief.");
            }

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id, initialSummary]);

    const saveInitialVersion = async (content, versionNumber = 1) => {
        try {
            // Deactivate existing versions
            await supabase.from('insight_brief_versions').update({ is_active: false }).eq('report_id', id);

            const { data: newV, error: pErr } = await supabase
                .from('insight_brief_versions')
                .insert({
                    report_id: id,
                    version: versionNumber,
                    content: content,
                    type: 'ai_generated',
                    is_active: true
                })
                .select()
                .single();

            if (pErr) throw pErr;
            setVersions(prev => [newV, ...prev]);
            setActiveVersion(newV);
            
            // Clear location state to prevent loop
            window.history.replaceState({}, document.title);
        } catch (err) {
            console.error('Error saving initial version:', err);
            setError('Failed to save the summary from AI Assist.');
        }
    };

    useEffect(() => {
        fetchReportData();
        return () => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [fetchReportData]);

    const generateVersion = async (vNumber, overrideArticles = null, overrideReport = null) => {
        if (generating) return;
        
        const currentArticles = overrideArticles || articles;
        const currentReport = overrideReport || report;

        if (!currentArticles?.length) {
            setError("No articles available for generation.");
            return;
        }

        setGenerating(true);
        setError(null);
        
        try {
            const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
            if (!apiKey || apiKey === 'your_openai_api_key_here') {
                throw new Error('API Key not configured. Please add VITE_OPENAI_API_KEY to your .env file.');
            }

            console.log(`Generating version ${vNumber} for ${currentArticles.length} articles...`);

            // Prepare article context with fallback values
            const articleContext = currentArticles.map((a, i) => {
                const heading = a.heading || 'No Heading';
                const summary = a.summary || (a.full_article ? a.full_article.replace(/<[^>]*>/g, '').substring(0, 300) : 'No content available');
                const sentiment = a.sentiment || 'Neutral';
                const categories = Array.isArray(a.content_categories) ? a.content_categories.join(', ') : 'None';
                
                return `[${i + 1}] Heading: ${heading}\nSummary: ${summary}\nSentiment: ${sentiment}\nCategory: ${categories}`;
            }).join('\n\n');

            const prompt = `
                You are a senior media intelligence analyst at Fullintel. 
                Task: Generate a concise, high-level Executive Summary (Insight Brief) for the following report.
                Report Title: ${currentReport?.title || 'Unnamed Report'}
                Client: ${currentReport?.client_name || 'General Client'}
                Period: ${currentReport?.period_start || 'N/A'} to ${currentReport?.period_end || 'N/A'}
                Article Count: ${currentArticles.length}

                ARTICLES DATA:
                ${articleContext}

                The output must be:
                1. Concise and highly structured.
                2. Business-ready and professional in tone.
                3. Use ONLY the provided data.
                4. Focus on identifying key trends and strategic implications.
                5. Structure:
                   ## Executive Summary
                   ## Key Themes & Coverage Volume
                   ## Sentiment Analysis
                   ## Strategic Outlook

                Format as clean markdown.
            `;

            abortControllerRef.current = new AbortController();
            
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Fullintel Review App'
                },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    model: 'openai/gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a professional media analyst.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('AI API Error:', errorData);
                throw new Error(`AI Generation failed: ${res.status} ${res.statusText}. ${errorData.error?.message || ''}`);
            }
            
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            
            if (!content) throw new Error('AI returned an empty response.');

            console.log('AI Generation successful. Saving to DB...');

            // Persist the new version
            const { data: newV, error: pErr } = await supabase
                .from('insight_brief_versions')
                .insert({
                    report_id: id,
                    version: vNumber,
                    content: content,
                    type: 'ai_generated',
                    is_active: true
                })
                .select()
                .single();

            if (pErr) throw pErr;

            // Set other versions to inactive
            await supabase
                .from('insight_brief_versions')
                .update({ is_active: false })
                .eq('report_id', id)
                .neq('id', newV.id);

            setVersions(prev => [newV, ...prev.map(v => ({ ...v, is_active: false }))]);
            setActiveVersion(newV);

        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Generation error:', err);
            setError(err.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleRegenerate = () => {
        if (!articles.length) {
            setError("Cannot regenerate: No articles found.");
            return;
        }
        const nextV = versions.length + 1;
        generateVersion(nextV, articles, report);
    };

    const handleSwitchVersion = async (v) => {
        try {
            // Update DB
            await supabase
                .from('insight_brief_versions')
                .update({ is_active: false })
                .eq('report_id', id);
            
            await supabase
                .from('insight_brief_versions')
                .update({ is_active: true })
                .eq('id', v.id);

            setActiveVersion({ ...v, is_active: true });
            setVersions(prev => prev.map(item => ({
                ...item,
                is_active: item.id === v.id
            })));
            setShowHistory(false);
        } catch (err) {
            console.error('Error switching version:', err);
        }
    };

    const proceedToReport = () => {
        navigate(`/reports/${id}/builder`, { state: { activeVersion } });
    };

    if (loading) return (
        <div className="loading-wrapper">
            <div className="spinner" />
            <span>Initializing Insight Brief...</span>
        </div>
    );

    return (
        <div className="insight-brief-container" style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 60 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        <Bot size={16} /> Step 1: Insight Briefing
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--color-gray-900)', letterSpacing: '-0.5px' }}>
                        Executive Summary Generation
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-secondary" onClick={() => navigate(`/reports/${id}`)}>
                        <ArrowLeft size={16} /> Back to Report
                    </button>
                    <button className="btn btn-primary" onClick={proceedToReport} disabled={generating || !activeVersion}>
                        Proceed to Report Builder <ArrowRight size={16} />
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
                {/* Main Content Area */}
                <div style={{ flex: 1 }}>
                    <div style={{ 
                        background: 'var(--color-white)', 
                        border: '1px solid var(--color-gray-200)', 
                        borderRadius: 'var(--radius-xl)', 
                        minHeight: 500,
                        position: 'relative',
                        boxShadow: 'var(--shadow-lg)',
                        overflow: 'hidden'
                    }}>
                        {/* Summary Toolbar */}
                        <div style={{ 
                            padding: '16px 24px', 
                            borderBottom: '1px solid var(--color-gray-100)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            background: 'var(--color-gray-50)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ 
                                    background: 'var(--color-primary)', 
                                    color: 'white', 
                                    padding: '4px 10px', 
                                    borderRadius: 6, 
                                    fontSize: 11, 
                                    fontWeight: 800 
                                }}>
                                    VERSION {activeVersion?.version}
                                </div>
                                <span style={{ fontSize: 13, color: 'var(--color-gray-500)' }}>
                                    Generated {activeVersion?.created_at && format(new Date(activeVersion.created_at), 'HH:mm')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(!showHistory)}>
                                    <HistoryIcon size={14} /> History
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={handleRegenerate} disabled={generating}>
                                    {generating ? <RefreshCw size={14} className="spinner" /> : <RefreshCw size={14} />} 
                                    Regenerate
                                </button>
                            </div>
                        </div>

                        {/* Content Display */}
                        <div style={{ padding: '32px 40px', color: 'var(--color-gray-800)', lineHeight: 1.8 }}>
                            {generating ? (
                                <div style={{ textAlign: 'center', padding: '100px 0' }}>
                                    <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 24px' }} />
                                    <h3 style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Generating Insight Brief...</h3>
                                    <p style={{ color: 'var(--color-gray-400)', fontSize: 14 }}>Analyzing {articles.length} articles for key themes</p>
                                </div>
                            ) : activeVersion ? (
                                <div className="markdown-content" style={{ fontSize: 15 }}>
                                    {activeVersion.content.split('\n').map((line, i) => {
                                        const trimmed = line.trim();
                                        if (trimmed === '') return <div key={i} style={{ height: 16 }} />;

                                        const parseInline = (text) => {
                                            let parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
                                            return parts.map((part, index) => {
                                                if (part.startsWith('**') && part.endsWith('**')) {
                                                    return <strong key={index}>{part.slice(2, -2)}</strong>;
                                                }
                                                if (part.startsWith('*') && part.endsWith('*')) {
                                                    return <em key={index}>{part.slice(1, -1)}</em>;
                                                }
                                                return part;
                                            });
                                        };

                                        if (line.startsWith('## ')) return <h2 key={i} style={{ marginTop: 24, marginBottom: 12, color: 'var(--color-gray-900)' }}>{parseInline(line.replace('## ', ''))}</h2>;
                                        if (line.startsWith('### ')) return <h3 key={i} style={{ marginTop: 18, marginBottom: 8, color: 'var(--color-gray-800)' }}>{parseInline(line.replace('### ', ''))}</h3>;
                                        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} style={{ marginLeft: 20, marginBottom: 8 }}>{parseInline(line.replace(/^[-*] /, ''))}</li>;
                                        return <p key={i} style={{ marginBottom: 16 }}>{parseInline(line)}</p>;
                                    })}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--color-gray-300)' }}>
                                    <Zap size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                                    <p>No brief generated yet.</p>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div style={{ margin: '0 24px 24px', padding: '12px 16px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', color: '#991b1b', fontSize: 13 }}>
                                <AlertCircle size={16} />
                                <span>{error}</span>
                                <button onClick={() => generateVersion(versions.length || 1)} style={{ marginLeft: 'auto', fontWeight: 700, textDecoration: 'underline' }}>Retry</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* History Sidebar (Conditional) */}
                {showHistory && (
                    <div style={{ width: 300, background: 'var(--color-white)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-xl)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Version History</h3>
                            <button onClick={() => setShowHistory(false)} style={{ color: 'var(--color-gray-400)' }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {versions.map((v) => (
                                <div 
                                    key={v.id} 
                                    onClick={() => handleSwitchVersion(v)}
                                    style={{ 
                                        padding: '12px 14px', 
                                        borderRadius: 10, 
                                        border: v.id === activeVersion?.id ? '2px solid var(--color-primary)' : '1px solid var(--color-gray-100)',
                                        background: v.id === activeVersion?.id ? 'var(--color-primary-light)' : 'var(--color-gray-50)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700, fontSize: 13, color: v.id === activeVersion?.id ? 'var(--color-primary-dark)' : 'inherit' }}>
                                            Version {v.version}
                                        </span>
                                        {v.is_active && <CheckCircle size={14} color="var(--color-success)" />}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-gray-500)' }}>
                                        {format(new Date(v.created_at), 'dd MMM, HH:mm')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Legend / Tips */}
            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={14} /> AI Consistency
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        Each regeneration analyzes the original report dataset from scratch to ensure maximum accuracy and zero hallucination buildup.
                    </p>
                </div>
                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={14} /> Version Control
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        Switch between generated versions at any time. The active version will be automatically carried forward to the report builder.
                    </p>
                </div>
                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={14} /> Linear Workflow
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        Once satisfied with the AI-powered summary, proceed to the Builder to customize layout, branding, and manual edits.
                    </p>
                </div>
            </div>
        </div>
    );
}
