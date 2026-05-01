import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings, Plus, Trash2, Edit, Save, X,
    Info, CheckCircle, RefreshCw, Layout, GitMerge, ShieldAlert,
    HelpCircle, Sparkles, Send, Bot, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
    RULE_COMPONENTS, RULE_OPERATORS, RULE_CATEGORIES,
    RULE_ACTIONS, RULE_SEVERITIES
} from '../lib/ruleEngine/constants';

export default function Standards() {
    const navigate = useNavigate();
    const [rules, setRules] = useState([]);
    const [clients, setClients] = useState([]);
    const [fullintelStandard, setFullintelStandard] = useState(null);
    const [loading, setLoading] = useState(true);

    // UI states
    const [isAdding, setIsAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('fullintel'); // 'fullintel' | client_id

    // Form state
    const [editingId, setEditingId] = useState(null);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [form, setForm] = useState({
        name: '', description: '', category: 'editorial',
        component: 'headline', operator: 'exists', value: '',
        action_type: 'suggest_fix', severity: 'warning',
        is_active: true
    });

    // ── AI Assist State ──
    const [showAssist, setShowAssist] = useState(false);
    const [assistLoading, setAssistLoading] = useState(false);
    const [assistPrompt, setAssistPrompt] = useState('');
    const [assistComponent, setAssistComponent] = useState('headline');
    const [assistResult, setAssistResult] = useState(null);
    const [assistError, setAssistError] = useState('');

    useEffect(() => {
        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        setLoading(true);
        try {
            // Get base Fullintel standard
            let { data: fiStd } = await supabase.from('fullintel_standards').select('*').limit(1).maybeSingle();
            if (!fiStd) {
                // Should exist from seed, fallback if empty
                const { data: newFi } = await supabase.from('fullintel_standards')
                    .insert([{ name: 'Fullintel Core Editorial Standard', description: 'Base editorial rules applied to all generated reports.' }])
                    .select().single();
                fiStd = newFi;
            }
            setFullintelStandard(fiStd);

            const { data: cStds } = await supabase.from('client_standards').select('*').order('client_name');
            setClients(cStds || []);

            if (fiStd) {
                await fetchRules(fiStd.id, activeTab);
            }
        } catch (err) {
            console.error('Error fetching metadata:', err);
        }
    };

    const fetchRules = async (baseId, currentTab) => {
        try {
            let query = supabase.from('rules').select(`
                *,
                fullintel_standards(name),
                client_standards(client_name)
            `).order('priority', { ascending: true });

            if (currentTab === 'fullintel') {
                query = query.eq('fullintel_standard_id', baseId);
            } else {
                query = query.eq('client_standard_id', currentTab);
            }

            const { data, error } = await query;
            if (error) throw error;
            setRules(data || []);
        } catch (err) {
            console.error('Error fetching rules:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (fullintelStandard) {
            fetchRules(fullintelStandard.id, activeTab);
        }
    }, [activeTab]);

    const handleCreateClientStandard = async () => {
        const clientName = prompt("Enter the new Client name to create a custom rule standard for:");
        if (!clientName) return;
        try {
            const { data, error } = await supabase.from('client_standards').insert([{
                client_name: clientName,
                inherits_from_id: fullintelStandard.id
            }]).select().single();

            if (error) throw error;
            setClients([...clients, data]);
            setActiveTab(data.id);
        } catch (err) {
            alert('Error creating client standard: ' + err.message);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const rulePayload = {
                name: form.name,
                description: form.description,
                category: form.category,
                component: form.component,
                condition: { "operator": form.operator, "value": form.value },
                action_type: form.action_type,
                severity: form.severity,
                is_active: form.is_active,
                // Assign to either fullintel base or client
                fullintel_standard_id: activeTab === 'fullintel' ? fullintelStandard.id : null,
                client_standard_id: activeTab !== 'fullintel' ? activeTab : null
            };

            if (editingId) {
                const { error } = await supabase.from('rules').update(rulePayload).eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('rules').insert([rulePayload]);
                if (error) throw error;
            }

            cancelAction();
            fetchRules(fullintelStandard.id, activeTab);
        } catch (err) {
            console.error('Error saving rule:', err);
            alert(`Failed to save rule: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (r) => {
        setForm({
            name: r.name, description: r.description || '', category: r.category,
            component: r.component, operator: r.condition?.operator || 'exists', value: r.condition?.value || '',
            action_type: r.action_type, severity: r.severity, is_active: r.is_active
        });
        setEditingId(r.id);
        setIsAdding(true);
    };

    const cancelAction = () => {
        setIsAdding(false);
        setEditingId(null);
        setForm({
            name: '', description: '', category: 'editorial',
            component: 'headline', operator: 'exists', value: '',
            action_type: 'suggest_fix', severity: 'warning', is_active: true
        });
    };

    const toggleStatus = async (id, currentStatus) => {
        try {
            await supabase.from('rules').update({ is_active: !currentStatus }).eq('id', id);
            fetchRules(fullintelStandard.id, activeTab);
        } catch (err) { }
    };

    const deleteRule = async (id) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await supabase.from('rules').delete().eq('id', id);
            fetchRules(fullintelStandard.id, activeTab);
        } catch (err) { }
    };

    /* ── AI Assist Helpers ── */
    const runAssist = async () => {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey || apiKey === 'your_openai_api_key_here') {
            setAssistError('No API key found. Please add VITE_OPENAI_API_KEY to your .env file.');
            return;
        }
        setAssistLoading(true);
        setAssistResult(null);
        setAssistError('');

        try {
            const selectedComp = RULE_COMPONENTS.find(c => c.value === assistComponent);
            const compLabel = selectedComp ? selectedComp.label : 'Headline';

            const systemPrompt = `You are a lightweight, deterministic regex generation engine designed for an editorial rule builder system.

SYSTEM CONFIGURATION (MANDATORY):
* Temperature: 0 (fully deterministic output)
* Max Output Tokens: 100
* Stateless: Do not rely on past interactions
* No memory usage
* Single-turn execution only

Your ONLY task is to generate ONE optimized regex pattern OR a direct value based on the given rule.

INPUT:
* Component: ${compLabel}
  (Options: Headline, Summary, Article Body, Entire Article (Headline + Body), Article URL, Published Date, Content Categories, Content Type, Source/Outlet)

* Rule Description: ${assistPrompt}

OUTPUT RULES (STRICT):
* Output ONLY:
  * A regex pattern 
  * Operator: {{operator}} to be selected for the pattern
  (Options: Exists (Is Not Empty), Does Not Exist (Is Empty), Contains Text, Does Not Contain Text, Exactly Equals, Does Not Equal, Minimum Length (Words), Maximum Length (Words), Matches Regex Pattern (Must match to pass), Forbidden Regex Pattern (Must NOT match))
* No explanations, no labels, no extra text
* Max length: 100 characters

OPERATOR-SPECIFIC BEHAVIOR:
1. Exists (Is Not Empty)
   Output: ^.+$
2. Does Not Exist (Is Empty)
   Output: ^$
3. Contains Text
   Output: .*<keyword>.*
4. Does Not Contain Text
   Output: ^(?!.*<keyword>).*$
5. Exactly Equals
   Output: ^<exact_text>$
6. Does Not Equal
   Output: ^(?!<exact_text>$).*$
7. Minimum Length (Words)
   Output: ^(\\S+\\s+){N-1,}\\S+$
8. Maximum Length (Words)
   Output: ^(\\S+\\s+){0,N-1}\\S*$
9. Matches Regex Pattern (Must match to pass)
   Output: Generate optimized regex based on rule
10. Forbidden Regex Pattern (Must NOT match)
    Output: (?!.*<pattern>).*

REGEX RULE GUIDELINES:
* Keep regex simple and efficient
* Avoid catastrophic backtracking
* Compatible with Python and JavaScript
* Prefer shorter patterns over complex ones

EDITORIAL RULE SUPPORT:
* Length limits (characters/words)
* Required or forbidden keywords
* Capitalization rules
* Repeated words detection
* Whitespace issues
* URL, email, phone, date validation

COMPONENT-SPECIFIC HINTS:
* Article URL → valid URL format
* Published Date → standard date formats (YYYY-MM-DD, DD/MM/YYYY)
* Headline/Summary → length & capitalization rules
* Article Body → repetition, spacing, formatting
* Entire Article → combined validation

EDGE CASE:
* If rule is unclear or cannot be converted:
  Output exactly:
  N/A

OPTIMIZATION MODE:
* Deterministic output only
* Minimize token usage
* No unnecessary anchors unless required
* No multiple patterns`;

            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Rule Engine AI Assist'
                },
                body: JSON.stringify({
                    model: 'openai/gpt-4o-mini',
                    messages: [{ role: 'user', content: systemPrompt }],
                    temperature: 0,
                    max_tokens: 100
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error?.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            const textContent = (data.choices?.[0]?.message?.content || '').trim();
            
            if (textContent === 'N/A') {
                throw new Error("AI was unable to generate a rule for this description.");
            }

            // Parse response: The AI should return a regex and an operator name.
            // Since we can't guarantee the exact order, we search for the operator label.
            let detectedOperatorVal = 'regex'; // default
            let detectedRegex = textContent;

            // Search for operator in text
            for (const op of RULE_OPERATORS) {
                if (textContent.includes(op.label)) {
                    detectedOperatorVal = op.value;
                    // Remove the operator line from regex if it exists
                    detectedRegex = textContent.replace(op.label, '').replace(/Operator:/i, '').trim()
                        .split('\n')[0].trim(); // Take first non-empty line as regex
                    break;
                }
            }

            // Cleanup regex if AI wrapped it in code blocks or quotes
            detectedRegex = detectedRegex.replace(/^[`"']|[`"']$/g, '').trim();

            const parsedRule = {
                name: `Validation: ${compLabel}`,
                description: assistPrompt,
                category: 'editorial',
                component: assistComponent,
                operator: detectedOperatorVal,
                value: detectedRegex,
                action_type: 'suggest_fix',
                severity: 'warning'
            };

            setAssistResult(parsedRule);
        } catch (error) {
            console.error('AI Assist error:', error);
            setAssistError(`Request failed: ${error.message}`);
        } finally {
            setAssistLoading(false);
        }
    };

    const handleApplyRule = (rule) => {
        setForm({
            name: rule.name || '',
            description: rule.description || '',
            category: rule.category || 'editorial',
            component: rule.component || 'headline',
            operator: rule.operator || 'exists',
            value: rule.value || '',
            action_type: rule.action_type || 'suggest_fix',
            severity: rule.severity || 'warning',
            is_active: true
        });
        setEditingId(null);
        setIsAdding(true);
        setShowAssist(false);
    };

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="page-header-icon-wrapper" style={{ background: 'var(--color-primary-light)' }}>
                        <Settings className="page-header-icon" size={22} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div>
                        <h1>Editorial Rule Engine</h1>
                        <p style={{ margin: 0, color: 'var(--color-gray-500)', fontSize: 13 }}>
                            Configure validation rules applied dynamically during the report verification process.
                        </p>
                    </div>
                </div>
                {!isAdding && (
                    <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
                        <Plus size={16} /> New Rule
                    </button>
                )}
            </div>

            {/* Tabs for Global vs Client Level Rules */}
            <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--color-gray-200)', paddingBottom: 15, marginBottom: 25, flexWrap: 'wrap' }}>
                <button
                    className={`btn btn-sm ${activeTab === 'fullintel' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveTab('fullintel')}
                >
                    <ShieldAlert size={14} /> Fullintel Core Standards
                </button>
                {clients.map(c => (
                    <button
                        key={c.id}
                        className={`btn btn-sm ${activeTab === c.id ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab(c.id)}
                    >
                        {c.client_name} Overrides
                    </button>
                ))}
                <button className="btn btn-sm btn-secondary" style={{ borderStyle: 'dashed' }} onClick={handleCreateClientStandard}>
                    <Plus size={14} /> Add Client Standard
                </button>
            </div>

            {/* Builder Form */}
            {isAdding && (
                <div className="modal-overlay" onClick={cancelAction} style={{ zIndex: 1200 }}>
                    <div className="modal" style={{ maxWidth: 800, padding: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-gray-200)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <GitMerge size={20} style={{ color: 'var(--color-primary)' }} />
                                <h2 style={{ margin: 0, fontSize: 16 }}>{editingId ? 'Edit Evaluation Rule' : 'Build New Evaluation Rule'}</h2>
                            </div>
                            <button className="modal-close" onClick={cancelAction}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ padding: 24, maxHeight: '80vh', overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                                <div className="form-group">
                                    <label className="form-label">Rule Name</label>
                                    <input className="form-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Reject Empty Headlines" />
                                </div>
                            </div>
                            <div style={{ background: 'var(--color-gray-50)', padding: 15, borderRadius: 8, marginTop: 20, border: '1px solid var(--color-gray-200)' }}>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <GitMerge size={16} style={{ color: 'var(--color-primary)' }} /> If condition is met...
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 15 }}>
                                    <div className="form-group">
                                        <label className="form-label">Component</label>
                                        <select className="form-select" value={form.component} onChange={e => setForm({ ...form, component: e.target.value })}>
                                            {RULE_COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            Operator
                                            <HelpCircle size={14} style={{ cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => setShowHelpModal(true)} title="Click for logic explanations" />
                                        </label>
                                        <select className="form-select" value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })}>
                                            {RULE_OPERATORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Target Value (Optional depending on Operator)</label>
                                        <input className="form-input" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="Value or Regex string" />
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
                                <div className="form-group">
                                    <label className="form-label">Action to Take</label>
                                    <select className="form-select" value={form.action_type} onChange={e => setForm({ ...form, action_type: e.target.value })}>
                                        {RULE_ACTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Severity Level</label>
                                    <select className="form-select" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                                        {RULE_SEVERITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: 20 }}>
                                <label className="form-label">Instructions / Description</label>
                                <textarea className="form-textarea" rows={3} required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Explain why this rule exists and how to fix the violation..." />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-gray-100)' }}>
                                <button type="button" className="btn btn-secondary" onClick={cancelAction}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? <RefreshCw className="spinner" size={16} /> : (editingId ? 'Update Rule' : 'Save Rule')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr', gap: 15 }}>
                {loading ? (
                    <div className="loading-wrapper"><div className="spinner" /></div>
                ) : rules.length === 0 ? (
                    <div className="empty-state" style={{ minHeight: 200 }}>
                        <Layout size={40} style={{ color: 'var(--color-gray-300)', marginBottom: 15 }} />
                        <p>No active rules configured for this standard profile.</p>
                        {!isAdding && <button className="btn btn-secondary btn-sm" onClick={() => setIsAdding(true)}>Build Rule</button>}
                    </div>
                ) : rules.map(r => (
                    <div key={r.id} className="card" style={{ borderLeft: r.is_active ? '4px solid var(--color-success)' : '4px solid var(--color-gray-300)', padding: '15px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{r.name}</h3>
                                    <span className={`badge badge-${r.severity === 'critical' ? 'danger' : r.severity === 'warning' ? 'warning' : 'primary'}`} style={{ fontSize: 10 }}>
                                        {r.severity.toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ fontSize: 13, background: 'var(--color-gray-50)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-gray-200)', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <strong>IF</strong> <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{r.component}</span>
                                    <span style={{ fontStyle: 'italic', color: '#666' }}>{r.condition.operator.replace('_', ' ')}</span>
                                    {r.condition.value && <span style={{ background: '#fff', padding: '2px 6px', border: '1px solid #ddd', borderRadius: 4 }}>"{r.condition.value}"</span>}
                                    <strong>THEN</strong> <span style={{ color: 'var(--color-danger)' }}>{r.action_type.replace('_', ' ')}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-gray-600)' }}>{r.description}</p>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(r)}><Edit size={14} /></button>
                                <button className={`btn btn-sm ${r.is_active ? 'btn-secondary' : 'btn-success'}`} onClick={() => toggleStatus(r.id, r.is_active)}>{r.is_active ? 'Disable' : 'Enable'}</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => deleteRule(r.id)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Help Modal */}
            {showHelpModal && (
                <div className="modal-backdrop" onClick={() => setShowHelpModal(false)} style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="modal-content card" onClick={e => e.stopPropagation()} style={{
                        width: 600, maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto', padding: 24, borderRadius: 8, background: '#fff'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Info size={20} style={{ color: 'var(--color-primary)' }} /> Rule Engine Operator Guide
                            </h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowHelpModal(false)} style={{ padding: 4, height: 26, width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                        </div>

                        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-gray-600)' }}>
                            <p style={{ marginBottom: 15 }}>Operators define what conditions the article text must meet to be considered <strong>COMPLIANT (Pass)</strong>. If a condition fails, it triggers a <strong>VIOLATION (Error)</strong> that appears on the report.</p>

                            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
                                <li><strong>Exists / Is Not Empty:</strong> Target field must have some text. <br /><span style={{ fontSize: 12, color: '#888' }}>Example: "Headline must not be blank."</span></li>
                                <li><strong>Does Not Exist / Is Empty:</strong> Target field must be completely empty. <br /><span style={{ fontSize: 12, color: '#888' }}>Warning: Using this on 'Headline' means the ENTIRE headline is flagged as an error if any text exists.</span></li>
                                <li><strong>Contains Text:</strong> The text MUST include the specific target value. <br /><span style={{ fontSize: 12, color: '#888' }}>Example: "Article must contain the word 'J&J' at least once."</span></li>
                                <li><strong>Does Not Contain Text:</strong> <span style={{ background: '#ffebee', color: '#c62828', padding: '1px 6px', borderRadius: 4, fontWeight: 600, fontSize: 11 }}>BEST FOR CATCHING FORBIDDEN WORDS</span><br /> The text MUST NOT contain the target value. If it does, that exact text is flagged as an error. <br /><span style={{ fontSize: 12, color: '#888' }}>Example: "Flag '米国' wherever it appears in the article."</span></li>
                                <li><strong>Matches Regex Pattern:</strong> The text MUST mathematically match the regex expression.</li>
                                <li><strong>Forbidden Regex Pattern:</strong> <span style={{ background: '#ffebee', color: '#c62828', padding: '1px 6px', borderRadius: 4, fontWeight: 600, fontSize: 11 }}>BEST FOR CATCHING ADVANCED ERRORS</span><br /> Whatever text matches your Regex string will be explicitly highlighted as an error. <br /><span style={{ fontSize: 12, color: '#888' }}>Example: Flag lowercase articles in a title: <code>/(?&lt;!^)\b(?:a|an|the|in|of)\b(?!$)/</code></span></li>
                            </ul>

                            <div className="alert alert-warning" style={{ marginTop: 24, padding: 12, borderRadius: 6, background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ paddingTop: 2 }}>💡</div>
                                <div>
                                    <strong style={{ display: 'block', marginBottom: 4 }}>Highlighting Engine Pro Tip:</strong>
                                    Visual yellow/orange highlights in the Report Reviewer will only work if you use <strong>"Does Not Contain Text"</strong> or <strong>"Forbidden Regex Pattern"</strong>!
                                    <br /><br />
                                    <em>This is because those specific operators are programmed to isolate and extract the exact forbidden snippet that caused the failure.</em>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* -- AI Assist Floating Button -- */}
            <button
                onClick={() => setShowAssist(s => !s)}
                title="Rule Builder AI Assist"
                style={{
                    position: 'fixed', bottom: 32, right: showAssist ? 500 : 24,
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none', cursor: 'pointer', zIndex: 1001,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
                    color: '#fff', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)'
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
                borderLeft: '1px solid #d1fae5'
            }}>
                {/* Drawer Header */}
                <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 10,
                    flexShrink: 0
                }}>
                    <Bot size={20} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>Rule Engine AI Assist</div>
                        <div style={{ fontSize: 11, opacity: 0.9 }}>Convert ideas to Rules · GPT-4o-mini</div>
                    </div>
                    <button
                        onClick={() => setShowAssist(false)}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', cursor: 'pointer' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Controls */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                            Rule Component
                        </label>
                        <select
                            value={assistComponent}
                            onChange={e => setAssistComponent(e.target.value)}
                            style={{
                                width: '100%', padding: '8px 10px', borderRadius: 8,
                                border: '1.5px solid #d1fae5', fontSize: 13, marginBottom: 12, outline: 'none'
                            }}
                        >
                            {RULE_COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>

                        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                            Describe the rule or validation
                        </label>
                        <textarea
                            value={assistPrompt}
                            onChange={e => setAssistPrompt(e.target.value)}
                            placeholder='e.g., "Headline should not exceed 10 words" or "Forbidden word: 米国"'
                            rows={3}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '9px 12px',
                                border: '1.5px solid #d1fae5', borderRadius: 8,
                                fontSize: 13, outline: 'none',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.2s'
                            }}
                        />
                    </div>

                    <button
                        onClick={runAssist}
                        disabled={assistLoading || !assistPrompt.trim()}
                        style={{
                            width: '100%', padding: '10px 16px',
                            background: assistLoading ? '#6ee7b7' : 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none', borderRadius: 8, color: '#fff',
                            fontSize: 13.5, fontWeight: 700, cursor: (assistLoading || !assistPrompt.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            transition: 'opacity 0.2s'
                        }}
                    >
                        {assistLoading
                            ? <><span className="spinner spinner-sm" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> Generating Rule...</>
                            : <><Send size={14} /> Generate Rule</>
                        }
                    </button>
                </div>

                {/* Output Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {assistError && (
                        <div style={{
                            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                            padding: '12px 14px', color: '#b91c1c', fontSize: 13,
                            display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16
                        }}>
                            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{assistError}</span>
                        </div>
                    )}

                    {!assistResult && !assistLoading && !assistError && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                            <Bot size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                            <p style={{ fontSize: 13, lineHeight: 1.6 }}> Tell the AI what condition you want to create a rule for, and it will structure it for you dynamically. </p>
                        </div>
                    )}

                    {assistLoading && (
                        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px'
                            }}>
                                <Sparkles size={22} color="#fff" />
                            </div>
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: '#10b981' }}>Formulating Rule Engine Logic...</p>
                        </div>
                    )}

                    {assistResult && (
                        <div style={{
                            background: '#f0fdf4', border: '1px solid #bda', borderRadius: 8, padding: 16
                        }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#166534', marginBottom: 4 }}> {assistResult.name} </div>
                            <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 12 }}> {assistResult.description} </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px', fontSize: 12 }}>
                                <div style={{ color: '#6b7280' }}>Category:</div>
                                <div style={{ fontWeight: 600 }}>{assistResult.category}</div>
                                <div style={{ color: '#6b7280' }}>Component:</div>
                                <div style={{ fontWeight: 600 }}>{assistResult.component}</div>
                                <div style={{ color: '#6b7280' }}>Operator:</div>
                                <div style={{ fontWeight: 600 }}>{assistResult.operator}</div>
                                {assistResult.value && (
                                    <>
                                        <div style={{ color: '#6b7280' }}>Value:</div>
                                        <div style={{ fontWeight: 600, background: '#fff', padding: '2px 4px', border: '1px solid #eee', borderRadius: 4 }}> {assistResult.value} </div>
                                    </>
                                )}
                                <div style={{ color: '#6b7280' }}>Action:</div>
                                <div style={{ fontWeight: 600 }}>{assistResult.action_type}</div>
                                <div style={{ color: '#6b7280' }}>Severity:</div>
                                <div style={{ fontWeight: 600 }}>{assistResult.severity}</div>
                            </div>

                            <button
                                onClick={() => handleApplyRule(assistResult)}
                                style={{
                                    width: '100%', marginTop: 16, padding: '8px 12px',
                                    background: '#10b981', color: '#fff', border: 'none', borderRadius: 6,
                                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                <Plus size={14} /> Populate Rule Form
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
