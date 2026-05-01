import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    Layout, Image as ImageIcon, Type, AlignLeft, AlignCenter, AlignRight, 
    AlignJustify, Palette, Eye, Save, Download, ArrowLeft,
    CheckCircle, AlertCircle, FileText, Upload, Sparkles,
    Trash2, Edit3, Type as FontIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

const FONTS = [
    { name: 'Inter', family: "'Inter', system-ui, -apple-system, sans-serif" },
    { name: 'Roboto', family: "'Roboto', 'Helvetica Neue', Arial, sans-serif" },
    { name: 'Georgia', family: "Georgia, 'Times New Roman', Times, serif" },
    { name: 'Merriweather', family: "'Merriweather', serif" },
    { name: 'Outfit', family: "'Outfit', sans-serif" }
];

export default function ReportBuilder() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const activeVersion = location.state?.activeVersion;

    const [report, setReport] = useState(null);
    const [content, setContent] = useState(activeVersion?.content || '');
    const [config, setConfig] = useState({
        logo_url: '',
        text_alignment: 'left',
        theme_color: '#0097a7',
        font_family: 'Inter',
        header_style: 'classic', // classic, modern, elegant
        show_page_border: false,
        border_color: '#e2e8f0',
        content_spacing: 'normal', // compact, normal, spacious
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [logoPreview, setLogoPreview] = useState(null);
    const [stylePrompt, setStylePrompt] = useState('');
    const [applyingStyle, setApplyingStyle] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: reportData } = await supabase
                    .from('reports').select('*').eq('id', id).single();
                setReport(reportData);

                const { data: configData } = await supabase
                    .from('report_final_configs').select('*').eq('report_id', id).maybeSingle();
                
                if (configData) {
                    setConfig({
                        logo_url: configData.logo_url || '',
                        text_alignment: configData.text_alignment || 'left',
                        theme_color: configData.theme_color || '#0097a7',
                        font_family: configData.font_family || 'Inter',
                        header_style: configData.header_style || 'classic',
                        show_page_border: configData.show_page_border || false,
                        border_color: configData.border_color || '#e2e8f0',
                        content_spacing: configData.content_spacing || 'normal',
                    });
                    if (configData.logo_url) setLogoPreview(configData.logo_url);
                }

                // Prioritize the version passed from Insight Brief
                if (location.state?.activeVersion?.content) {
                    setContent(location.state.activeVersion.content);
                } else if (configData?.final_content) {
                    setContent(configData.final_content);
                }
            } catch (err) {
                console.error('Error fetching config:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const handleApplyStyle = async () => {
        if (!stylePrompt.trim()) return;
        setApplyingStyle(true);
        try {
            const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
            const prompt = `
                User Style Request: "${stylePrompt}"
                Suggest the best design configuration for a professional media report.
                Return ONLY a JSON object with these keys:
                - theme_color (hex)
                - text_alignment (left, center, right, justify)
                - font_family (Inter, Roboto, Georgia, Merriweather, Outfit)
                - header_style (classic, modern, elegant)
                - show_page_border (boolean)
                - border_color (hex)
                - content_spacing (compact, normal, spacious)
            `;

            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'HTTP-Referer': window.location.origin,
                },
                body: JSON.stringify({
                    model: 'openai/gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' }
                })
            });

            if (!res.ok) throw new Error('AI Style Suggestion failed');
            const data = await res.json();
            const suggestions = JSON.parse(data.choices[0].message.content);

            setConfig(prev => ({
                ...prev,
                ...suggestions
            }));
            
            setStylePrompt('');
        } catch (err) {
            console.error('Error applying style:', err);
            alert('Failed to apply style: ' + err.message);
        } finally {
            setApplyingStyle(false);
        }
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result);
                setConfig(prev => ({ ...prev, logo_url: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (isFinal = false) => {
        setSaving(true);
        console.log('Saving report config...', { isFinal, id, config });
        try {
            const { data: existing, error: fetchErr } = await supabase
                .from('report_final_configs')
                .select('id')
                .eq('report_id', id)
                .maybeSingle();

            if (fetchErr) throw fetchErr;

            const payload = {
                report_id: id,
                ...config,
                final_content: content,
                is_finalized: isFinal,
                updated_at: new Date().toISOString()
            };

            let result;
            if (existing) {
                console.log('Updating existing config:', existing.id);
                result = await supabase.from('report_final_configs').update(payload).eq('id', existing.id);
            } else {
                console.log('Inserting new config');
                result = await supabase.from('report_final_configs').insert(payload);
            }

            if (result.error) throw result.error;
            console.log('Save successful');

            if (isFinal) {
                // Update report status to approved
                const { error: rUpdateErr } = await supabase.from('reports').update({ status: 'approved' }).eq('id', id);
                if (rUpdateErr) throw rUpdateErr;
                
                alert('Report finalized and saved successfully!');
                navigate(`/reports/${id}`);
            } else {
                alert('Draft saved successfully!');
            }
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDownload = () => {
        window.print();
    };

    if (loading) return <div className="loading-wrapper"><div className="spinner" /></div>;

    return (
        <div className="report-builder-wrapper" style={{ display: 'flex', height: 'calc(100vh - 52px)', margin: '-24px -32px' }}>
            {/* Sidebar Controls */}
            <div className="builder-sidebar no-print" style={{ 
                width: 340, 
                background: 'var(--color-white)', 
                borderRight: '1px solid var(--color-gray-200)', 
                display: 'flex', 
                flexDirection: 'column',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 10
            }}>
                <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--color-gray-100)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-gray-400)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                        <Layout size={14} /> Report Customization
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>Design & Content</h2>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    {/* AI Prompt Assist Section */}
                    <div className="control-group" style={{ 
                        marginBottom: 32, 
                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', 
                        padding: 16, 
                        borderRadius: 12,
                        border: '1px solid #e2e8f0'
                    }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-primary)', fontWeight: 800 }}>
                            <Sparkles size={14} /> AI Style Assist
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--color-gray-500)', marginBottom: 10 }}>
                            Describe how you want your report to look.
                        </p>
                        <textarea 
                            className="form-textarea" 
                            style={{ height: 80, fontSize: 12, marginBottom: 10, background: 'white' }}
                            value={stylePrompt}
                            onChange={(e) => setStylePrompt(e.target.value)}
                            placeholder='e.g. "Professional dark mode with blue accents and justified text"'
                        />
                        <button 
                            className="btn btn-primary btn-sm" 
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleApplyStyle}
                            disabled={applyingStyle || !stylePrompt.trim()}
                        >
                            {applyingStyle ? <><span className="spinner spinner-sm" /> Applying...</> : <><Sparkles size={14} /> Apply Styles</>}
                        </button>
                    </div>

                    {/* Content Section */}
                    <div className="control-group" style={{ marginBottom: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Edit3 size={14} /> Executive Summary
                        </label>
                        <textarea 
                            className="form-textarea" 
                            style={{ height: 200, fontSize: 13, background: '#fcfcfc' }}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Edit the summary content..."
                        />
                        <div style={{ fontSize: 11, color: 'var(--color-gray-400)', marginTop: 6, display: 'flex', gap: 4 }}>
                            <Sparkles size={10} /> Tip: Edits here will be saved as the final report content.
                        </div>
                    </div>

                    {/* Branding Section */}
                    <div className="control-group" style={{ marginBottom: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ImageIcon size={14} /> Logo Upload
                        </label>
                        <div style={{ 
                            border: '2px dashed var(--color-gray-200)', 
                            borderRadius: 12, 
                            padding: 20, 
                            textAlign: 'center',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {logoPreview ? (
                                <div style={{ position: 'relative' }}>
                                    <img src={logoPreview} alt="Logo" style={{ maxHeight: 60, maxWidth: '100%' }} />
                                    <button 
                                        onClick={() => { setLogoPreview(null); setConfig(prev => ({ ...prev, logo_url: '' })); }}
                                        style={{ position: 'absolute', top: -10, right: -10, background: 'var(--color-danger)', color: 'white', borderRadius: '50%', width: 20, height: 20, fontSize: 10 }}
                                    >✕</button>
                                </div>
                            ) : (
                                <div onClick={() => document.getElementById('logo-upload').click()}>
                                    <Upload size={20} color="var(--color-gray-300)" style={{ marginBottom: 8 }} />
                                    <div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>PNG, JPG, SVG supported</div>
                                </div>
                            )}
                            <input type="file" id="logo-upload" hidden accept="image/*" onChange={handleLogoUpload} />
                        </div>
                    </div>

                    {/* Layout Section */}
                    <div className="control-group" style={{ marginBottom: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlignLeft size={14} /> Text Alignment
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {[
                                { id: 'left', icon: AlignLeft },
                                { id: 'center', icon: AlignCenter },
                                { id: 'right', icon: AlignRight },
                                { id: 'justify', icon: AlignJustify }
                            ].map(align => (
                                <button 
                                    key={align.id}
                                    onClick={() => setConfig(prev => ({ ...prev, text_alignment: align.id }))}
                                    style={{ 
                                        padding: 10, 
                                        borderRadius: 8, 
                                        background: config.text_alignment === align.id ? 'var(--color-primary-light)' : 'var(--color-gray-50)',
                                        border: config.text_alignment === align.id ? '1px solid var(--color-primary)' : '1px solid var(--color-gray-200)',
                                        color: config.text_alignment === align.id ? 'var(--color-primary)' : 'var(--color-gray-500)'
                                    }}
                                >
                                    <align.icon size={18} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Theme Section */}
                    <div className="control-group" style={{ marginBottom: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Palette size={14} /> Accent Color
                        </label>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input 
                                type="color" 
                                value={config.theme_color} 
                                onChange={(e) => setConfig(prev => ({ ...prev, theme_color: e.target.value }))}
                                style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                            />
                            <input 
                                type="text" 
                                className="form-input" 
                                value={config.theme_color} 
                                onChange={(e) => setConfig(prev => ({ ...prev, theme_color: e.target.value }))}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>

                    <div className="control-group" style={{ marginBottom: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FontIcon size={14} /> Typography
                        </label>
                        <select 
                            className="form-select"
                            value={config.font_family}
                            onChange={(e) => setConfig(prev => ({ ...prev, font_family: e.target.value }))}
                        >
                            {FONTS.map(f => (
                                <option key={f.name} value={f.name}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ padding: 20, borderTop: '1px solid var(--color-gray-100)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button className="btn btn-primary" onClick={() => handleSave(true)} disabled={saving}>
                        <CheckCircle size={16} /> Finalize Report
                    </button>
                    <button className="btn btn-secondary" onClick={handleDownload}>
                        <Download size={16} /> Download PDF
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
                        <Save size={16} /> Save as Draft
                    </button>
                    <button className="btn btn-secondary" onClick={() => navigate(`/reports/${id}/insight-brief`)}>
                        <ArrowLeft size={16} /> Back to Brief
                    </button>
                </div>
            </div>

            {/* Main Preview Area */}
            <div className="builder-main" style={{ flex: 1, background: '#e2e8f0', padding: 40, overflowY: 'auto' }}>
                {/* Paper Preview */}
                <div style={{ 
                    width: '100%', 
                    maxWidth: 800, 
                    margin: '0 auto', 
                    background: 'white', 
                    boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                    minHeight: 1100,
                    padding: config.content_spacing === 'compact' ? '40px 60px' : config.content_spacing === 'spacious' ? '120px 140px' : '80px 100px',
                    position: 'relative',
                    fontFamily: FONTS.find(f => f.name === config.font_family)?.family,
                    border: config.show_page_border ? `1px solid ${config.border_color}` : 'none'
                }}>
                    {/* Report Header Preview */}
                    <div style={{ 
                        borderBottom: config.header_style === 'minimal' ? 'none' : `2px solid ${config.theme_color}`, 
                        paddingBottom: 40, 
                        marginBottom: 40,
                        textAlign: config.header_style === 'elegant' ? 'center' : 'inherit'
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: config.header_style === 'elegant' ? 'column' : 'row',
                            justifyContent: 'space-between', 
                            alignItems: config.header_style === 'elegant' ? 'center' : 'flex-start',
                            gap: config.header_style === 'elegant' ? 20 : 0
                        }}>
                            <div style={{ maxWidth: 200 }}>
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Company Logo" style={{ maxHeight: 60, maxWidth: '100%' }} />
                                ) : (
                                    <div style={{ background: '#f1f5f9', width: 120, height: 40, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10 }}>LOGO PREVIEW</div>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, color: 'var(--color-gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Media Intelligence Report</div>
                                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-gray-900)', marginTop: 4 }}>{report?.title}</div>
                                <div style={{ fontSize: 13, color: 'var(--color-gray-500)', marginTop: 8 }}>
                                    {report?.period_start && format(new Date(report.period_start), 'MMMM d, yyyy')} — {report?.period_end && format(new Date(report.period_end), 'MMMM d, yyyy')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Preview */}
                    <div style={{ 
                        textAlign: config.text_alignment, 
                        fontSize: 16, 
                        lineHeight: config.content_spacing === 'compact' ? 1.5 : config.content_spacing === 'spacious' ? 2.2 : 1.8, 
                        color: '#1e293b'
                    }}>
                        <h1 style={{ 
                            color: config.theme_color, 
                            fontSize: config.content_spacing === 'spacious' ? 36 : 28, 
                            fontWeight: 900, 
                            marginBottom: config.content_spacing === 'compact' ? 16 : 32,
                            textAlign: config.header_style === 'elegant' ? 'center' : 'inherit'
                        }}>Executive Insight Brief</h1>
                        
                        <div className="preview-content">
                            {content.split('\n').map((line, i) => {
                                const trimmed = line.trim();
                                if (trimmed === '') return <div key={i} style={{ height: 16 }} />;
                                
                                // Helper to parse bold/italic
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

                                if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 20, fontWeight: 800, marginTop: 32, marginBottom: 16, color: '#0f172a' }}>{parseInline(line.replace('## ', ''))}</h2>;
                                if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 17, fontWeight: 700, marginTop: 24, marginBottom: 12, color: '#334155' }}>{parseInline(line.replace('### ', ''))}</h3>;
                                if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ marginLeft: 24, marginBottom: 10, display: 'flex', gap: 12 }}><span style={{ color: config.theme_color, fontWeight: 900 }}>•</span><span>{parseInline(line.replace(/^[-*] /, ''))}</span></div>;
                                
                                return <p key={i} style={{ marginBottom: 16 }}>{parseInline(line)}</p>;
                            })}
                        </div>
                    </div>

                    {/* Report Footer */}
                    <div style={{ 
                        position: 'absolute', 
                        bottom: 40, 
                        left: 100, 
                        right: 100, 
                        borderTop: '1px solid #f1f5f9', 
                        paddingTop: 20, 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        fontSize: 10,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 1
                    }}>
                        <span>Generated by Fullintel Intelligence Engine</span>
                        <span>Page 1 of 1</span>
                    </div>
                </div>
                
                {/* Parity Tooltip */}
                <div style={{ 
                    position: 'fixed', 
                    bottom: 24, 
                    right: 40, 
                    background: '#0f172a', 
                    color: 'white', 
                    padding: '8px 16px', 
                    borderRadius: 20, 
                    fontSize: 12, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                    <CheckCircle size={14} color="#10b981" /> WYSIWYG Parity Enabled
                </div>
            </div>
        </div>
    );
}
