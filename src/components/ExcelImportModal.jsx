import React, { useState, useRef } from 'react';
import { Download, UploadCloud, X, ChevronDown, ChevronRight, AlertTriangle, FileCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { executeRuleEngine } from '../lib/ruleEngine/engine';
import Toast from './Toast';

const EXCEL_COLUMNS = [
    'Id', 'Heading', 'Article URL', 'Article Views', 'Published Date', 'Modified Date',
    'Article Banner Image', 'Outlets', 'Contacts', 'Daily Reach', 'Monthly Reach',
    'Article Reach', 'AVE', 'Media Impact Score', 'Related Tweets', 'Article Description',
    'Toc Description', 'Full Article', 'Mark As Important', 'Behind PayWall', 'Key Sources',
    'Content Categories', 'Content Type', 'Syndicate', 'Total Mention', 'Syndicated Reach',
    'Article Customize Fields', 'Tonality', 'Tag Field', 'Mediatype', 'Peripheral Mention',
    'Article Comments', 'Article MediaType', 'Author SocialMedia Id', 'Gilead Article',
    'Webapp Article', 'Trending Score', 'Hero Brief', 'Hero Topic', 'Share Article Content',
    'Source Country Code', 'Source Country'
];

const parseExcelDate = (excelDate) => {
    if (!excelDate) return new Date().toISOString();
    if (excelDate instanceof Date) {
        if (!isNaN(excelDate.getTime())) return excelDate.toISOString();
    }
    if (typeof excelDate === 'number') {
        // Excel serial date to JS Date (Windows 1900 date system)
        return new Date(Math.round((excelDate - 25569) * 86400 * 1000)).toISOString();
    }
    if (typeof excelDate === 'string') {
        const parsed = new Date(excelDate);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
};

export default function ExcelImportModal({ onClose, onSuccess }) {
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState('');
    const fileInputRef = useRef(null);

    const [qaResults, setQaResults] = useState(null);
    const [expandedError, setExpandedError] = useState(null);
    const [toast, setToast] = useState(null);

    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS]);
        XLSX.utils.book_append_sheet(wb, ws, "Articles Template");
        XLSX.writeFile(wb, "bulk_import_template.xlsx");
    };

    const handleFileUpload = async (file) => {
        const startTime = performance.now();
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            alert('Only .xlsx or .xls files are supported.');
            return;
        }

        setUploading(true);
        setProgress('Reading file...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (rows.length === 0) {
                    alert('File is empty.');
                    setUploading(false);
                    return;
                }

                setProgress(`Processing ${rows.length} records...`);

                const mediaTypeMap = {
                    '7': 'Online Publications',
                    '20': 'Online Newspaper',
                    '1': 'Newspapers'
                };

                const contentTypeMap = {
                    '20': 'Company News - Japanese',
                    '21': 'Company News - English',
                    '22': 'Product News - Japanese',
                    '23': 'Product News - English',
                    '24': 'Competitor News - Japanese',
                    '25': 'Competitor News - English',
                    '26': 'Industry News - Japanese',
                    '27': 'Industry News - English'
                };

                const insertData = rows.map((row) => {
                    const mediaTypeRaw = String(row['Mediatype'] || row['Article MediaType'] || '').trim();
                    const contentTypeRaw = String(row['Content Type'] || '').trim();

                    return {
                        heading: row['Heading'] || 'Untitled',
                        article_url: row['Article URL'] || null,
                        views: row['Article Views'] ? parseInt(row['Article Views']) : 0,
                        published_date: parseExcelDate(row['Published Date']),
                        banner_image: row['Article Banner Image'] || null,
                        outlets_raw: row['Outlets'] || null,
                        contacts_raw: row['Contacts'] || null,
                        daily_reach: row['Daily Reach'] ? parseFloat(row['Daily Reach']) : null,
                        monthly_reach: row['Monthly Reach'] ? parseFloat(row['Monthly Reach']) : null,
                        article_reach: row['Article Reach'] ? parseFloat(row['Article Reach']) : null,
                        ave: row['AVE'] ? parseFloat(row['AVE']) : null,
                        media_impact_score: row['Media Impact Score'] ? parseFloat(row['Media Impact Score']) : null,
                        related_tweets: row['Related Tweets'] || null,
                        summary: row['Article Description'] || null,
                        toc_description: row['Toc Description'] || null,
                        full_article: row['Full Article'] || '<p>Bulk Imported Content</p>',
                        is_important: String(row['Mark As Important'] || '').toLowerCase() === 'true',
                        behind_paywall: String(row['Behind PayWall'] || '').toLowerCase() === 'true',
                        key_sources: String(row['Key Sources'] || '').toLowerCase() === 'true',
                        content_categories: row['Content Categories'] ? String(row['Content Categories']).split(',').map(s=>s.trim()) : [],
                        content_type: contentTypeMap[contentTypeRaw] || row['Content Type'] || null,
                        syndicate: String(row['Syndicate'] || '').toLowerCase() === 'true',
                        total_mention: row['Total Mention'] ? parseInt(row['Total Mention']) : null,
                        syndicated_reach: row['Syndicated Reach'] ? parseFloat(row['Syndicated Reach']) : null,
                        tonality: row['Tonality'] || null,
                        tag_field: row['Tag Field'] || null,
                        article_media_type: mediaTypeMap[mediaTypeRaw] || row['Mediatype'] || row['Article MediaType'] || null,
                        peripheral_mention: String(row['Peripheral Mention'] || '').toLowerCase() === 'true',
                        article_comments: row['Article Comments'] || null,
                        author_socialmedia_id: row['Author SocialMedia Id'] || null,
                        gilead_article: String(row['Gilead Article'] || '').toLowerCase() === 'true',
                        webapp_article: String(row['Webapp Article'] || '').toLowerCase() === 'true',
                        trending_score: row['Trending Score'] ? parseFloat(row['Trending Score']) : null,
                        hero_brief: String(row['Hero Brief'] || '').toLowerCase() === 'true',
                        hero_topic: String(row['Hero Topic'] || '').toLowerCase() === 'true',
                        share_article_content: String(row['Share Article Content'] || '').toLowerCase() === 'true',
                        source_country_code: row['Source Country Code'] || null,
                        source_country: row['Source Country'] || null,
                        status: 'active'
                    };
                });

                // Batch insert into Supabase and select returned data for analysis
                setProgress(`Uploading data to database...`);
                
                const { data: insertedData, error } = await supabase.from('articles').insert(insertData).select();
                if (error) throw error;

                setProgress(`Analyzing ${insertedData.length} articles with Rule Engine...`);

                const { data: fiStd } = await supabase.from('fullintel_standards').select('id').limit(1).maybeSingle();
                let ruleQuery = supabase.from('rules').select('*').eq('is_active', true);
                if (fiStd) ruleQuery = ruleQuery.eq('fullintel_standard_id', fiStd.id);
                const { data: activeRules } = await ruleQuery.order('priority', { ascending: true });

                const groupedErrors = {};
                let totalViolations = 0;

                (insertedData || []).forEach(art => {
                    const violations = executeRuleEngine(art, activeRules || []);
                    if (violations && violations.length > 0) {
                        violations.forEach(v => {
                            const errorTitle = v.name || v.label || "General Error";
                            if (!groupedErrors[errorTitle]) {
                                groupedErrors[errorTitle] = {
                                    detail: v.description || v.detail || "No description provided.",
                                    severity: v.severity || 'warning',
                                    articles: []
                                };
                            }
                            groupedErrors[errorTitle].articles.push(art);
                            totalViolations++;
                        });
                    }
                });

                if (totalViolations > 0) {
                    setQaResults({ groupedErrors, totalViolations, totalArticles: insertedData.length });
                    const endTime = performance.now();
                    const duration = ((endTime - startTime) / 1000).toFixed(2);
                    setToast({ message: `Auto Review completed in ${duration}s` });
                    setUploading(false);
                } else {
                    const endTime = performance.now();
                    const duration = ((endTime - startTime) / 1000).toFixed(2);
                    setToast({ message: `Auto Review completed in ${duration}s` });
                    setTimeout(() => {
                        alert('Articles imported and analyzed successfully with no errors!');
                        onSuccess && onSuccess();
                        onClose();
                    }, 500); // Small delay to let toast be seen
                }

            } catch (err) {
                console.error(err);
                alert('Import error: ' + err.message);
                setUploading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFilesChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    };

    if (qaResults) {
        return (
            <div style={styles.overlay} onClick={onClose}>
                <div style={{ ...styles.modal, maxWidth: 800 }} onClick={e => e.stopPropagation()}>
                    <div style={styles.header}>
                        <div>
                            <h2 style={styles.title}><AlertTriangle size={20} color="#d21034" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} /> Import Quality Review</h2>
                            <div style={styles.subtitle}>
                                Found {qaResults.totalViolations} issues across {qaResults.totalArticles} imported articles. Review the errors consolidated below.
                            </div>
                        </div>
                        <button style={styles.closeBtn} onClick={() => { onSuccess && onSuccess(); onClose(); }}><X size={20} /></button>
                    </div>

                    <div style={{ padding: '24px', backgroundColor: '#f8fafc', height: '60vh', overflowY: 'auto' }}>
                        {Object.entries(qaResults.groupedErrors).map(([errorTitle, errorData]) => {
                            const isGroupExpanded = expandedError === errorTitle;
                            // Ensure unique articles conceptually if a rule fires multiple times per article, just display article once
                            const uniqueArticles = errorData.articles.filter((a, idx, self) => self.findIndex(t => t.id === a.id) === idx);
                            return (
                                <div key={errorTitle} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <div 
                                        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isGroupExpanded ? '#fbfcfe' : '#fff' }}
                                        onClick={() => setExpandedError(isGroupExpanded ? null : errorTitle)}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <h4 style={{ margin: 0, fontSize: 15, color: '#1e293b', fontWeight: 700 }}>{errorTitle}</h4>
                                                <span style={{ fontSize: 11, backgroundColor: errorData.severity === 'critical' ? '#fee2e2' : '#fef3c7', color: errorData.severity === 'critical' ? '#b91c1c' : '#b45309', padding: '2px 8px', borderRadius: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                                                    {errorData.severity}
                                                </span>
                                                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>({uniqueArticles.length} Articles)</span>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{errorData.detail}</div>
                                        </div>
                                        {isGroupExpanded ? <ChevronDown size={20} color="#94a3b8" /> : <ChevronRight size={20} color="#94a3b8" />}
                                    </div>
                                    
                                    {isGroupExpanded && (
                                        <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafaf9' }}>
                                            <h5 style={{ margin: '0 0 12px 0', fontSize: 13, color: '#475569', fontWeight: 700 }}>Affected Articles:</h5>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {uniqueArticles.map(art => (
                                                    <div key={art.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, backgroundColor: '#fff', padding: '12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                                        <FileCheck size={16} color="#94a3b8" style={{ marginTop: 2 }} />
                                                        <div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{art.heading || 'Untitled'}</div>
                                                            <div style={{ fontSize: 12, color: '#94a3b8' }}>ID: {art.id} | Source: {art.source || art.article_media_type || 'Unknown'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div style={styles.footer}>
                        <button style={{ ...styles.downloadBtn, margin: 0, backgroundColor: '#4f46e5', color: '#fff', border: 'none' }} onClick={() => { onSuccess && onSuccess(); onClose(); }}>
                            Done & Explore Articles
                        </button>
                    </div>
                </div>
            {toast && (
                <Toast 
                    message={toast.message} 
                    onClose={() => setToast(null)} 
                />
            )}
        </div>
        );
    }

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>Bulk Format (Excel)</h2>
                        <div style={styles.subtitle}>Select an Excel file to begin.</div>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
                </div>

                {/* Body */}
                <div style={styles.body}>
                    <button style={styles.downloadBtn} onClick={handleDownloadTemplate} disabled={uploading}>
                        Download Template
                    </button>
                    <div style={styles.instruction}>
                        Use the template to format your data. Only .xlsx files are supported.
                    </div>

                    <div 
                        style={{ ...styles.dropZone, borderColor: dragOver ? '#4f46e5' : '#cbd5e1' }}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                        {uploading ? (
                            <div style={{ color: '#4f46e5', fontWeight: 600 }}>{progress}</div>
                        ) : (
                            <>
                                <UploadCloud size={32} color="#94a3b8" style={{ marginBottom: 12 }} />
                                <div style={{ color: '#475569', fontWeight: 600 }}>Click to upload <span style={{ fontWeight: 400 }}>or drag and drop</span></div>
                                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Excel (.xlsx)</div>
                            </>
                        )}
                        <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                            onChange={handleFilesChange}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <button style={styles.cancelBtn} onClick={onClose} disabled={uploading}>Cancel</button>
                </div>
            </div>
            {toast && (
                <Toast 
                    message={toast.message} 
                    onClose={() => setToast(null)} 
                />
            )}
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(30, 41, 59, 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, backdropFilter: 'blur(3px)'
    },
    modal: {
        width: '100%', maxWidth: 640, backgroundColor: '#fff',
        borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex', flexDirection: 'column'
    },
    header: {
        padding: '24px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9'
    },
    title: { margin: 0, fontSize: 18, color: '#1e293b', fontWeight: 800 },
    subtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
    closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' },
    body: { padding: '40px 24px', textAlign: 'center' },
    downloadBtn: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
        padding: '10px 24px', fontSize: 14, fontWeight: 700, color: '#334155',
        cursor: 'pointer', marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    instruction: { fontSize: 13, color: '#64748b', marginBottom: 32 },
    dropZone: {
        border: '2px dashed #cbd5e1', borderRadius: 8, padding: '48px 24px',
        cursor: 'pointer', transition: 'all 0.2s', backgroundColor: '#f8fafc',
        display: 'flex', flexDirection: 'column', alignItems: 'center'
    },
    footer: {
        padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'flex-end'
    },
    cancelBtn: {
        background: 'none', border: 'none', fontSize: 14, fontWeight: 700,
        color: '#64748b', cursor: 'pointer'
    }
};
