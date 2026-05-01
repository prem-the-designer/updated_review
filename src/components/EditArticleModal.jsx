import { useState, useEffect } from 'react';
import { X, Save, FileText, CheckCircle, AlertCircle, Link, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

const TABS = ['Article', 'Content Tagging'];
const MEDIA_TYPES = ['Online', 'Print', 'Broadcast', 'Social', 'Wire'];
const WEBSITE_ARTICLE_CATEGORIES = ['Article', 'Press Release', 'Corporate Newsroom'];

export default function EditArticleModal({ article, onClose, onSave }) {
    const [activeTab, setActiveTab] = useState('Article');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    
    // Setup form state duplicating AddArticle
    const [form, setForm] = useState({
        heading: '',
        article_url: '',
        published_date: '',
        banner_image: '',
        views: '',
        article_reach: '',
        national_reach: false,
        ave: '',
        national_ave: false,
        media_impact_score: '',
        related_tweets: '',
        article_media_type: '',
        is_important: false,
        behind_paywall: false,
        key_sources: false,
        hero_brief: false,
        share_article_content: false,
        peripheral_mention: false,
        gilead_article: false,
        webapp_article: false,
        hero_topic: false,
        website_article_category: 'Article',
        full_article: '',
        content_categories: [],
        content_type: '',
    });

    useEffect(() => {
        if (article) {
            setForm({
                heading: article.heading || '',
                article_url: article.article_url || '',
                published_date: article.published_date || '',
                banner_image: article.banner_image || '',
                views: article.views || '',
                article_reach: article.article_reach || '',
                national_reach: article.national_reach || false,
                ave: article.ave || '',
                national_ave: article.national_ave || false,
                media_impact_score: article.media_impact_score || '',
                related_tweets: article.related_tweets || '',
                article_media_type: article.article_media_type || '',
                is_important: article.is_important || false,
                behind_paywall: article.behind_paywall || false,
                key_sources: article.key_sources || false,
                hero_brief: article.hero_brief || false,
                share_article_content: article.share_article_content || false,
                peripheral_mention: article.peripheral_mention || false,
                gilead_article: article.gilead_article || false,
                webapp_article: article.webapp_article || false,
                hero_topic: article.hero_topic || false,
                website_article_category: article.website_article_category || 'Article',
                full_article: article.full_article || '',
                content_categories: article.content_categories || [],
                content_type: article.content_type || '',
            });
        }
    }, [article]);

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

    const validate = () => {
        const e = {};
        if (!form.heading?.trim()) e.heading = 'Heading is required';
        if (!form.published_date) e.published_date = 'Published Date is required';
        if (!form.full_article?.trim()) e.full_article = 'Full Article content is required';
        return e;
    };

    const handleSubmit = async () => {
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
            };

            const { error } = await supabase
                .from('articles')
                .update(payload)
                .eq('id', article.id);

            if (error) throw error;

            if (onSave) onSave({ ...article, ...payload });
            onClose();
        } catch (err) {
            console.error(err);
            setErrors({ submit: err.message || 'Failed to update article.' });
        } finally {
            setLoading(false);
        }
    };

    if (!article) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
            <div className="modal" style={{ maxWidth: 900, width: '100%', height: '85vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 8, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--color-gray-200)', background: 'var(--color-gray-800)', color: '#fff' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> Edit Article</h3>
                    <button className="btn-link" style={{ color: '#fff', border: 'none', background: 'none', cursor: 'pointer' }} onClick={onClose}><X size={20} /></button>
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-gray-200)', background: '#fff' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '12px 20px', fontSize: 13, fontWeight: 500, border: 'none',
                                borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                                background: activeTab === tab ? 'var(--color-primary-light)' : 'transparent',
                                color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-gray-500)',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {errors.submit && (
                    <div className="alert alert-error" style={{ borderRadius: 0, margin: 0 }}>
                        <AlertCircle size={15} /> {errors.submit}
                    </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: 25 }}>
                    {activeTab === 'Article' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            {/* Left Column */}
                            <div>
                                <div className="form-group">
                                    <label className="form-label required">Heading</label>
                                    <textarea className="form-textarea" rows={3} value={form.heading} onChange={e => set('heading', e.target.value)} />
                                    {errors.heading && <span className="form-error">{errors.heading}</span>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Link size={12} style={{ marginRight: 4 }} /> Article URL</label>
                                    <input className="form-input" type="url" value={form.article_url} onChange={e => set('article_url', e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label required"><Calendar size={12} style={{ marginRight: 4 }} /> Published Date</label>
                                    <input className="form-input" type="date" value={form.published_date} onChange={e => set('published_date', e.target.value)} />
                                    {errors.published_date && <span className="form-error">{errors.published_date}</span>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Banner Image</label>
                                    <input className="form-input" value={form.banner_image} onChange={e => set('banner_image', e.target.value)} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div className="form-group">
                                        <label className="form-label">Views</label>
                                        <input className="form-input" type="number" value={form.views} onChange={e => set('views', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Media Impact Score</label>
                                        <input className="form-input" type="number" step="0.001" value={form.media_impact_score} onChange={e => set('media_impact_score', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Article Reach</label>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <input className="form-input" type="number" value={form.article_reach} onChange={e => set('article_reach', e.target.value)} />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                            <input type="checkbox" checked={form.national_reach} onChange={e => set('national_reach', e.target.checked)} /> National
                                        </label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">AVE</label>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <input className="form-input" type="number" step="0.01" value={form.ave} onChange={e => set('ave', e.target.value)} />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                            <input type="checkbox" checked={form.national_ave} onChange={e => set('national_ave', e.target.checked)} /> National
                                        </label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Article Media Type</label>
                                    <select className="form-select" value={form.article_media_type} onChange={e => set('article_media_type', e.target.value)}>
                                        <option value="">Select...</option>
                                        {MEDIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', padding: 12, background: 'var(--color-gray-50)', border: '1px solid var(--color-gray-200)', borderRadius: 6, marginBottom: 20 }}>
                                    {[
                                        { key: 'is_important', label: 'Important' },
                                        { key: 'peripheral_mention', label: 'Peripheral Mention' },
                                        { key: 'behind_paywall', label: 'PayWall' },
                                        { key: 'gilead_article', label: 'Gilead' },
                                        { key: 'key_sources', label: 'Key Sources' },
                                        { key: 'webapp_article', label: 'Webapp' },
                                        { key: 'hero_brief', label: 'Hero (Brief)' },
                                        { key: 'hero_topic', label: 'Hero (Topic)' },
                                        { key: 'share_article_content', label: 'Share Content' },
                                    ].map(({ key, label }) => (
                                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                                            <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)} /> {label}
                                        </label>
                                    ))}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Website Category</label>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {WEBSITE_ARTICLE_CATEGORIES.map(cat => (
                                            <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                                <input type="radio" name="website_article_category" value={cat} checked={form.website_article_category === cat} onChange={() => set('website_article_category', cat)} /> {cat}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label required">Full Article</label>
                                    <textarea className="form-textarea" rows={12} value={form.full_article} onChange={e => set('full_article', e.target.value)} style={{ minHeight: 180 }} />
                                    {errors.full_article && <span className="form-error">{errors.full_article}</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Content Tagging' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            <div>
                                <h4 style={{ marginBottom: 12, fontSize: 14 }}>Content Categories</h4>
                                {CONTENT_CATEGORIES.map(group => (
                                    <div key={group.group} style={{ marginBottom: 15 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-gray-500)', marginBottom: 4 }}>{group.group}</div>
                                        {group.items.map(item => (
                                            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={form.content_categories.includes(item.key)} onChange={() => toggleCategory(item.key)} /> {item.label}
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <div>
                                <h4 style={{ marginBottom: 12, fontSize: 14 }}>Content Type</h4>
                                {CONTENT_TYPES.map(ct => (
                                    <label key={ct.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 0', cursor: 'pointer' }}>
                                        <input type="radio" name="content_type" value={ct.key} checked={form.content_type === ct.key} onChange={() => set('content_type', ct.key)} /> {ct.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '15px 20px', borderTop: '1px solid var(--color-gray-200)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-gray-50)' }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? <span className="spinner spinner-sm" /> : <Save size={14} />} Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
