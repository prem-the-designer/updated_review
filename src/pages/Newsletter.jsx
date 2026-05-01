import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Plus, ArrowLeft, ArrowRight, Save, Send, Settings, Search,
    FileText, X, ChevronLeft, ChevronRight, Download, CheckCircle,
    Bell, Mail, Table, Edit, AlertCircle, FileCheck, RefreshCw,
    Facebook, Twitter, Linkedin
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { executeRuleEngine } from '../lib/ruleEngine/engine';
import { logNewsletterErrors } from '../lib/qaEngine';
import { format } from 'date-fns';
import EditArticleModal from '../components/EditArticleModal';
import Toast from '../components/Toast';

export default function Newsletter() {
    const navigate = useNavigate();
    const { id: urlNewsletterIdParam } = useParams();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);

    // Track whether this newsletter has been saved to DB yet
    const [newsletterId, setNewsletterId] = useState(urlNewsletterIdParam || null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [expandedArticles, setExpandedArticles] = useState(new Set());

    const toggleExpand = (id) => {
        setExpandedArticles(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return new Set(next);
        });
    };

    // Filter/Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const PAGE_SIZE = 12;

    // Data State
    const [allArticles, setAllArticles] = useState([]);
    const [selectedArticles, setSelectedArticles] = useState([]);
    const [reports, setReports] = useState([]);
    const [activeStandards, setActiveStandards] = useState([]);
    const [auditResults, setAuditResults] = useState({}); // { articleId: [violations] }
    const [editingArticle, setEditingArticle] = useState(null);
    const [leftSelected, setLeftSelected] = useState([]);
    const [rightSelected, setRightSelected] = useState([]);
    const [toast, setToast] = useState(null);

    // Form State
    const [form, setForm] = useState({
        title: 'J&J Innovative Medicine Japan Media Impact Report',
        template_name: 'New - Media Imp',
        subject_type: 'Custom',
        banner_date: format(new Date(), 'yyyy-MM-dd'),
        heading_type: 'Default',
        report_id: '',
        published_on: format(new Date(), 'yyyy-MM-dd'),
        distribution_list: 'DEFAULT',
        email_test: '',
        send_push: true,
        mark_as_sent: false
    });

    // If editing an existing newsletter, load it
    useEffect(() => {
        if (!urlNewsletterIdParam) return;
        const load = async () => {
            setLoading(true);
            try {
                const { data: nl } = await supabase
                    .from('reports')
                    .select('*')
                    .eq('id', urlNewsletterIdParam)
                    .single();
                if (nl) {
                    setForm(prev => ({
                        ...prev,
                        title: nl.title || prev.title,
                        banner_date: nl.period_start || prev.banner_date,
                        published_on: nl.period_end || prev.published_on,
                        distribution_list: nl.notes || prev.distribution_list,
                    }));
                    setNewsletterId(nl.id);
                }
                // load linked articles
                const { data: links } = await supabase
                    .from('report_articles')
                    .select('article_id, order_index, articles(*)')
                    .eq('report_id', urlNewsletterIdParam)
                    .order('order_index', { ascending: true });
                if (links) {
                    setSelectedArticles(links.map(l => l.articles).filter(Boolean));
                }
            } catch(e) {
                console.error('Load newsletter error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [urlNewsletterIdParam]);

    // Fetch data (analysis reports list for dropdown)
    useEffect(() => {
        const fetchData = async () => {
            const { data: reportData } = await supabase.from('reports').select('id, title, client_name').not('description', 'like', '[newsletter]%').order('created_at', { ascending: false });
            if (reportData) setReports(reportData);
        };
        fetchData();
    }, []);

    // Fetch available articles
    const fetchArticles = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('articles')
                .select('*', { count: 'exact' })
                .order('published_date', { ascending: false })
                .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

            if (searchTerm) query = query.ilike('heading', `%${searchTerm}%`);

            const { data, error, count } = await query;
            if (error) throw error;
            setAllArticles(data || []);
            setTotalCount(count || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, searchTerm]);

    useEffect(() => { fetchArticles(); }, [fetchArticles]);

    // Article selection logic
    const addToNewsletter = (article) => {
        if (!selectedArticles.find(a => a.id === article.id)) {
            setSelectedArticles([...selectedArticles, article]);
        }
    };

    const removeFromNewsletter = (articleId) => {
        setSelectedArticles(selectedArticles.filter(a => a.id !== articleId));
    };

    const moveSelectedRight = async () => {
        if (leftSelected.length === 0) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.from('articles').select('*').in('id', leftSelected);
            if (error) throw error;
            if (data) {
                setSelectedArticles(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const toAdd = data.filter(na => !existingIds.has(na.id));
                    return [...prev, ...toAdd];
                });
                setLeftSelected([]);
            }
        } catch (err) {
            console.error("Transfer Error:", err);
            alert("Transfer failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const moveSelectedLeft = () => {
        if (rightSelected.length === 0) return;
        setSelectedArticles(prev => prev.filter(sa => !rightSelected.includes(sa.id)));
        setRightSelected([]);
    };

    const performReview = async () => {
        const startTime = performance.now();
        setReviewing(true);
        const results = {};
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

        try {
            // 1. Determine active rules for the current context
            const { data: fiStd } = await supabase.from('fullintel_standards').select('id').limit(1).maybeSingle();
            let clientStdId = null;
            if (form.report_id) {
                const selectedReport = reports.find(r => r.id === form.report_id);
                if (selectedReport && selectedReport.client_name) {
                    const { data: cStd } = await supabase.from('client_standards').select('id')
                        .eq('client_name', selectedReport.client_name).limit(1).maybeSingle();
                    if (cStd) clientStdId = cStd.id;
                }
            }

            let ruleQuery = supabase.from('rules').select('*').eq('is_active', true);

            // 2. Identify client context (either from selected report OR name match in title)
            let contextClientStdId = clientStdId;
            if (!contextClientStdId && form.title) {
                const { data: cStds } = await supabase.from('client_standards').select('id, client_name');
                if (cStds) {
                    const matched = cStds.find(c => form.title.toLowerCase().includes(c.client_name.toLowerCase()));
                    if (matched) {
                        contextClientStdId = matched.id;
                        console.log(`Auto-detected Client [${matched.client_name}] from Newsletter Title.`);
                    }
                }
            }

            if (contextClientStdId) {
                console.log("Loading rules for Standard ID:", contextClientStdId);
                ruleQuery = ruleQuery.or(`fullintel_standard_id.eq.${fiStd?.id},client_standard_id.eq.${contextClientStdId}`);
            } else if (fiStd) {
                console.log("No client context detected. Loading core standards only.");
                ruleQuery = ruleQuery.eq('fullintel_standard_id', fiStd.id);
            }
            const { data: rulesData } = await ruleQuery.order('priority', { ascending: true });
            const activeRules = rulesData || [];
            console.log("Loaded Active Rules:", activeRules.map(r => r.name));

            const promises = selectedArticles.map(async (art) => {
                const headline = art.heading || '';

                // 1. Algorithmic Pass via Flexible Rule Engine
                const engineViolations = executeRuleEngine(art, activeRules);
                const localViolations = engineViolations.map(v => ({
                    type: 'editorial',
                    category: v.category,
                    label: v.name,
                    detail: v.description || `Rule Failed: ${v.name}`,
                    severity: v.severity || 'warning',
                    field: v.field, // Now pre-mapped in engine.js
                    violated_text: v.violated_text, // Now precise from engine.js
                    rule_operator: v.rule_operator,
                    rule_value: v.rule_value
                }));

                // 2. AI Pass (For nuance/style) - Temporarily Disabled as requested
                let aiViolations = [];
                // if (apiKey && apiKey !== 'your_openai_api_key_here') { ... } 
                // AI features have been disabled. Only algorithmic rules will apply.

                const allViolations = [...localViolations, ...aiViolations];
                if (allViolations.length > 0) results[art.id] = allViolations;
            });

            await Promise.all(promises);
            setAuditResults(results);

            // ── Integrated QA Logging ──
            if (newsletterId) {
                let clientName = 'General';
                if (form.report_id) {
                    const selectedReport = reports.find(r => r.id === form.report_id);
                    if (selectedReport) clientName = selectedReport.client_name;
                }
                
                // Flatten all violations into a single list
                const allViolations = Object.values(results).flat();
                console.log(`Logging ${allViolations.length} QA violations for newsletter: ${newsletterId}`);
                
                await logNewsletterErrors(newsletterId, clientName, form.report_id, allViolations);
            }

            setShowPreview(true);
            const endTime = performance.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            setToast({ message: `Review completed in ${duration}s` });
        } catch (err) {
            console.error("Review Error:", err);
            alert(`Review Failed: ${err.message}`);
        } finally {
            setReviewing(false);
        }
    };

    const handleSaveArticle = async () => {
        if (!editingArticle) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('articles')
                .update({
                    heading: editingArticle.heading,
                    article_reach: editingArticle.article_reach,
                    ave: editingArticle.ave
                })
                .eq('id', editingArticle.id);

            if (error) throw error;

            // Update local state
            setAllArticles(prev => prev.map(a => a.id === editingArticle.id ? editingArticle : a));
            setSelectedArticles(prev => prev.map(a => a.id === editingArticle.id ? editingArticle : a));

            setEditingArticle(null);
            alert('Article updated successfully!');
        } catch (err) {
            console.error(err);
            alert('Error updating article');
        } finally {
            setSaving(false);
        }
    };

    // Save newsletter for the FIRST time
    const handleSave = async () => {
        if (!form.title.trim()) { alert('Please enter a newsletter title.'); return; }
        if (selectedArticles.length === 0) { alert('Please add at least one article.'); return; }
        setSaving(true);
        try {
            const { data: nl, error: nlErr } = await supabase
                .from('reports')
                .insert([{
                    title: form.title.trim(),
                    client_name: 'J&J Innovative Medicine',
                    description: `[newsletter] Created on ${format(new Date(), 'dd MMM yyyy')}`,
                    period_start: form.banner_date,
                    period_end: form.published_on,
                    report_type: 'custom',
                    notes: form.distribution_list,
                    status: 'draft',
                    article_count: selectedArticles.length,
                }])
                .select()
                .single();
            if (nlErr) throw nlErr;

            // Link articles
            const links = selectedArticles.map((a, idx) => ({
                report_id: nl.id,
                article_id: a.id,
                order_index: idx,
            }));
            if (links.length > 0) {
                const { error: linkErr } = await supabase.from('report_articles').insert(links);
                if (linkErr) throw linkErr;
            }

            setNewsletterId(nl.id);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            navigate(`/newsletters/${nl.id}`, { replace: true });
        } catch(e) {
            console.error('Save newsletter error:', e);
            alert(`Save failed: ${e.message || JSON.stringify(e)}`);
        } finally {
            setSaving(false);
        }
    };

    // Update an already-saved newsletter
    const handleUpdate = async () => {
        if (!newsletterId) return;
        setSaving(true);
        try {
            const { error: nlErr } = await supabase
                .from('reports')
                .update({
                    title: form.title.trim(),
                    period_start: form.banner_date,
                    period_end: form.published_on,
                    notes: form.distribution_list,
                    article_count: selectedArticles.length,
                })
                .eq('id', newsletterId);
            if (nlErr) throw nlErr;

            // Re-link articles
            await supabase.from('report_articles').delete().eq('report_id', newsletterId);
            const links = selectedArticles.map((a, idx) => ({
                report_id: newsletterId,
                article_id: a.id,
                order_index: idx,
            }));
            if (links.length > 0) {
                const { error: linkErr } = await supabase.from('report_articles').insert(links);
                if (linkErr) throw linkErr;
            }

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } finally {
            setSaving(false);
        }
    };

    const handleApprove = async () => {
        if (!newsletterId) {
            alert('Please save the newsletter first before approving.');
            return;
        }
        
        if (!window.confirm("Mark this newsletter as Approved?")) return;

        setSaving(true);
        try {
            console.log(`[Editor] Approving newsletter ID: ${newsletterId}`);
            const { data, error } = await supabase
                .from('reports')
                .update({ status: 'approved' })
                .eq('id', newsletterId)
                .select();
            
            console.log('[Editor] Approval results:', { data, error });
            if (error) throw error;
            
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            alert('Newsletter marked as Approved (Status: approved)!');
        } catch (err) {
            console.error('[Editor] Approval error:', err);
            alert('Failed to approve: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSendClick = () => {
        if (!newsletterId) {
            alert('Please save the newsletter first before sending.');
            return;
        }
        setShowSendModal(true);
    };

    const confirmSend = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('reports')
                .update({ status: 'sent' })
                .eq('id', newsletterId);
            if (error) throw error;
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            alert('Newsletter Sent successfully!');
            setShowSendModal(false);
        } catch (err) {
            console.error('Send error:', err);
            alert('Failed to send: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

const groupedArticles = selectedArticles.reduce((acc, art) => {
        const type = art.content_type?.replace(/_/g, ' ').toUpperCase() || 'UNCLASSIFIED';
        if (!acc[type]) acc[type] = [];
        acc[type].push(art);
        return acc;
    }, {});

    const downloadNewsletter = (isAnnotatedDownload = false) => {
        const isAPAC = form.template_name === 'Google APAC';
        
        // Helper to generate highlighted HTML string for downloads
        const getHighlightedHtml = (text, articleId, field) => {
            if (!text) return '';
            if (!isAnnotatedDownload) return text;
            
            const violations = (auditResults[articleId] || []).filter(v => 
                v.field === field || 
                (field === 'heading' && (v.field === 'heading' || v.component === 'headline')) ||
                (field === 'body' && (v.field === 'body' || v.field === 'summary' || v.component === 'full_article' || v.component === 'summary'))
            );
            
            if (violations.length === 0) return text;

            // character-based highlighting logic for HTML string
            const charViolations = new Array(text.length).fill(0).map(() => []);

            violations.forEach(v => {
                if (!v.violated_text && v.rule_operator !== 'not_regex') return;
                let regex;

                if (v.rule_operator === 'not_regex' && v.rule_value) {
                    try {
                        const safeExpectedStr = String(v.rule_value);
                        let pattern = safeExpectedStr;
                        let flags = 'g';
                        if (safeExpectedStr.startsWith('/') && safeExpectedStr.lastIndexOf('/') > 0) {
                            const lastSlash = safeExpectedStr.lastIndexOf('/');
                            pattern = safeExpectedStr.substring(1, lastSlash);
                            flags = safeExpectedStr.substring(lastSlash + 1);
                            if (!flags.includes('g')) flags += 'g';
                        }
                        regex = new RegExp(pattern, flags);
                    } catch (e) {
                        if (v.violated_text) {
                            const escaped = v.violated_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            regex = new RegExp(escaped, 'gi');
                        }
                    }
                } else if (v.violated_text) {
                    const escaped = v.violated_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regex = new RegExp(escaped, 'gi');
                }

                if (!regex) return;
                let match;
                let safetyCounter = 0;
                while ((match = regex.exec(text)) !== null) {
                    safetyCounter++;
                    if (safetyCounter > 1000) break;
                    if (match[0].length === 0) { regex.lastIndex++; continue; }
                    for (let i = match.index; i < match.index + match[0].length; i++) {
                        charViolations[i].push(v);
                    }
                }
            });

            let htmlResult = '';
            if (text.length === 0) return '';
            let currentBlock = { text: text[0] || '', vList: charViolations[0] || [] };

            for (let i = 1; i < text.length; i++) {
                const vIds = charViolations[i].map(v => v.label).sort().join('|');
                const prevVIds = currentBlock.vList.map(v => v.label).sort().join('|');

                if (vIds === prevVIds) {
                    currentBlock.text += text[i];
                } else {
                    const uniqueVList = currentBlock.vList.filter((v, idx, self) => self.findIndex(t => t.label === v.label) === idx);
                    if (uniqueVList.length > 0) {
                        const bg = uniqueVList.length > 1 ? '#ffcc80' : '#fff3cd';
                        const border = uniqueVList.length > 1 ? '2px solid #f57c00' : '1px solid #ffc107';
                        const tooltip = uniqueVList.map(v => `• ${v.label}: ${v.detail}`).join('\n');
                        htmlResult += `<span style="background: ${bg}; border-bottom: ${border}; border-radius: 2px; padding: 0 1px;" title="${tooltip.replace(/"/g, '&quot;')}">${currentBlock.text}</span>`;
                    } else {
                        htmlResult += currentBlock.text;
                    }
                    currentBlock = { text: text[i], vList: charViolations[i] };
                }
            }
            const finalVList = currentBlock.vList.filter((v, idx, self) => self.findIndex(t => t.label === v.label) === idx);
            if (finalVList.length > 0) {
                const bg = finalVList.length > 1 ? '#ffcc80' : '#fff3cd';
                const border = finalVList.length > 1 ? '2px solid #f57c00' : '1px solid #ffc107';
                const tooltip = finalVList.map(v => `• ${v.label}: ${v.detail}`).join('\n');
                htmlResult += `<span style="background: ${bg}; border-bottom: ${border}; border-radius: 2px; padding: 0 1px;" title="${tooltip.replace(/"/g, '&quot;')}">${currentBlock.text}</span>`;
            } else {
                htmlResult += currentBlock.text;
            }

            return htmlResult;
        };
        
        // Generate template-specific CSS and Header
        const styles = isAPAC ? `
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; line-height: 1.6; }
            .header { text-align: center; padding-bottom: 20px; margin-bottom: 40px; }
            .logo-container { position: relative; width: 200px; height: 60px; margin: 0 auto 10px auto; }
            .circle { position: absolute; width: 45px; height: 45px; border-radius: 50%; mix-blend-mode: multiply; opacity: 0.8; }
            .logo-text { position: absolute; width: 100%; top: 12px; font-weight: 900; color: #fff; letter-spacing: 5px; font-size: 16px; text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,0.2); }
            .header h3 { font-size: 20px; color: #1a0dab; margin: 10px 0 5px 0; font-weight: 700; }
            .header p { color: #666; font-size: 13px; margin: 0; }
            .section-title { background: #4285F4; color: #fff; padding: 8px 15px; font-size: 16px; font-weight: bold; margin-top: 40px; border-radius: 2px; text-transform: uppercase; }
            .article { margin-bottom: 35px; border-bottom: 1px solid #eee; padding-bottom: 25px; }
            .article-title { margin: 15px 0 5px 0; font-size: 20px; font-weight: 800; color: #000; }
            .article-meta { font-size: 12px; color: #666; margin-bottom: 12px; display: flex; align-items: center; gap: 5px; }
            .article-content { font-size: 14px; color: #333; }
            .source { font-weight: bold; }
            .footer { margin-top: 60px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 20px; }
            .error-badge { display: inline-block; margin-left: 10px; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid; }
        ` : `
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #d21034; padding-bottom: 20px; margin-bottom: 40px; }
            .header h1 { color: #d21034; margin: 0; font-size: 28px; }
            .header h2 { font-size: 22px; color: #1a1a1a; margin-top: 5px; }
            .header p { color: #666; font-size: 14px; margin-top: 10px; }
            .disclaimer { font-size: 12px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 30px; }
            .section-title { background: #d21034; color: #fff; padding: 10px 15px; font-size: 18px; font-weight: bold; margin-top: 40px; border-radius: 2px; }
            .article { margin-bottom: 30px; }
            .article-title { margin: 15px 0 5px 0; font-size: 18px; font-weight: bold; }
            .article-meta { font-size: 11px; color: #888; margin-bottom: 10px; }
            .article-content { font-size: 14px; line-height: 1.6; color: #444; }
            .footer { margin-top: 60px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 20px; }
            .error-badge { display: inline-block; margin-left: 10px; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid; }
        `;

        const headerHtml = isAPAC ? `
            <div class="header">
                <div class="logo-container">
                    <div class="circle" style="background: #4285F4; left: 0;"></div>
                    <div class="circle" style="background: #34A853; left: 30px;"></div>
                    <div class="circle" style="background: #FBBC05; left: 60px;"></div>
                    <div class="circle" style="background: #EA4335; left: 90px;"></div>
                    <div class="circle" style="background: #4285F4; left: 120px;"></div>
                    <div class="logo-text">THE CYCLE</div>
                </div>
                <h3>${format(new Date(form.banner_date), 'MMMM dd, yyyy')}</h3>
                <p>The stories driving cycles about the tech industry across APAC</p>
            </div>
        ` : `
            <div class="header">
                <h1>Johnson & Johnson</h1>
                <p>Innovative Medicine</p>
                <h2>${form.title}</h2>
                <p>Date: ${form.banner_date}</p>
            </div>
            <div class="disclaimer">
                <p>記事の二次使用はお控えください。/ Secondary use of the articles is prohibited for copyright reasons.</p>
                <p>This email is confidential and for internal use only. Do not forward or distribute.</p>
            </div>
        `;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${form.title}</title>
    <style>${styles}</style>
</head>
<body>
    ${headerHtml}

    ${Object.entries(groupedArticles).map(([type, articles]) => `
        <div class="section-title">${type}</div>
        ${articles.map(art => {
            const violations = auditResults[art.id] || [];
            const vCount = violations.length;
            const errorBadge = (isAnnotatedDownload && vCount > 0) ? `
                <span class="error-badge" style="color: ${vCount > 2 ? '#721c24' : '#856404'}; background: ${vCount > 2 ? '#f8d7da' : '#fff3cd'}; border-color: ${vCount > 2 ? '#721c24' : '#856404'};">
                    ${vCount} ERRORS
                </span>
            ` : '';

            return `
                <div class="article">
                    <div class="article-title">
                        ${getHighlightedHtml(art.heading, art.id, 'heading')}
                        ${errorBadge}
                    </div>
                    <div class="article-meta">
                        ${isAPAC ? 'Share article : f | X | in | msg' : `
                            ${art.published_date ? format(new Date(art.published_date), 'MMM dd, yyyy') : '--'} | 
                            ${art.source || 'Newswire'} | 
                            Reach: ${Number(art.article_reach || 0).toLocaleString()}
                        `}
                    </div>
                    <div class="article-content" style="white-space: pre-wrap; margin-bottom: 20px;">
                        ${isAPAC ? `<span class="source">${art.source || 'Newswire'} - </span>` : ''}
                        ${getHighlightedHtml(art.full_article || art.summary || '', art.id, 'body')}
                        ${isAPAC ? `<a href="${art.url || '#'}" target="_blank" style="color: #999; font-size: 13px; margin-left: 8px; text-decoration: none;">Read More</a>` : ''}
                    </div>
                    </div>
                </div>
            `;
        }).join('')}
    `).join('')}

    <div class="footer">
        ${isAPAC ? '© 2026 Google APAC. all rights reserved.' : '© 2026 Johnson & Johnson Vision Care, Inc. all rights reserved.'}
    </div>
</body>
</html>
        `;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const prefix = isAnnotatedDownload ? 'Annotated_' : 'Newsletter_';
        a.download = `${prefix}${form.title.replace(/ /g, '_')}_${form.published_on}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="newsletter-editor-container" style={{ padding: '0 40px 40px 40px' }}>
            {/* ── Send Modal ── */}
            {showSendModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1100,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{
                        width: 500, background: '#fff', borderRadius: 8,
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                        padding: '20px', display: 'flex', flexDirection: 'column'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0' }}>Confirm Send</h3>
                        <div style={{ marginBottom: 15 }}>
                            <p style={{ margin: '0 0 8px 0' }}><strong>Title:</strong> {form.title}</p>
                            <p style={{ margin: '0 0 8px 0' }}><strong>Distribution List:</strong> {form.distribution_list}</p>
                            {Object.values(auditResults).flat().length > 0 && (
                                <p style={{ color: '#d21034', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <AlertCircle size={14} />
                                    Errors Found: {Object.values(auditResults).flat().length}
                                </p>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className="btn btn-secondary" onClick={() => setShowSendModal(false)}>Cancel</button>
                            <button 
                                className="btn btn-success" 
                                style={{ background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                                onClick={confirmSend}
                                disabled={saving}
                            >
                                {saving ? <RefreshCw className="spinner" size={14} /> : <Send size={14} />}
                                {Object.values(auditResults).flat().length > 0 ? " Send Anyway" : " Send"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Newsletter Preview Overlay ── */}
            {showPreview && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', justifyContent: 'center', padding: '40px 0'
                }}>
                    <div style={{
                        width: 800, background: '#fff', borderRadius: 8,
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '15px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Newsletter Preview</h3>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => downloadNewsletter(false)}>
                                    <Download size={14} /> Download
                                </button>
                                <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#d21034', border: 'none' }} onClick={() => downloadNewsletter(true)}>
                                    <FileCheck size={14} /> Download Annotated
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '40px 60px', background: '#ffffff' }}>
                            {/* Newsletter Content Start */}
                            {form.template_name === 'Google APAC' ? (
                                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                                    <div style={{ position: 'relative', width: 220, height: 60, margin: '0 auto 10px auto' }}>
                                        <div style={{ position: 'absolute', left: 0, width: 50, height: 50, borderRadius: '50%', backgroundColor: '#4285F4', opacity: 0.9 }} />
                                        <div style={{ position: 'absolute', left: 30, width: 50, height: 50, borderRadius: '50%', backgroundColor: '#34A853', opacity: 0.9 }} />
                                        <div style={{ position: 'absolute', left: 60, width: 50, height: 50, borderRadius: '50%', backgroundColor: '#FBBC05', opacity: 0.9 }} />
                                        <div style={{ position: 'absolute', left: 90, width: 50, height: 50, borderRadius: '50%', backgroundColor: '#EA4335', opacity: 0.9 }} />
                                        <div style={{ position: 'absolute', left: 120, width: 50, height: 50, borderRadius: '50%', backgroundColor: '#4285F4', opacity: 0.9 }} />
                                        <div style={{ 
                                            position: 'absolute', width: '100%', textAlign: 'center', 
                                            top: 25, transform: 'translateY(-50%)',
                                            color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: 4,
                                            textShadow: '0 1px 2px rgba(0,0,0,0.3)', pointerEvents: 'none'
                                        }}>
                                            THE CYCLE
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 5 }}>
                                        {form.banner_date ? format(new Date(form.banner_date), 'MMMM d, yyyy') : format(new Date(), 'MMMM d, yyyy')}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#666', borderTop: '1px solid #eee', paddingTop: 10, maxWidth: 400, margin: '0 auto' }}>
                                        The stories driving cycles about the tech industry across APAC
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{
                                        padding: '10px 0',
                                        textAlign: 'center', maxWidth: 600, margin: '0 auto 40px auto',
                                        borderBottom: '1px solid #eee'
                                    }}>
                                        <div style={{ color: '#d21034', fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Johnson & Johnson</div>
                                        <div style={{ color: '#d21034', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>Innovative Medicine</div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: '#1a1a1a', letterSpacing: '-0.5px' }}>Media Impact Report</div>
                                    </div>

                                    <div style={{
                                        padding: '0 0 30px 0',
                                        marginBottom: 30, background: '#fff', fontSize: 13, lineHeight: 1.6,
                                        borderBottom: '1px solid #eee', color: '#666'
                                    }}>
                                        <p style={{ margin: '0 0 8px 0' }}>記事の二次使用はお控えください。/ Secondary use of the articles is prohibited for copyright reasons.</p>
                                        <p style={{ margin: '0 0 12px 0', fontWeight: 600, color: '#333' }}>This email is confidential and for internal use only. Do not forward or distribute.</p>
                                        <p style={{ margin: '0 0 4px 0' }}>日本語の紙媒体に掲載された記事に関しては、社外の記事検索サイトELNETのlinkにアクセスの上、IDとPWを入力の上、ご確認ください。</p>
                                        <a href="https://morning-clipping.elnet.co.jp/" style={{ color: '#0056b3', textDecoration: 'none' }}>
                                            https://morning-clipping.elnet.co.jp/
                                        </a>
                                    </div>
                                </>
                            )}

                            {Object.entries(groupedArticles).map(([type, articles]) => (
                                <div key={type} style={{ marginBottom: 50 }}>
                                    <div style={{
                                        background: form.template_name === 'Google APAC' ? '#4285F4' : '#d21034', 
                                        color: '#fff', padding: '10px 20px',
                                        fontSize: 18, fontWeight: 700, marginBottom: 20,
                                        borderRadius: '2px',
                                        textTransform: form.template_name === 'Google APAC' ? 'uppercase' : 'none'
                                    }}>
                                        {type}
                                    </div>
                                    {articles.map((art, idx) => {
                                        const violations = auditResults[art.id] || [];
                                        const headingViolations = violations.filter(v => v.field === 'heading' || v.component === 'headline');
                                        const bodyViolations = violations.filter(v => v.field === 'body' || v.field === 'summary' || v.component === 'full_article' || v.component === 'summary');
                                        const vCount = headingViolations.length + bodyViolations.length;

                                        const renderHighlightedHeading = (text, violations) => {
                                            if (violations.length === 0) return text;

                                            // 1. Identify all segments and their violation counts
                                            const charViolations = new Array(text.length).fill(0).map(() => []);

                                            violations.forEach(v => {
                                                if (!v.violated_text && v.rule_operator !== 'not_regex') return;
                                                let regex;

                                                if (v.rule_operator === 'not_regex' && v.rule_value) {
                                                    try {
                                                        const safeExpectedStr = String(v.rule_value);
                                                        let pattern = safeExpectedStr;
                                                        let flags = 'g'; // Must be global for highlighting

                                                        if (safeExpectedStr.startsWith('/') && safeExpectedStr.lastIndexOf('/') > 0) {
                                                            const lastSlash = safeExpectedStr.lastIndexOf('/');
                                                            pattern = safeExpectedStr.substring(1, lastSlash);
                                                            flags = safeExpectedStr.substring(lastSlash + 1);
                                                            if (!flags.includes('g')) flags += 'g';
                                                        }
                                                        regex = new RegExp(pattern, flags);
                                                    } catch (e) {
                                                        // Fallback string literal if regex breaks
                                                        if (v.violated_text) {
                                                            const escaped = v.violated_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                            regex = new RegExp(escaped, 'gi');
                                                        }
                                                    }
                                                } else if (v.violated_text) {
                                                    const escaped = v.violated_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                    regex = new RegExp(escaped, 'gi');
                                                }

                                                if (!regex) return;

                                                let match;
                                                // Prevent infinite loop from empty regex matches
                                                let safetyCounter = 0;
                                                const originalRegExStr = regex.source;

                                                while ((match = regex.exec(text)) !== null) {
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

                                            // 2. Group indices into continuous blocks
                                            const blocks = [];
                                            if (text.length === 0) return text;

                                            let currentBlock = { text: text[0], vList: charViolations[0] };

                                            for (let i = 1; i < text.length; i++) {
                                                const vIds = charViolations[i].map(v => v.label).sort().join('|');
                                                const prevVIds = currentBlock.vList.map(v => v.label).sort().join('|');

                                                if (vIds === prevVIds) {
                                                    currentBlock.text += text[i];
                                                } else {
                                                    blocks.push(currentBlock);
                                                    currentBlock = { text: text[i], vList: charViolations[i] };
                                                }
                                            }
                                            blocks.push(currentBlock);

                                            // 3. Render blocks
                                            return blocks.map((block, i) => {
                                                const vList = block.vList.filter((v, idx, self) =>
                                                    self.findIndex(t => t.label === v.label) === idx
                                                );
                                                const vCount = vList.length;

                                                if (vCount > 0) {
                                                    const combinedTooltip = vList.map(v => `• ${v.label}: ${v.detail}`).join('\n');
                                                    return (
                                                        <span
                                                            key={i}
                                                            style={{
                                                                background: vCount > 1 ? '#ffcc80' : '#fff3cd', // Orange for multiple, Yellow for single
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
                                        };

                                        const renderHighlightedBody = (fullText, violations) => {
                                            if (!fullText) return '';
                                            return renderHighlightedHeading(fullText, violations);
                                        };

                                        // Dynamic Colors based on violation count
                                        const getColors = (count) => {
                                            if (count === 0) return { badge: '#856404', badgeBg: '#fff3cd' };
                                            if (count === 1) return { badge: '#856404', badgeBg: '#fff3cd' }; // Yellow
                                            if (count === 2) return { badge: '#974a00', badgeBg: '#ffe5b4' }; // Orange
                                            return { badge: '#721c24', badgeBg: '#f8d7da' }; // Red
                                        };
                                        const styles = getColors(vCount);

                                        return (
                                            <div key={art.id} style={{ marginBottom: 35 }}>
                                                <div style={{ marginBottom: 10, position: 'relative' }}>
                                                    <h2 style={{
                                                        margin: 0, fontSize: 19, fontWeight: 800, color: '#000', lineHeight: 1.5,
                                                    }}>
                                                        {renderHighlightedHeading(art.heading, headingViolations)}
                                                    </h2>
                                                </div>
                                                <div style={{
                                                    padding: '4px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
                                                    display: 'flex', fontSize: 11.5, color: '#888', gap: 10, marginBottom: 12
                                                }}>
                                                    {form.template_name === 'Google APAC' ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <span style={{ color: '#666' }}>Share article:</span>
                                                            <Facebook size={14} style={{ cursor: 'pointer', color: '#666' }} />
                                                            <span style={{ color: '#eee' }}>|</span>
                                                            <Twitter size={14} style={{ cursor: 'pointer', color: '#666' }} />
                                                            <span style={{ color: '#eee' }}>|</span>
                                                            <Linkedin size={14} style={{ cursor: 'pointer', color: '#666' }} />
                                                            <span style={{ color: '#eee' }}>|</span>
                                                            <Mail size={14} style={{ cursor: 'pointer', color: '#666' }} />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span style={{ fontWeight: 600 }}>{art.published_date ? format(new Date(art.published_date), 'MMM dd') : '--'}</span>
                                                            <span style={{ color: '#d21034', opacity: 0.5 }}>|</span>
                                                            <span>Newswire (J&J Japan)</span>
                                                            <span style={{ color: '#d21034', opacity: 0.5 }}>|</span>
                                                            <span>Reach: {Number(art.article_reach || 0).toLocaleString()}</span>
                                                        </>
                                                    )}
                                                    {violations.length > 0 && (
                                                        <span style={{
                                                            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                                                            color: styles.badge, background: styles.badgeBg,
                                                            padding: '0 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                            border: `1px solid ${styles.badge}`, cursor: 'help'
                                                        }} title={violations.map(v => `• [${(v.field || 'General').toUpperCase()}] ${v.label}`).join('\n')}>
                                                            <AlertCircle size={10} /> {violations.length} {violations.length === 1 ? 'ERROR' : 'ERRORS'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#444', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                    <div style={{ marginBottom: 8 }}>
                                                        {form.template_name === 'Google APAC' && (
                                                            <span style={{ fontWeight: 700, color: '#333' }}>{art.source || 'Newswire'} - </span>
                                                        )}
                                                        {(() => {
                                                            const fullText = art.full_article || art.summary || '';
                                                            const isExpanded = expandedArticles.has(art.id);
                                                            const shouldTruncate = fullText.length > 250 && !isExpanded;
                                                            const displayText = shouldTruncate ? fullText.substring(0, 250) : fullText;
                                                            
                                                            return (
                                                                <>
                                                                    {renderHighlightedBody(displayText, bodyViolations)}
                                                                    {shouldTruncate && (
                                                                        <span 
                                                                            onClick={() => toggleExpand(art.id)} 
                                                                            style={{ color: '#999', cursor: 'pointer', marginLeft: 5, fontSize: '12px' }}
                                                                        >
                                                                            Read More
                                                                        </span>
                                                                    )}
                                                                    {isExpanded && fullText.length > 250 && (
                                                                        <span 
                                                                            onClick={() => toggleExpand(art.id)} 
                                                                            style={{ color: '#999', cursor: 'pointer', marginLeft: 5, fontSize: '12px' }}
                                                                        >
                                                                            Show Less
                                                                        </span>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {/* ── Header Toolbar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>Back to Dashboard</button>
                <button className="btn btn-secondary btn-sm" onClick={() => window.history.back()}>Back</button>
                <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Settings size={18} style={{ color: 'var(--color-primary)' }} />
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, textTransform: 'uppercase' }}>Newsletter Editor</h2>
                </div>
                <button 
                    className="btn btn-primary btn-sm" 
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#3b82f6', border: 'none' }} 
                    onClick={handleApprove} 
                    disabled={saving}
                >
                    {saving ? <RefreshCw className="spinner" size={14} /> : <CheckCircle size={14} />} Approve
                </button>
                <button 
                    className="btn btn-success btn-sm" 
                    style={{ background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px' }}
                    onClick={handleSendClick}
                    disabled={saving}
                >
                    <Send size={14} /> Send
                </button>
                <button className="btn btn-secondary btn-sm" style={{ padding: '6px' }}><Settings size={16} /></button>
            </div>

            {/* ── Form Section ── */}
            <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px 30px' }}>

                    <div className="form-group" style={{ gridColumn: 'span 1' }}>
                        <label className="form-label">Title: *</label>
                        <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Select Template *</label>
                        <select className="form-select" value={form.template_name} onChange={e => setForm({ ...form, template_name: e.target.value })}>
                            <option>New - Media Imp</option>
                            <option>Google APAC</option>
                            <option>Daily Digest</option>
                            <option>Weekly Analysis</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Subject</label>
                        <select className="form-select" value={form.subject_type} onChange={e => setForm({ ...form, subject_type: e.target.value })}>
                            <option>Custom</option>
                            <option>Dynamic</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Banner Date</label>
                        <input type="date" className="form-input" value={form.banner_date} onChange={e => setForm({ ...form, banner_date: e.target.value })} />
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 1' }}>
                        <input className="form-input" placeholder="Title Sub-heading" value={form.title} readOnly />
                    </div>

                    <div className="form-group">
                        <label className="form-label">NewsletterHeading</label>
                        <select className="form-select" value={form.heading_type} onChange={e => setForm({ ...form, heading_type: e.target.value })}>
                            <option>Default</option>
                            <option>Alternative</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Select Report*</label>
                        <select className="form-select" value={form.report_id} onChange={e => setForm({ ...form, report_id: e.target.value })}>
                            <option value="">-- ReportName --</option>
                            {reports.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Published On</label>
                        <input type="date" className="form-input" value={form.published_on} onChange={e => setForm({ ...form, published_on: e.target.value })} />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 15 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 13, fontWeight: 600 }}>Select Distribution List</label>
                        <select className="form-select" style={{ minWidth: 120 }} value={form.distribution_list} onChange={e => setForm({ ...form, distribution_list: e.target.value })}>
                            <option>DEFAULT</option>
                            <option>Management</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Search & Tools ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, maxWidth: 400 }}>
                    <div className="table-search" style={{ margin: 0 }}>
                        <Search size={15} />
                        <input placeholder="Search by keyword" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button className="btn-link" style={{ fontSize: 12, color: 'var(--color-primary)', border: 'none', background: 'none' }}>Advanced Search</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    {/* Pagination */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 13, color: 'var(--color-gray-600)', padding: '0 10px', display: 'flex', alignItems: 'center' }}>
                            Page {page} of {Math.ceil(totalCount / PAGE_SIZE)}
                        </span>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                            onClick={() => setPage(p => p + 1)}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                    <button className="btn btn-secondary btn-sm" style={{ background: '#3b82f6', color: '#fff' }}>
                        SpreadSheet view
                    </button>
                </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--color-gray-500)', marginBottom: 15 }}>
                Note: Select single or multiple article(s), drag and drop in the right side panel. You can also re-order articles within a panel.
            </p>

            {/* ── Article Selection Grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* Left: Available Articles */}
                <div style={{ border: '1px solid var(--color-gray-200)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input 
                                type="checkbox" 
                                checked={allArticles.length > 0 && allArticles.filter(a => !selectedArticles.some(sa => sa.id === a.id)).every(a => leftSelected.includes(a.id))}
                                onChange={(e) => {
                                    const availableIds = allArticles.filter(a => !selectedArticles.some(sa => sa.id === a.id)).map(a => a.id);
                                    if (e.target.checked) {
                                        setLeftSelected(prev => [...new Set([...prev, ...availableIds])]);
                                    } else {
                                        setLeftSelected(prev => prev.filter(id => !availableIds.includes(id)));
                                    }
                                }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gray-600)' }}>Total: {totalCount} Articles</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" /> Show Shared Articles
                            </label>
                            <button className="btn btn-primary" style={{ opacity: leftSelected.length === 0 ? 0.5 : 1, padding: '2px 8px' }} onClick={moveSelectedRight} disabled={leftSelected.length === 0}>
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                    <div style={{ height: 600, overflowY: 'auto', padding: 10 }}>
                        {loading ? (
                            <div className="loading-wrapper"><div className="spinner" /></div>
                        ) : allArticles.map(article => (
                            <div key={article.id} style={{ padding: '12px', borderBottom: '1px solid var(--color-gray-100)', display: 'flex', gap: 10 }}>
                                <input 
                                    type="checkbox" 
                                    checked={leftSelected.includes(article.id) || selectedArticles.some(a => a.id === article.id)} 
                                    disabled={selectedArticles.some(a => a.id === article.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setLeftSelected([...leftSelected, article.id]);
                                        } else {
                                            setLeftSelected(leftSelected.filter(id => id !== article.id));
                                        }
                                    }} 
                                />
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ fontSize: 13, color: 'var(--color-primary)', margin: '0 0 4px 0', lineHeight: 1.4 }}>{article.heading}</h4>
                                    <div style={{ fontSize: 11, color: 'var(--color-gray-500)' }}>
                                        {article.content_type?.replace(/_/g, ' ')} | {article.content_categories?.join(', ')} | MR: {article.article_reach} | ASR: {article.ave}
                                    </div>
                                </div>
                                <button
                                    className="btn-link"
                                    style={{ background: 'none', border: 'none', padding: 0 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingArticle({ ...article });
                                    }}
                                >
                                    <Edit size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Newsletter Articles */}
                <div style={{ border: '1px solid var(--color-gray-200)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button className="btn btn-primary" style={{ opacity: rightSelected.length === 0 ? 0.5 : 1, padding: '2px 8px' }} onClick={moveSelectedLeft} disabled={rightSelected.length === 0}>
                                <ArrowLeft size={14} />
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gray-600)' }}>Newsletter Articles</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-gray-600)' }}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedArticles.length > 0 && rightSelected.length === selectedArticles.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setRightSelected(selectedArticles.map(a => a.id));
                                        } else {
                                            setRightSelected([]);
                                        }
                                    }}
                                /> Select All
                            </label>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gray-600)' }}>Total: {selectedArticles.length}</span>
                        </div>
                    </div>
                    <div style={{ height: 600, overflowY: 'auto', padding: 10 }}>
                        {selectedArticles.length === 0 ? (
                            <div className="empty-state" style={{ height: '100%', border: '2px dashed var(--color-gray-200)', borderRadius: 8 }}>
                                <p style={{ color: 'var(--color-gray-400)' }}>Selected articles will appear here</p>
                            </div>
                        ) : selectedArticles.map((article, idx) => (
                            <div key={article.id} style={{ padding: '12px', borderBottom: '1px solid var(--color-gray-100)', background: idx % 2 === 0 ? '#fff' : 'var(--color-gray-50)' }}>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input 
                                        type="checkbox" 
                                        checked={rightSelected.includes(article.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setRightSelected([...rightSelected, article.id]);
                                            } else {
                                                setRightSelected(rightSelected.filter(id => id !== article.id));
                                            }
                                        }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontSize: 13, color: 'var(--color-primary)', margin: '0 0 4px 0', lineHeight: 1.4 }}>{article.heading}</h4>
                                        <div style={{ fontSize: 11, color: 'var(--color-gray-500)' }}>
                                            {article.content_type?.replace(/_/g, ' ')} | {article.content_categories?.join(', ')} | ASR: {article.ave}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <span style={{ fontSize: 10, color: 'var(--color-gray-400)' }}>New</span>
                                        <Edit
                                            size={12}
                                            style={{ color: 'var(--color-gray-400)', cursor: 'pointer' }}
                                            onClick={() => setEditingArticle({ ...article })}
                                        />
                                        <X size={12} style={{ color: 'var(--color-danger)', cursor: 'pointer' }} onClick={() => removeFromNewsletter(article.id)} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Footer Actions ── */}
            <div style={{ marginTop: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 40 }}>

                    {/* Left Footer: Test Email */}
                    <div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <input className="form-input" placeholder="Email Address" value={form.email_test} onChange={e => setForm({ ...form, email_test: e.target.value })} />
                            </div>
                            <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Settings size={14} /> Test
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={handleSendClick}>
                                <Send size={14} /> Send Individual
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 15 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                                <input type="checkbox" checked={form.send_push} onChange={e => setForm({ ...form, send_push: e.target.checked })} /> Send Push Notification
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                                <input type="checkbox" checked={form.mark_as_sent} onChange={e => setForm({ ...form, mark_as_sent: e.target.checked })} /> Mark As Send
                            </label>
                        </div>
                    </div>

                    {/* Right Footer: Global Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                        {saveSuccess && (
                            <span style={{ fontSize: 13, color: '#44b55a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle size={14} /> Saved successfully!
                            </span>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowPreview(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <Download size={14} /> Download/Preview
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={performReview}
                            style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                            disabled={reviewing}
                        >
                            {reviewing ? <RefreshCw className="spinner" size={14} /> : <FileCheck size={14} />} Review
                        </button>
                        {!newsletterId ? (
                            <button className="btn btn-success" style={{ background: '#44b55a', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleSave} disabled={saving}>
                                {saving ? <RefreshCw className="spinner" size={14} /> : <Save size={14} />} Save
                            </button>
                        ) : (
                            <button className="btn btn-success" style={{ background: '#44b55a', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleUpdate} disabled={saving}>
                                {saving ? <RefreshCw className="spinner" size={14} /> : <RefreshCw size={14} />} Update
                            </button>
                        )}
                    </div>

                </div>
            </div>

            {/* ── Edit Article Modal ── */}
            {editingArticle && (
                <EditArticleModal
                    article={editingArticle}
                    onClose={() => setEditingArticle(null)}
                    onSave={(updated) => {
                        setAllArticles(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
                        setSelectedArticles(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
                    }}
                />
            )}

            {toast && (
                <Toast 
                    message={toast.message} 
                    onClose={() => setToast(null)} 
                />
            )}
        </div>
    );
}
