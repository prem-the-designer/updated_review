import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    BarChart2, CheckCircle, AlertCircle, XCircle, RefreshCw, Save,
    Edit2, ArrowLeft, FileText, Eye, Cpu, Shield, Zap, Info,
    ThumbsUp, ThumbsDown, MessageSquare, Calendar, Tag, ExternalLink,
    ChevronDown, ChevronUp, AlertTriangle, Layout, Download,
    Sparkles, X, Send, Copy, Clock, Filter, Bot, RotateCcw, PlusCircle,
    History as HistoryIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

import { executeRuleEngine } from '../lib/ruleEngine/engine';

/* ──────────────────────────────────────────────
   Verification Engine (Client-Side Logic)
   ────────────────────────────────────────────── */

function runVerificationAlgorithm(article, activeRules) {
    const checks = [];

    // Run the flexible rule engine against the article
    const violations = executeRuleEngine(article, activeRules);

    // Map the active rules into the checklist UI format
    for (const rule of activeRules) {
        const violation = violations.find(v => v.rule_id === rule.id);

        if (!violation) {
            // Passed
            checks.push({
                id: rule.id,
                label: rule.name,
                status: 'pass',
                detail: `✓ Meets requirement: ${rule.description}`
            });
        } else {
            // Failed or Warning based on severity
            const status = violation.severity === 'critical' ? 'fail' : 'warn';
            checks.push({
                id: rule.id,
                label: rule.name,
                status: status,
                detail: `${status === 'fail' ? '❌' : '⚠️'} Violation: ${rule.description} (Detected: "${violation.detected_value?.substring(0, 50) || 'Empty'}")`
            });
        }
    }

    // Determine overall status based on rule engine evaluation
    const failsCount = checks.filter(c => c.status === 'fail').length;
    const warnsCount = checks.filter(c => c.status === 'warn').length;

    let overallStatus = 'approved';
    if (failsCount > 0) {
        overallStatus = 'needs_revision';
    } else if (warnsCount > 0) {
        overallStatus = 'partial';
    }

    return { checks, overallStatus, violations };
}

function renderHighlightedText(text, violations, fieldName) {
    if (!text) return '';
    // Use the raw text allowing React to natively escape HTML tags so they are visible
    const cleanText = text;
    const relevantViolations = violations ? violations.filter(v => 
        v.field === fieldName || 
        v.component === fieldName || 
        (fieldName === 'body' && (v.component === 'full_article' || v.component === 'summary'))
    ) : [];

    if (relevantViolations.length === 0) return cleanText;

    const charViolations = new Array(cleanText.length).fill(0).map(() => []);

    relevantViolations.forEach(v => {
        // Fallback to rule_value for certain operators if violated_text is missing
        const matchText = v.violated_text || (['not_contains', 'not_regex'].includes(v.rule_operator) ? v.rule_value : null);
        if (!matchText) return;

        let regex;

        if (v.rule_operator === 'not_regex' && v.rule_value) {
            try {
                const safeExpectedStr = String(v.rule_value);
                let pattern = safeExpectedStr;
                let flags = 'g'; // Must be global

                if (safeExpectedStr.startsWith('/') && safeExpectedStr.lastIndexOf('/') > 0) {
                    const lastSlash = safeExpectedStr.lastIndexOf('/');
                    pattern = safeExpectedStr.substring(1, lastSlash);
                    flags = safeExpectedStr.substring(lastSlash + 1);
                    if (!flags.includes('g')) flags += 'g';
                }
                regex = new RegExp(pattern, flags);
            } catch (e) {
                const escaped = String(matchText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escaped, 'gi');
            }
        } else {
            const escaped = String(matchText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, 'gi');
        }

        if (!regex) return;

        let match;
        // Prevent infinite loop
        let safetyCounter = 0;
        while ((match = regex.exec(cleanText)) !== null) {
            safetyCounter++;
            if (safetyCounter > 1000) break;

            if (match[0].length === 0) {
                regex.lastIndex++;
                continue;
            }
            for (let i = match.index; i < match.index + match[0].length; i++) {
                charViolations[i].push(v);
            }
        }
    });

    const blocks = [];
    if (cleanText.length === 0) return cleanText;

    let currentBlock = { text: cleanText[0], vList: charViolations[0] };

    for (let i = 1; i < cleanText.length; i++) {
        const vIds = charViolations[i].map(v => v.name).sort().join('|');
        const prevVIds = currentBlock.vList.map(v => v.name).sort().join('|');

        if (vIds === prevVIds) {
            currentBlock.text += cleanText[i];
        } else {
            blocks.push(currentBlock);
            currentBlock = { text: cleanText[i], vList: charViolations[i] };
        }
    }
    blocks.push(currentBlock);

    return blocks.map((block, i) => {
        const vList = block.vList.filter((v, idx, self) =>
            self.findIndex(t => t.name === v.name) === idx
        );
        const vCount = vList.length;

        if (vCount > 0) {
            const combinedTooltip = vList.map(v => `• ${v.name}: ${v.description}`).join('\n');
            return (
                <span
                    key={i}
                    style={{
                        background: vCount > 1 ? '#ffcc80' : '#fff3cd',
                        borderRadius: '2px',
                        padding: '0 1px',
                        cursor: 'help',
                        borderBottom: vCount > 1 ? '2px solid #f57c00' : '1px solid #ffc107',
                    }}
                    title={combinedTooltip}
                >
                    {block.text}
                </span>
            );
        }
        return <span key={i}>{block.text}</span>;
    });
}

function generateVerificationSummary(article, verificationResult) {
    const { overallStatus, violations } = verificationResult;
    const numViolations = violations ? violations.length : 0;

    let summary = `This article "${article.heading?.substring(0, 60)}..." was evaluated by the Rule Engine. `;

    if (overallStatus === 'approved') {
        summary += 'It complies with all active Editorial Rules and is ready for inclusion.';
    } else {
        const criticalCount = violations.filter(v => v.severity === 'critical').length;
        summary += `It failed ${criticalCount} critical rule(s) and triggered ${numViolations - criticalCount} warning(s). `;
        if (numViolations > 0) {
            summary += `<br/><br/><strong>Suggested Fixes:</strong><ul>`;

            const escapeHtml = (unsafe) => {
                return (unsafe || '').toString()
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };

            violations.slice(0, 5).forEach(v => {
                const escapedText = escapeHtml(v.violated_text);
                const highlightPill = v.violated_text ? `<mark style="background-color: #ffcc80; padding: 0 4px; border-radius: 4px; margin-left: 8px; font-size: 12px; font-family: monospace;">"${escapedText}"</mark>` : '';
                summary += `<li>[${v.component}] ${v.name} -> <em>${v.action_type.replace('_', ' ')}</em>${highlightPill}</li>`;
            });
            if (numViolations > 5) summary += `<li>...and more.</li>`;
            summary += `</ul>`;
        }
    }

    return summary;
}

/* ──────────────────────────────────────────────
   Status Configuration
   ────────────────────────────────────────────── */
const STATUS_CONFIG = {
    draft: { badge: 'badge-gray', label: 'Draft' },
    pending: { badge: 'badge-warning', label: 'Pending Review' },
    reviewing: { badge: 'badge-info', label: 'Under Review' },
    approved: { badge: 'badge-success', label: 'Approved' },
    rejected: { badge: 'badge-danger', label: 'Rejected' },
};

/* ──────────────────────────────────────────────
   Article Verification Card
   ────────────────────────────────────────────── */
function ArticleVerificationCard({ article, index, onUpdateNote, onApprove, onReject, activeRules }) {
    const [expanded, setExpanded] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [note, setNote] = useState(article.reviewer_note || '');
    const [editNote, setEditNote] = useState(false);

    const runVerification = async () => {
        setRunning(true);
        setExpanded(true);
        
        try {
            // 1. Core Algorithmic Verification
            const r = runVerificationAlgorithm(article, activeRules);
            
            // 2. AI Pass (Context & Nuance)
            const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
            if (apiKey && apiKey !== 'your_openai_api_key_here') {
                const prompt = `
                    You are an expert editorial auditor for J&J.
                    Standards (Active Rules):
                    ${activeRules.map(s => `- ${s.name}: ${s.description}`).join('\n')}
                    
                    Headline: "${article.heading || ''}"
                    Summary: "${article.summary || ''}"
                    Body: "${(article.full_article || '').substring(0, 1500)}"
                    
                    ALREADY FLAGGED LOCALLY: ${r.violations.map(v => v.name).join(', ')}
                    
                    Task: Identify ANY OTHER editorial violations not mentioned above based on the standards provided. 
                    Respond ONLY with a JSON array []. If perfect, return [].
                `;

                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey.trim()}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'Review Report AI Analysis'
                    },
                    body: JSON.stringify({
                        model: 'openai/gpt-4o-mini',
                        messages: [
                            { role: 'system', content: 'Respond with a JSON array of violations: {"type":"editorial", "category":"editorial", "name":"<rule name failed>", "description":"<why it failed>", "component":"<headline|summary|body>", "field":"<heading|summary|body>", "action_type":"suggest_fix", "violated_text":"<exact_text>", "rule_operator":"not_regex", "rule_value":"<literal offending text>"}. Only return genuine errors.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices.length > 0) {
                        const content = data.choices[0].message.content.trim();
                        try {
                            const jsonStart = content.indexOf('[');
                            const jsonEnd = content.lastIndexOf(']') + 1;
                            if (jsonStart !== -1) {
                                const aiViolations = JSON.parse(content.substring(jsonStart, jsonEnd));
                                if (Array.isArray(aiViolations) && aiViolations.length > 0) {
                                    r.violations = [...r.violations, ...aiViolations];
                                    
                                    // Make sure overallStatus turns to partial or rejected if AI found issues but algorithm said approved
                                    if (r.overallStatus === 'approved') {
                                        r.overallStatus = 'partial';
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("AI Parse Error", e);
                        }
                    }
                }
            }
            
            // 3. Generate summary
            const summary = generateVerificationSummary(article, r);
            setResult({ ...r, summary });
        } catch (e) {
            console.error("Verification error", e);
            // Default fallback
            setResult({ overallStatus: 'failed', violations: [], checks: [], score: 0, summary: 'Error running verification.' });
        } finally {
            setRunning(false);
        }
    };

    const statusIcon = {
        pass: <CheckCircle size={15} color="var(--color-success)" />,
        warn: <AlertTriangle size={15} color="var(--color-warning)" />,
        fail: <XCircle size={15} color="var(--color-danger)" />,
    };

    const scoreLevel = result
        ? result.score >= 75 ? 'high' : result.score >= 50 ? 'medium' : 'low'
        : null;

    return (
        <div style={{
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: 'var(--color-white)',
            marginBottom: 14,
            boxShadow: 'var(--shadow-sm)',
            transition: 'box-shadow 0.2s',
        }}>
            {/* Article Header */}
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gray-400)', minWidth: 24, paddingTop: 2 }}>
                    #{index + 1}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-gray-800)', fontSize: 14, lineHeight: 1.4 }}>
                        {result && result.violations.length > 0 ? renderHighlightedText(article.heading, result.violations, 'heading') : article.heading}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>{article.source}</span>
                        {article.content_categories && article.content_categories.length > 0 && (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {article.content_categories.map(cat => (
                                    <span key={cat} className="badge badge-gray" style={{ fontSize: 10.5 }}>
                                        {cat.replace(/_/g, ' ')}
                                    </span>
                                ))}
                            </div>
                        )}
                        {article.sentiment && (
                            <span className={`badge ${article.sentiment === 'Positive' ? 'badge-success' : article.sentiment === 'Negative' ? 'badge-danger' : 'badge-info'}`} style={{ fontSize: 10.5 }}>
                                {article.sentiment}
                            </span>
                        )}
                        {article.published_date && (
                            <span style={{ fontSize: 11.5, color: 'var(--color-gray-400)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Calendar size={10} />
                                {format(new Date(article.published_date), 'dd MMM yyyy')}
                            </span>
                        )}
                        {article.article_url && (
                            <a href={article.article_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ExternalLink size={10} /> Source
                            </a>
                        )}
                    </div>
                </div>

                {/* Status pill icon */}
                {result && (
                    <div style={{ textAlign: 'center', minWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        {result.overallStatus === 'approved' ? <CheckCircle size={28} color="var(--color-success)" /> :
                            result.overallStatus === 'partial' ? <AlertTriangle size={28} color="var(--color-warning)" /> :
                                <XCircle size={28} color="var(--color-danger)" />}
                        <div style={{ fontSize: 10, color: 'var(--color-gray-400)', textTransform: 'uppercase', fontWeight: 600, marginTop: 4 }}>Verdict</div>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={runVerification}
                        disabled={running}
                        title="Run Verification Engine"
                    >
                        {running ? <><span className="spinner spinner-sm" /> Analyzing...</> : <><Cpu size={13} /> Verify</>}
                    </button>
                    <button
                        className="btn btn-success btn-sm"
                        onClick={() => onApprove(article.id)}
                        title="Approve article"
                    >
                        <ThumbsUp size={13} />
                    </button>
                    <button
                        className="btn btn-danger btn-sm"
                        onClick={() => onReject(article.id)}
                        title="Reject article"
                    >
                        <ThumbsDown size={13} />
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setExpanded(e => !e)}
                        title={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* Expanded Verification Panel */}
            {expanded && (
                <div style={{ borderTop: '1px solid var(--color-gray-100)', padding: '16px 20px', background: 'var(--color-gray-50)' }}>
                    {running ? (
                        <div className="loading-wrapper" style={{ padding: 24 }}>
                            <div className="spinner" />
                            <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Verification in progress...</span>
                        </div>
                    ) : result ? (
                        <>
                            {/* Verification Summary */}
                            <div className="ai-review-panel" style={{ marginBottom: 16 }}>
                                <div className="ai-header">
                                    <span className="ai-badge"><Shield size={11} /> Algorithm Analysis</span>
                                    <span style={{ fontSize: 13, color: 'var(--color-primary-dark)', fontWeight: 600 }}>
                                        {result.overallStatus === 'approved' ? '✅ Ready for inclusion' :
                                            result.overallStatus === 'partial' ? '⚠️ Minor revisions needed' :
                                                '❌ Significant revisions required'}
                                    </span>
                                </div>
                                <p style={{ fontSize: 13.5, color: 'var(--color-gray-700)', lineHeight: 1.6 }}
                                    dangerouslySetInnerHTML={{ __html: result.summary }} />
                            </div>

                            {/* Validation Status */}
                            <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div className="score-item">
                                    <div className="score-label">Checks Passed</div>
                                    <div className="score-value high">
                                        {result.checks.filter(c => c.status === 'pass').length} / {result.checks.length}
                                    </div>
                                </div>
                                <div className="score-item">
                                    <div className="score-label">Warnings</div>
                                    <div className="score-value medium">
                                        {result.checks.filter(c => c.status === 'warn').length}
                                    </div>
                                </div>
                                <div className="score-item">
                                    <div className="score-label">Failed</div>
                                    <div className="score-value low">
                                        {result.checks.filter(c => c.status === 'fail').length}
                                    </div>
                                </div>
                            </div>

                            {/* Verification checklist */}
                            <div className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>
                                <Shield size={14} /> Verification Checklist
                            </div>
                            <div className="verification-list">
                                {result.checks.map(check => (
                                    <div key={check.id} className={`verification-item ${check.status}`}>
                                        <div className="verification-item-label">
                                            {statusIcon[check.status]}
                                            {check.label}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>{check.detail}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Reviewer Note */}
                            <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <MessageSquare size={14} color="var(--color-primary)" />
                                    <span className="fw-600" style={{ fontSize: 13 }}>Reviewer Note</span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditNote(e => !e)} style={{ marginLeft: 'auto' }}>
                                        <Edit2 size={12} /> {editNote ? 'Cancel' : 'Edit'}
                                    </button>
                                </div>
                                {editNote ? (
                                    <div>
                                        <textarea
                                            className="form-textarea"
                                            rows={3}
                                            placeholder="Add your reviewer notes for this article..."
                                            value={note}
                                            onChange={e => setNote(e.target.value)}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => { onUpdateNote(article.id, note); setEditNote(false); }}>
                                                <Save size={13} /> Save Note
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '10px 14px', background: 'var(--color-white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-200)', fontSize: 13.5, color: note ? 'var(--color-gray-700)' : 'var(--color-gray-400)', lineHeight: 1.5 }}>
                                        {note || 'No notes added yet. Click Edit to add.'}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-gray-400)', fontSize: 13.5 }}>
                            <Shield size={28} style={{ marginBottom: 8, opacity: 0.35 }} />
                            <p>Click <strong>Verify</strong> to run algorithmic verification on this article.</p>
                        </div>
                    )}

                    {/* Article Preview */}
                    {(article.full_article || article.summary) && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-white)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-gray-400)', marginBottom: 6 }}>Article Body</div>
                            <p style={{ fontSize: 13.5, color: 'var(--color-gray-600)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {result ? renderHighlightedText(article.full_article || article.summary, result.violations, 'body') : (article.full_article || article.summary)}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────
   Review Report Page
   ────────────────────────────────────────────── */
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

export default function ReviewReport() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [report, setReport] = useState(null);
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [editReport, setEditReport] = useState(false);
    const [reportNotes, setReportNotes] = useState('');
    const [articleStatuses, setArticleStatuses] = useState({});

    // Rule Engine Data
    const [activeRules, setActiveRules] = useState([]);

    // ── AI Assist Drawer State ──
    const [showAssist, setShowAssist] = useState(false);
    const [assistKeyword, setAssistKeyword] = useState('');
    const [assistDateRange, setAssistDateRange] = useState('all');
    const [assistLoading, setAssistLoading] = useState(false);
    const [assistResult, setAssistResult] = useState(null);
    const [assistError, setAssistError] = useState('');
    const [assistHistory, setAssistHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [assistPrompt, setAssistPrompt] = useState(`Structure your output with these exact section headers:

## Executive Summary
## Coverage Volume and Context
## Key Themes Identified
## Notable Coverage Highlights
## Sentiment Overview
## Strategic Insights for Client

Under each header write 2-4 sentences or bullet points (using - prefix). Professional C-suite tone. Be concise.`);
    const [copied, setCopied] = useState(false);

    const fetchAssistHistory = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('ai_assist_history')
                .select('*')
                .eq('report_id', id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setAssistHistory(data || []);
        } catch (err) {
            console.error('Error fetching assist history:', err);
        }
    }, [id]);

    useEffect(() => {
        if (showAssist) fetchAssistHistory();
    }, [showAssist, fetchAssistHistory]);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const { data: reportData, error: rErr } = await supabase
                .from('reports').select('*').eq('id', id).single();
            if (rErr) throw rErr;
            setReport(reportData);
            setReportNotes(reportData.notes || '');

            // Rule Engine Setup:
            // 1. Fetch Fullintel Core
            const { data: fiStd } = await supabase.from('fullintel_standards').select('id').limit(1).maybeSingle();
            // 2. Fetch Client Standard overrides if applicable
            let clientStdId = null;
            if (reportData.client_name) {
                const { data: cStd } = await supabase.from('client_standards').select('id')
                    .eq('client_name', reportData.client_name).limit(1).maybeSingle();
                if (cStd) clientStdId = cStd.id;
            }
            // 3. Query applied rules (Core + Client)
            let ruleQuery = supabase.from('rules').select('*').eq('is_active', true);
            if (clientStdId) {
                ruleQuery = ruleQuery.or(`fullintel_standard_id.eq.${fiStd?.id},client_standard_id.eq.${clientStdId}`);
            } else if (fiStd) {
                ruleQuery = ruleQuery.eq('fullintel_standard_id', fiStd.id);
            }

            const { data: rulesData } = await ruleQuery.order('priority', { ascending: true });
            if (rulesData) setActiveRules(rulesData);

            const { data: linksData, error: lErr } = await supabase
                .from('report_articles')
                .select('article_id, order_index, reviewer_note, article_status')
                .eq('report_id', id)
                .order('order_index');
            if (lErr) throw lErr;

            if (linksData?.length) {
                const articleIds = linksData.map(l => l.article_id);
                // Also fetch the outlet name through the link table
                const { data: articlesData, error: aErr } = await supabase
                    .from('articles')
                    .select('*, article_outlets(outlets(name))')
                    .in('id', articleIds);
                if (aErr) throw aErr;

                const merged = linksData.map(link => {
                    const article = articlesData?.find(a => a.id === link.article_id) || {};
                    return {
                        ...article,
                        source: article.article_outlets?.[0]?.outlets?.name || null,
                        reviewer_note: link.reviewer_note,
                        order_index: link.order_index,
                    };
                });
                merged.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                setArticles(merged);

                const statuses = {};
                linksData.forEach(l => { statuses[l.article_id] = l.article_status || 'pending'; });
                setArticleStatuses(statuses);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    /* ── AI Assist Helpers ── */
    const filterArticlesByDate = (arts, range) => {
        if (range === 'all') return arts;
        const now = new Date();
        const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
        const cutoff = new Date(new Date().setMonth(now.getMonth() - months));
        return arts.filter(a => a.published_date && new Date(a.published_date) >= cutoff);
    };

    const runAssist = async () => {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey || apiKey === 'your_openai_api_key_here') {
            setAssistError('No API key found. Please add VITE_OPENAI_API_KEY to your .env file.');
            return;
        }
        setAssistLoading(true);
        setAssistResult(null);
        setAssistError('');

        const filtered = filterArticlesByDate(articles, assistDateRange);
        if (filtered.length === 0) {
            setAssistError('No articles found for the selected date range.');
            setAssistLoading(false);
            return;
        }

        const articlesSnippet = filtered.map((a, i) => ({
            id: i + 1,
            headline: a.heading,
            date: a.published_date,
            sentiment: a.sentiment,
            excerpt: (a.summary || a.full_article || '').substring(0, 350)
        }));

        const dateLabel = assistDateRange === 'all' ? 'all available time'
            : assistDateRange === '3m' ? 'the past 3 months'
            : assistDateRange === '6m' ? 'the past 6 months'
            : 'the past 12 months';

        const focusKw = assistKeyword || 'General Media Overview';
        const prompt = [
            'CONTEXT: You are a media intelligence analyst.',
            'DATASET: I am providing a curated list of ' + filtered.length + ' news articles for the period ' + dateLabel + '.',
            '',
            'ARTICLE DATA:',
            JSON.stringify(articlesSnippet, null, 2),
            '',
            'TASK: Produce a polished media analysis report focused on: "' + focusKw + '".',
            '',
            assistPrompt
        ].join('\n');

        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'ReviewReport AI Assist'
                },
                body: JSON.stringify({
                    model: 'openai/gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error?.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            
            const resultObj = { content, articleCount: filtered.length, keyword: assistKeyword || 'General Overview', dateRange: dateLabel };
            setAssistResult(resultObj);

            // Save to history
            try {
                await supabase.from('ai_assist_history').insert({
                    report_id: id,
                    keyword: resultObj.keyword,
                    date_range: resultObj.dateRange,
                    prompt: assistPrompt,
                    content: content
                });
                fetchAssistHistory();
            } catch (hErr) {
                console.error('Error saving assist history:', hErr);
            }

        } catch (err) {
            console.error('AI Assist error:', err);
            setAssistError(`Request failed: ${err.message}`);
        } finally {
            setAssistLoading(false);
        }
    };

    const handleCopy = () => {
        if (!assistResult) return;
        navigator.clipboard.writeText(assistResult.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const updateArticleNote = async (articleId, note) => {
        await supabase
            .from('report_articles')
            .update({ reviewer_note: note })
            .eq('report_id', id)
            .eq('article_id', articleId);
    };

    const updateArticleStatus = async (articleId, status) => {
        setArticleStatuses(prev => ({ ...prev, [articleId]: status }));
        await supabase
            .from('report_articles')
            .update({ article_status: status })
            .eq('report_id', id)
            .eq('article_id', articleId);
    };

    const saveReport = async (newStatus) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('reports')
                .update({
                    notes: reportNotes,
                    status: newStatus || report?.status,
                    ai_score: null, // Since we removed point scoring, zero this out in DB as well
                    reviewed_at: new Date().toISOString(),
                    article_count: articles.length,
                })
                .eq('id', id);

            if (error) throw error;
            setSaveMsg('Report saved successfully!');
            setTimeout(() => setSaveMsg(''), 3000);
            fetchReport();
        } catch (err) {
            setSaveMsg('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="loading-wrapper">
            <div className="spinner" />
            <span>Loading report...</span>
        </div>
    );

    if (!report) return (
        <div className="empty-state">
            <AlertCircle size={48} />
            <h3>Report Not Found</h3>
            <button className="btn btn-primary mt-4" onClick={() => navigate('/reports')}>Back to Reports</button>
        </div>
    );

    const approvedCount = Object.values(articleStatuses).filter(s => s === 'approved').length;
    const rejectedCount = Object.values(articleStatuses).filter(s => s === 'rejected').length;
    const pendingCount = articles.length - approvedCount - rejectedCount;
    const overallScore = articles.length > 0 ? Math.round((approvedCount / articles.length) * 100) : 0;

    return (
        <>
            <div>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <span className="breadcrumb-link" onClick={() => navigate('/')}>Home</span>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-link" onClick={() => navigate('/reports')}>Reports</span>
                <span className="breadcrumb-sep">/</span>
                <span>Review</span>
            </div>

            {/* Report Header */}
            <div style={{ background: 'var(--color-white)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <BarChart2 size={22} color="var(--color-primary)" />
                            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-gray-900)' }}>{report.title}</h1>
                            <span className={`badge ${STATUS_CONFIG[report.status]?.badge || 'badge-gray'}`}>
                                {STATUS_CONFIG[report.status]?.label}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-gray-500)' }}>
                            {report.client_name && <span><strong>Client:</strong> {report.client_name}</span>}
                            {report.report_type && <span><strong>Type:</strong> {report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1)}</span>}
                            {report.period_start && report.period_end && (
                                <span>
                                    <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                                    {format(new Date(report.period_start), 'dd MMM yyyy')} – {format(new Date(report.period_end), 'dd MMM yyyy')}
                                </span>
                            )}
                            <span><FileText size={12} style={{ display: 'inline', marginRight: 4 }} />{articles.length} articles</span>
                        </div>
                    </div>

                    {/* Status Overview */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ textAlign: 'center', padding: '8px 14px', background: '#d1fae5', borderRadius: 8 }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-success)' }}>{approvedCount}</div>
                                <div style={{ fontSize: 10.5, color: '#065f46', fontWeight: 600 }}>Approved</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '8px 14px', background: '#fef3c7', borderRadius: 8 }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-warning)' }}>{pendingCount}</div>
                                <div style={{ fontSize: 10.5, color: '#92400e', fontWeight: 600 }}>Pending</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '8px 14px', background: '#fee2e2', borderRadius: 8 }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-danger)' }}>{rejectedCount}</div>
                                <div style={{ fontSize: 10.5, color: '#991b1b', fontWeight: 600 }}>Rejected</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-gray-400)', marginBottom: 6 }}>
                        <span>Review Progress</span>
                        <span>{approvedCount + rejectedCount} / {articles.length} reviewed</span>
                    </div>
                    <div className="progress-bar" style={{ height: 10 }}>
                        <div
                            className="progress-fill pass"
                            style={{ width: `${articles.length ? ((approvedCount + rejectedCount) / articles.length) * 100 : 0}%`, background: 'var(--color-primary)' }}
                        />
                    </div>
                </div>

                {/* Report Actions */}
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/reports')}>
                        <ArrowLeft size={14} /> Back
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditReport(e => !e)}>
                        <Edit2 size={14} /> {editReport ? 'Cancel Edit' : 'Edit Notes'}
                    </button>
                    <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => saveReport('reviewing')}>
                        {saving ? <><span className="spinner spinner-sm" /> Saving...</> : <><Save size={14} /> Save Progress</>}
                    </button>
                    
                    <div style={{ borderLeft: '1px solid var(--color-gray-200)', height: 24, margin: '0 8px' }} />
                    
                    <button 
                        className="btn btn-primary btn-sm" 
                        onClick={() => navigate(`/reports/${id}/insight-brief`)}
                    >
                        <Zap size={14} /> Insight Brief
                    </button>

                    <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
                        onClick={() => navigate(`/reports/${id}/builder`)}
                    >
                        <Layout size={14} /> Edit Design
                    </button>
                    
                    {report.status === 'approved' && (
                        <button 
                            className="btn btn-success btn-sm" 
                            onClick={() => navigate(`/reports/${id}/builder?download=true`)}
                        >
                            <Download size={14} /> Download Final Report
                        </button>
                    )}
                </div>

                {saveMsg && (
                    <div className={`alert ${saveMsg.includes('Failed') ? 'alert-error' : 'alert-success'}`} style={{ marginTop: 12, marginBottom: 0 }}>
                        {saveMsg.includes('Failed') ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                        {saveMsg}
                    </div>
                )}

                {/* Edit Notes Panel */}
                {editReport && (
                    <div style={{ marginTop: 16, padding: '14px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-200)' }}>
                        <label className="form-label">Report Notes / Reviewer Comments</label>
                        <textarea
                            className="form-textarea"
                            rows={3}
                            value={reportNotes}
                            onChange={e => setReportNotes(e.target.value)}
                            placeholder="Add overall report notes..."
                        />
                    </div>
                )}
            </div>

            {/* Info Banner */}
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
                <Info size={16} />
                <span>
                    Use the <strong>Verify</strong> button on each article to run automated quality checks against the defined Rule Engine.
                    Then <strong>Approve</strong> or <strong>Reject</strong> individual articles. Save your progress at any time.
                </span>
            </div>

            {/* Articles */}
            {articles.length === 0 ? (
                <div className="empty-state card">
                    <FileText size={48} />
                    <h3>No Articles in This Report</h3>
                    <p>Edit the report to add articles.</p>
                </div>
            ) : (
                <>
                    <div className="section-title">
                        <FileText size={16} /> Report Articles ({articles.length})
                    </div>
                    {articles.map((article, i) => (
                        <ArticleVerificationCard
                            key={article.id}
                            article={article}
                            index={i}
                            activeRules={activeRules}
                            onUpdateNote={updateArticleNote}
                            onApprove={(aid) => updateArticleStatus(aid, 'approved')}
                            onReject={(aid) => updateArticleStatus(aid, 'rejected')}
                        />
                    ))}
                </>
            )}
        </div>

        {/* -- AI Assist Floating Button -- */}
        <button
            onClick={() => setShowAssist(s => !s)}
            title="AI Research Assist"
            style={{
                position: 'fixed', bottom: 32, right: showAssist ? 520 : 24,
                width: 52, height: 52, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', cursor: 'pointer', zIndex: 1001,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
                transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1), transform 0.2s',
                color: '#fff',
                transform: showAssist ? 'rotate(180deg)' : 'rotate(0deg)'
            }}
        >
            {showAssist ? <X size={22} /> : <Sparkles size={22} />}
        </button>

        {/* -- AI Assist Drawer -- */}
        <div style={{
            position: 'fixed', top: 0, right: showAssist ? 0 : -500,
            width: 480, height: '100vh',
            background: '#fff',
            boxShadow: '-4px 0 30px rgba(0,0,0,0.12)',
            zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
            borderLeft: '1px solid #e0e7ff'
        }}>
            {/* Drawer Header */}
            <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                display: 'flex', alignItems: 'center', gap: 10,
                flexShrink: 0
            }}>
                <Bot size={20} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>AI Research Assist</div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>Powered by OpenRouter · GPT-4o-mini</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        title="View History"
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <HistoryIcon size={16} />
                        <span style={{ fontSize: 11, fontWeight: 700 }}>History</span>
                    </button>
                    <button
                        onClick={() => setShowAssist(false)}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', cursor: 'pointer' }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* History View Overlay */}
            {showHistory && (
                <div style={{
                    position: 'absolute', top: 54, left: 0, right: 0, bottom: 0,
                    background: '#fff', zIndex: 100, display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#475569' }}>Research History</div>
                        <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Close History</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                        {assistHistory.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                <Clock size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
                                <p style={{ fontSize: 13 }}>No research history found for this report.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {assistHistory.map((h) => (
                                    <div 
                                        key={h.id} 
                                        onClick={() => {
                                            setAssistResult({ content: h.content, keyword: h.keyword, dateRange: h.date_range });
                                            setAssistKeyword(h.keyword);
                                            if (h.prompt) setAssistPrompt(h.prompt);
                                            setShowHistory(false);
                                        }}
                                        style={{ 
                                            padding: 14, border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer',
                                            transition: 'all 0.2s', background: '#fff'
                                        }}
                                        onMouseOver={e => e.currentTarget.style.borderColor = '#6366f1'}
                                        onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <div style={{ fontWeight: 800, fontSize: 12, color: '#1e1b4b' }}>{h.keyword || 'General Overview'}</div>
                                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{format(new Date(h.created_at), 'MMM d, HH:mm')}</div>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Range: {h.date_range}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {h.content}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Controls */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                {/* Keyword Input */}
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                        Focus Keyword / Theme
                    </label>
                    <div style={{ position: 'relative' }}>
                        <Sparkles size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6366f1' }} />
                        <input
                            value={assistKeyword}
                            onChange={e => setAssistKeyword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !assistLoading && runAssist()}
                            placeholder='e.g. "oncology", "drug approval", "Q1 media"'
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '9px 12px 9px 32px',
                                border: '1.5px solid #e0e7ff', borderRadius: 8,
                                fontSize: 13, outline: 'none',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e0e7ff'}
                        />
                    </div>
                </div>

                {/* Date Range */}
                <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                        <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                        Date Range Filter
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[
                            { value: 'all', label: 'All Time' },
                            { value: '3m', label: 'Past 3M' },
                            { value: '6m', label: 'Past 6M' },
                            { value: '12m', label: 'Past 12M' },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setAssistDateRange(opt.value)}
                                style={{
                                    flex: 1, padding: '6px 4px', fontSize: 11.5, fontWeight: 600,
                                    border: `1.5px solid ${assistDateRange === opt.value ? '#6366f1' : '#e5e7eb'}`,
                                    borderRadius: 6, cursor: 'pointer',
                                    background: assistDateRange === opt.value ? '#6366f1' : '#fff',
                                    color: assistDateRange === opt.value ? '#fff' : '#6b7280',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Prompt */}
                <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                        <Edit2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                        Custom Analysis Prompt
                    </label>
                    <textarea 
                        value={assistPrompt}
                        onChange={e => setAssistPrompt(e.target.value)}
                        placeholder="Customize what the AI should look for or how to structure the report..."
                        style={{
                            width: '100%', height: 100, boxSizing: 'border-box',
                            padding: '9px 12px',
                            border: '1.5px solid #e0e7ff', borderRadius: 8,
                            fontSize: 12, outline: 'none',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            background: '#fcfcfc'
                        }}
                    />
                </div>

                {/* Stats Bar */}
                <div style={{ background: '#f8f7ff', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#6366f1', display: 'flex', justifyContent: 'space-between' }}>
                    <span>📄 {filterArticlesByDate(articles, assistDateRange).length} articles in range</span>
                    <span>📊 {report?.title?.substring(0, 22)}{report?.title?.length > 22 ? '…' : ''}</span>
                </div>

                {/* Generate Button */}
                <button
                    onClick={runAssist}
                    disabled={assistLoading}
                    style={{
                        width: '100%', marginTop: 12, padding: '10px 16px',
                        background: assistLoading ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none', borderRadius: 8, color: '#fff',
                        fontSize: 13.5, fontWeight: 700, cursor: assistLoading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'opacity 0.2s'
                    }}
                >
                    {assistLoading
                        ? <><span className="spinner spinner-sm" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> Generating Analysis...</>
                        : <><Send size={14} /> Generate Report Summary</>
                    }
                </button>
            </div>

            {/* Output Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {assistError && (
                    <div style={{
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                        padding: '12px 14px', color: '#b91c1c', fontSize: 13,
                        display: 'flex', gap: 8, alignItems: 'flex-start'
                    }}>
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{assistError}</span>
                    </div>
                )}

                {!assistResult && !assistLoading && !assistError && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                        <Bot size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                            Enter a <strong style={{ color: '#6366f1' }}>keyword or theme</strong>, choose a date range, and click <strong style={{ color: '#6366f1' }}>Generate</strong> to get an AI-powered consolidated summary of this report.
                        </p>
                        <p style={{ fontSize: 11.5, color: '#c4b5fd', marginTop: 8 }}>Examples: "oncology", "Q1 earnings", "media sentiment", "Japan coverage"</p>
                    </div>
                )}

                {assistLoading && (
                    <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px'
                        }}>
                            <Sparkles size={22} color="#fff" />
                        </div>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: '#6366f1' }}>Analysing {filterArticlesByDate(articles, assistDateRange).length} articles...</p>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>This may take a few seconds</p>
                    </div>
                )}

                {assistResult && (
                    <>
                        {/* Result Meta */}
                        <div style={{
                            background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                            border: '1px solid #c7d2fe', borderRadius: 10,
                            padding: '12px 14px', marginBottom: 16,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
                        }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca' }}>📌 Focus: "{assistResult.keyword}"</div>
                                <div style={{ fontSize: 11, color: '#6366f1', marginTop: 2 }}>Based on {assistResult.articleCount} articles · {assistResult.dateRange}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => navigate(`/reports/${id}/insight-brief`, { 
                                        state: { 
                                            initialSummary: assistResult.content,
                                            keyword: assistResult.keyword
                                        } 
                                    })}
                                    style={{
                                        padding: '5px 12px', fontSize: 11.5, fontWeight: 700,
                                        border: 'none', borderRadius: 6,
                                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                        color: '#fff',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        transition: 'transform 0.15s, box-shadow 0.15s',
                                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                >
                                    <PlusCircle size={12} /> Create Insight Brief
                                </button>
                                <button
                                    onClick={handleCopy}
                                    style={{
                                        padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                                        border: '1px solid #c7d2fe', borderRadius: 6,
                                        background: copied ? '#6366f1' : '#fff',
                                        color: copied ? '#fff' : '#6366f1',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <Copy size={11} /> {copied ? 'Copied!' : 'Copy'}
                                </button>
                                <button
                                    onClick={() => { setAssistResult(null); setAssistError(''); }}
                                    title="Clear result"
                                    style={{
                                        padding: '5px 8px', fontSize: 11.5,
                                        border: '1px solid #e5e7eb', borderRadius: 6,
                                        background: '#fff', color: '#6b7280',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                    }}
                                >
                                    <RotateCcw size={11} /> Reset
                                </button>
                            </div>
                        </div>

                        {/* Rendered Markdown */}
                        <div style={{
                            background: '#fafafa', border: '1px solid #f0f0f0',
                            borderRadius: 10, padding: '16px 18px',
                            fontSize: 13, lineHeight: 1.7
                        }}>
                            {renderMarkdown(assistResult.content)}
                        </div>
                    </>
                )}
            </div>
        </div>
        </>
    );
}
