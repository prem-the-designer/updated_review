import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, ArrowLeft, CheckCircle, AlertCircle, FileText,
    Link, Calendar, Globe, Save, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ── Content Category definitions (from screenshot 2) ── */
const CONTENT_CATEGORIES = [
    {
        group: 'Company News', items: [
            { key: 'corporate', label: 'Corporate' },
            { key: 'finance', label: 'Finance' },
        ]
    },
    {
        group: 'Products News', items: [
            { key: 'cardiovascular_metabolism', label: 'Cardiovascular & Metabolism' },
            { key: 'immunology', label: 'Immunology' },
            { key: 'infectious_diseases_vaccines', label: 'Infectious Diseases and Vaccines' },
            { key: 'neuroscience', label: 'Neuroscience' },
            { key: 'oncology', label: 'Oncology' },
            { key: 'pulmonary_hypertension', label: 'Pulmonary Hypertension' },
            { key: 'others_products', label: 'Others' },
        ]
    },
    {
        group: 'Competitors News', items: [
            { key: 'daiichi_sankyo', label: 'Daiichi Sankyo' },
            { key: 'takeda', label: 'Takeda' },
            { key: 'astrazeneca', label: 'AstraZeneca' },
            { key: 'merck', label: 'Merck' },
            { key: 'pfizer', label: 'Pfizer' },
        ]
    },
    {
        group: 'Industry News', items: [
            { key: 'pharma_trends', label: 'Pharma Trends' },
            { key: 'drug_pricing', label: 'Drug Pricing' },
            { key: 'politics_policy', label: 'Politics/Policy' },
            { key: 'regulatory', label: 'Regulatory' },
            { key: 'rnd', label: 'R&D' },
        ]
    },
];

const CONTENT_TYPES = [
    { key: 'company_news_ja', label: 'Company News - Japanese' },
    { key: 'company_news_en', label: 'Company News - English' },
    { key: 'product_news_ja', label: 'Product News - Japanese' },
    { key: 'product_news_en', label: 'Product News - English' },
    { key: 'competitor_news_ja', label: 'Competitor News - Japanese' },
    { key: 'competitor_news_en', label: 'Competitor News - English' },
    { key: 'industry_news_ja', label: 'Industry News - Japanese' },
    { key: 'industry_news_en', label: 'Industry News - English' },
    { key: 'competitor_news_names', label: 'Competitor News Names' },
];

const TABS = ['Article', 'Content Tagging', 'Related Articles', 'Syndicate', 'Shared', 'Comments / TOC Summary', 'Others', 'History'];

const MEDIA_TYPES = ['Online', 'Print', 'Broadcast', 'Social', 'Wire'];
const WEBSITE_ARTICLE_CATEGORIES = ['Article', 'Press Release', 'Corporate Newsroom'];

/* ─────────────────────────────────────────────── */
export default function AddArticle() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Article');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errors, setErrors] = useState({});

    const [form, setForm] = useState({
        /* Article tab */
        heading: '',
        article_url: '',
        published_date: new Date().toISOString().split('T')[0],
        banner_image: '',
        views: '',
        article_reach: '',
        national_reach: false,
        ave: '',
        national_ave: false,
        media_impact_score: '',
        related_tweets: '',
        article_media_type: '',

        /* Flags */
        is_important: false,
        behind_paywall: false,
        key_sources: false,
        hero_brief: false,
        share_article_content: false,
        peripheral_mention: false,
        gilead_article: false,
        webapp_article: false,
        hero_topic: false,

        /* Website article category */
        website_article_category: 'Article',

        /* Full article content */
        full_article: '',

        /* Content Tagging tab */
        content_categories: [],   // array of keys
        content_type: '',
    });

    /* ── Helpers ── */
    const set = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
    };

    const toggleCategory = (key) => {
        setForm(prev => ({
            ...prev,
            content_categories: prev.content_categories.includes(key)
                ? prev.content_categories.filter(k => k !== key)
                : [...prev.content_categories, key],
        }));
    };

    /* ── Validation ── */
    const validate = () => {
        const e = {};
        if (!form.heading.trim()) e.heading = 'Heading is required';
        if (!form.published_date) e.published_date = 'Published Date is required';
        if (!form.full_article.trim()) e.full_article = 'Full Article content is required';
        if (form.article_url && !/^https?:\/\//.test(form.article_url))
            e.article_url = 'URL must start with http:// or https://';
        return e;
    };

    /* ── Submit ── */
    const handleSubmit = async (saveAndNew = false) => {
        const errs = validate();
        if (Object.keys(errs).length) {
            setErrors(errs);
            setActiveTab('Article');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                heading: form.heading.trim(),
                article_url: form.article_url.trim() || null,
                published_date: form.published_date,
                banner_image: form.banner_image.trim() || null,
                views: form.views ? parseInt(form.views) : 0,
                article_reach: form.article_reach ? parseFloat(form.article_reach) : null,
                national_reach: form.national_reach,
                ave: form.ave ? parseFloat(form.ave) : null,
                national_ave: form.national_ave,
                media_impact_score: form.media_impact_score ? parseFloat(form.media_impact_score) : null,
                related_tweets: form.related_tweets.trim() || null,
                article_media_type: form.article_media_type || null,
                is_important: form.is_important,
                behind_paywall: form.behind_paywall,
                key_sources: form.key_sources,
                hero_brief: form.hero_brief,
                share_article_content: form.share_article_content,
                peripheral_mention: form.peripheral_mention,
                gilead_article: form.gilead_article,
                webapp_article: form.webapp_article,
                hero_topic: form.hero_topic,
                website_article_category: form.website_article_category,
                full_article: form.full_article.trim(),
                content_categories: form.content_categories,
                content_type: form.content_type || null,
                status: 'active',
            };

            const { error } = await supabase.from('articles').insert([payload]);
            if (error) throw error;

            if (saveAndNew) {
                setSuccess(true);
                setTimeout(() => {
                    setSuccess(false);
                    setForm(prev => ({ ...prev, heading: '', article_url: '', full_article: '', content_categories: [], content_type: '' }));
                    setActiveTab('Article');
                }, 1500);
            } else {
                setSuccess(true);
                setTimeout(() => navigate('/articles'), 1800);
            }
        } catch (err) {
            console.error(err);
            setErrors({ submit: err.message || 'Failed to save article. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    /* ── Render ── */
    return (
        <div>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <span className="breadcrumb-link" onClick={() => navigate('/')}>Home</span>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-link" onClick={() => navigate('/articles')}>Articles</span>
                <span className="breadcrumb-sep">/</span>
                <span>Add Article</span>
            </div>

            {/* ── Top Action Bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--color-gray-800)', color: '#fff',
                padding: '10px 20px', borderRadius: '8px 8px 0 0', marginBottom: 0,
            }}>
                <button
                    className="btn btn-sm"
                    style={{ background: 'var(--color-gray-600)', color: '#fff', border: 'none' }}
                    onClick={() => navigate('/')}
                >
                    <ArrowLeft size={14} /> Back to Dashboard
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Globe size={16} style={{ color: 'var(--color-primary-light)' }} />
                    <span style={{ fontWeight: 600, fontSize: 15 }}>ADD ARTICLE - J&amp;J INNOVATIVE...</span>
                </div>
                <button
                    className="btn btn-sm"
                    style={{ background: 'var(--color-gray-600)', color: '#fff', border: 'none' }}
                    onClick={() => navigate('/articles')}
                >
                    View Articles
                </button>
            </div>

            {/* ── Tab Bar ── */}
            <div style={{
                display: 'flex', borderBottom: '2px solid var(--color-gray-200)',
                background: '#fff', paddingLeft: 0, gap: 0,
            }}>
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '10px 18px', fontSize: 13, fontWeight: 500, border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                            background: activeTab === tab ? 'var(--color-primary-light)' : 'transparent',
                            color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-gray-500)',
                            cursor: 'pointer', marginBottom: -2,
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab}
                    </button>
                ))}

                {/* Save buttons aligned right */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, padding: '6px 16px' }}>
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={loading}
                        onClick={() => handleSubmit(true)}
                    >
                        {loading ? <span className="spinner spinner-sm" /> : <Save size={13} />}
                        Save and New
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        disabled={loading}
                        onClick={() => handleSubmit(false)}
                    >
                        <Save size={13} /> Save and Close
                    </button>
                </div>
            </div>

            {/* ── Alerts ── */}
            {success && (
                <div className="alert alert-success" style={{ borderRadius: 0 }}>
                    <CheckCircle size={15} /> Article saved successfully!
                </div>
            )}
            {errors.submit && (
                <div className="alert alert-error" style={{ borderRadius: 0 }}>
                    <AlertCircle size={15} /> {errors.submit}
                </div>
            )}

            {/* ══════════════════ TAB CONTENT ══════════════════ */}
            <div className="card" style={{ borderRadius: '0 0 8px 8px', marginTop: 0 }}>

                {/* ─── ARTICLE TAB ─── */}
                {activeTab === 'Article' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

                        {/* LEFT COLUMN */}
                        <div>
                            {/* Heading */}
                            <div className="form-group">
                                <label className="form-label">Heading</label>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    placeholder="Enter article heading..."
                                    value={form.heading}
                                    onChange={e => set('heading', e.target.value)}
                                    style={{ resize: 'vertical' }}
                                />
                                {errors.heading && <span className="form-error">{errors.heading}</span>}
                            </div>

                            {/* Article URL */}
                            <div className="form-group">
                                <label className="form-label">
                                    <Link size={12} style={{ marginRight: 4 }} />
                                    Article URL
                                </label>
                                <input
                                    className="form-input"
                                    type="url"
                                    placeholder="https://..."
                                    value={form.article_url}
                                    onChange={e => set('article_url', e.target.value)}
                                />
                                {errors.article_url && <span className="form-error">{errors.article_url}</span>}
                            </div>

                            {/* Published Date */}
                            <div className="form-group">
                                <label className="form-label required">
                                    <Calendar size={12} style={{ marginRight: 4 }} />
                                    Published Date
                                </label>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={form.published_date}
                                    onChange={e => set('published_date', e.target.value)}
                                />
                                {errors.published_date && <span className="form-error">{errors.published_date}</span>}
                            </div>

                            {/* Banner Image */}
                            <div className="form-group">
                                <label className="form-label">Banner Image</label>
                                <input
                                    className="form-input"
                                    placeholder="Image URL or filename..."
                                    value={form.banner_image}
                                    onChange={e => set('banner_image', e.target.value)}
                                />
                            </div>

                            {/* Views */}
                            <div className="form-group">
                                <label className="form-label">Views</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0"
                                    value={form.views}
                                    onChange={e => set('views', e.target.value)}
                                />
                            </div>

                            {/* Outlets — placeholder (M:M handled separately) */}
                            <div className="form-group">
                                <label className="form-label">Outlets</label>
                                <div style={{
                                    border: '1px solid var(--color-gray-200)',
                                    borderRadius: 6, padding: '8px 12px',
                                    minHeight: 40, background: 'var(--color-gray-50)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    color: 'var(--color-gray-400)', fontSize: 13,
                                }}>
                                    <span>Select outlet(s)...</span>
                                    <button style={{
                                        background: 'var(--color-primary)', color: '#fff',
                                        border: 'none', borderRadius: 4, width: 24, height: 24,
                                        cursor: 'pointer', fontSize: 16, lineHeight: 1,
                                    }}>+</button>
                                </div>
                            </div>

                            {/* Article Reach + National Reach */}
                            <div className="form-group">
                                <label className="form-label">Article Reach</label>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <input
                                        className="form-input"
                                        type="number"
                                        placeholder="0"
                                        value={form.article_reach}
                                        onChange={e => set('article_reach', e.target.value)}
                                        style={{ maxWidth: 200 }}
                                    />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-gray-600)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={form.national_reach} onChange={e => set('national_reach', e.target.checked)} />
                                        National Reach
                                    </label>
                                </div>
                            </div>

                            {/* AVE + National AVE */}
                            <div className="form-group">
                                <label className="form-label">AVE</label>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <input
                                        className="form-input"
                                        type="number"
                                        placeholder="0.00"
                                        step="0.01"
                                        value={form.ave}
                                        onChange={e => set('ave', e.target.value)}
                                        style={{ maxWidth: 200 }}
                                    />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-gray-600)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={form.national_ave} onChange={e => set('national_ave', e.target.checked)} />
                                        National AVE
                                    </label>
                                </div>
                            </div>

                            {/* Media Impact Score */}
                            <div className="form-group">
                                <label className="form-label">Media Impact Score</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="0.0000"
                                    step="0.0001"
                                    value={form.media_impact_score}
                                    onChange={e => set('media_impact_score', e.target.value)}
                                    style={{ maxWidth: 200 }}
                                />
                            </div>

                            {/* Contacts — placeholder */}
                            <div className="form-group">
                                <label className="form-label">Contacts</label>
                                <div style={{
                                    border: '1px solid var(--color-gray-200)',
                                    borderRadius: 6, padding: '8px 12px',
                                    minHeight: 40, background: 'var(--color-gray-50)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    color: 'var(--color-gray-400)', fontSize: 13,
                                }}>
                                    <span>Select contact(s)...</span>
                                    <button style={{
                                        background: 'var(--color-primary)', color: '#fff',
                                        border: 'none', borderRadius: 4, width: 24, height: 24,
                                        cursor: 'pointer', fontSize: 16, lineHeight: 1,
                                    }}>+</button>
                                </div>
                            </div>

                            {/* Related Tweets */}
                            <div className="form-group">
                                <label className="form-label">Related Tweets</label>
                                <textarea
                                    className="form-textarea"
                                    rows={2}
                                    placeholder="Paste tweet URLs or IDs..."
                                    value={form.related_tweets}
                                    onChange={e => set('related_tweets', e.target.value)}
                                />
                            </div>

                            {/* Article Media Type */}
                            <div className="form-group">
                                <label className="form-label">Article MediaType</label>
                                <select
                                    className="form-select"
                                    value={form.article_media_type}
                                    onChange={e => set('article_media_type', e.target.value)}
                                >
                                    <option value="">Select...</option>
                                    {MEDIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div>
                            {/* ── Checkbox Flags ── */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr',
                                gap: '10px 24px', marginBottom: 24,
                                padding: '16px', background: 'var(--color-gray-50)',
                                borderRadius: 8, border: '1px solid var(--color-gray-200)',
                            }}>
                                {[
                                    { key: 'is_important', label: 'Mark as Important' },
                                    { key: 'peripheral_mention', label: 'Peripheral Mention' },
                                    { key: 'behind_paywall', label: 'Behind PayWall' },
                                    { key: 'gilead_article', label: 'Gilead Article' },
                                    { key: 'key_sources', label: 'Key Sources' },
                                    { key: 'webapp_article', label: 'Webapp Article' },
                                    { key: 'hero_brief', label: 'hero (Brief)' },
                                    { key: 'hero_topic', label: 'hero (Topic)' },
                                    { key: 'share_article_content', label: 'Share Article Content' },
                                ].map(({ key, label }) => (
                                    <label
                                        key={key}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-gray-700)', cursor: 'pointer' }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form[key]}
                                            onChange={e => set(key, e.target.checked)}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>

                            {/* ── Website Article Categories ── */}
                            <div className="form-group">
                                <label className="form-label" style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                                    Website Article Categories
                                </label>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                    {WEBSITE_ARTICLE_CATEGORIES.map(cat => (
                                        <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-gray-700)', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="website_article_category"
                                                value={cat}
                                                checked={form.website_article_category === cat}
                                                onChange={() => set('website_article_category', cat)}
                                            />
                                            {cat}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* ── Full Article ── */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label required" style={{ fontWeight: 600, marginBottom: 8 }}>
                                    Full Article
                                </label>

                                {/* Simulated CKEditor toolbar */}
                                <div style={{
                                    border: '1px solid var(--color-gray-300)',
                                    borderRadius: '6px 6px 0 0',
                                    background: 'var(--color-gray-50)',
                                    padding: '6px 10px',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    flexWrap: 'wrap',
                                    fontSize: 12, color: 'var(--color-gray-600)',
                                }}>
                                    <span style={{ fontWeight: 600, marginRight: 8 }}>CKEditor</span>
                                    {['B', 'I', 'U', 'S'].map(f => (
                                        <button key={f} type="button" style={{
                                            width: 24, height: 24, border: '1px solid var(--color-gray-300)',
                                            borderRadius: 3, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                        }}>{f}</button>
                                    ))}
                                    <span style={{ color: 'var(--color-gray-300)' }}>|</span>
                                    {['Styles', 'Format', 'Font', 'Size'].map(s => (
                                        <select key={s} style={{ fontSize: 11, padding: '2px 4px', border: '1px solid var(--color-gray-300)', borderRadius: 3 }}>
                                            <option>{s}</option>
                                        </select>
                                    ))}
                                </div>

                                <textarea
                                    className="form-textarea"
                                    rows={16}
                                    placeholder="Enter the full article content here..."
                                    value={form.full_article}
                                    onChange={e => set('full_article', e.target.value)}
                                    style={{ borderRadius: '0 0 6px 6px', borderTop: 'none', minHeight: 320, resize: 'vertical' }}
                                />
                                {errors.full_article && <span className="form-error">{errors.full_article}</span>}
                                <span className="form-hint">
                                    {form.full_article
                                        ? `~${form.full_article.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length} words`
                                        : 'Word count auto-calculated'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── CONTENT TAGGING TAB ─── */}
                {activeTab === 'Content Tagging' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>

                        {/* LEFT: Content Categories */}
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-gray-800)', marginBottom: 16 }}>
                                Content Categories
                            </h3>
                            {CONTENT_CATEGORIES.map(group => (
                                <div key={group.group} style={{ marginBottom: 18 }}>
                                    {group.items.map(item => (
                                        <label key={item.key} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '4px 0', cursor: 'pointer',
                                            fontSize: 13.5, color: 'var(--color-gray-700)',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={form.content_categories.includes(item.key)}
                                                onChange={() => toggleCategory(item.key)}
                                            />
                                            <span style={{ fontWeight: 500 }}>{item.label}</span>
                                            <span style={{ fontSize: 12, color: 'var(--color-gray-400)' }}>
                                                ({group.group})
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* RIGHT: Content Type */}
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-gray-800)', marginBottom: 16 }}>
                                Content Type
                            </h3>
                            {CONTENT_TYPES.map(ct => (
                                <label key={ct.key} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '5px 0', cursor: 'pointer',
                                    fontSize: 13.5, color: 'var(--color-gray-700)',
                                }}>
                                    <input
                                        type="radio"
                                        name="content_type"
                                        value={ct.key}
                                        checked={form.content_type === ct.key}
                                        onChange={() => set('content_type', ct.key)}
                                    />
                                    {ct.label}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── PLACEHOLDER TABS ─── */}
                {!['Article', 'Content Tagging'].includes(activeTab) && (
                    <div className="empty-state" style={{ padding: '60px 0' }}>
                        <FileText size={40} />
                        <h3>{activeTab}</h3>
                        <p style={{ color: 'var(--color-gray-400)' }}>This section is not yet implemented.</p>
                    </div>
                )}
            </div>

            {/* ── Bottom Action Bar ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => navigate('/articles')}>
                    <X size={14} /> Cancel
                </button>
                <button className="btn btn-primary" disabled={loading} onClick={() => handleSubmit(true)}>
                    {loading ? <><span className="spinner spinner-sm" /> Saving...</> : <><Save size={14} /> Save and New</>}
                </button>
                <button className="btn btn-primary" disabled={loading} onClick={() => handleSubmit(false)}
                    style={{ background: 'var(--color-gray-700)' }}>
                    {loading ? <span className="spinner spinner-sm" /> : <Save size={14} />}
                    Save and Close
                </button>
            </div>
        </div>
    );
}
