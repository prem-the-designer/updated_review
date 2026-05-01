import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Eye, Download, Bell, Search, BarChart2,
    Radio, Share2, Table, Users, Globe, Send, FileSpreadsheet,
    FileCheck, ClipboardList, AlertTriangle, LayoutDashboard,
    BookOpen, Rss, Activity, PieChart, FileText
} from 'lucide-react';
import ExcelImportModal from '../components/ExcelImportModal';

const cards = [
    {
        id: 'articles',
        title: 'Articles',
        links: [
            { label: 'Add Article', icon: Plus, path: '/articles/add' },
            { label: 'View Articles', icon: Eye, path: '/articles' },
            { label: 'Import Articles', icon: Download, path: '/' },
            { label: 'Import Syndicate Articles', icon: Share2, path: '/' },
            { label: 'Import Social Shares', icon: Radio, path: '/' },
            { label: 'Spreadsheet View', icon: Table, path: '/' },
            { label: 'Realtime Articles', icon: Activity, path: '/' },
        ]
    },
    {
        id: 'newsletter',
        title: 'Newsletter & Report',
        links: [
            { label: 'Newsletters', icon: BookOpen, path: '/newsletters' },
            { label: 'Newsletter Send History', icon: Send, path: '/' },
            { label: 'Insight Brief', icon: FileText, path: '/reports' },
            { label: 'Customer Activity Log', icon: ClipboardList, path: '/' },
            { label: 'Analysis PPT', icon: FileSpreadsheet, path: '/' },
        ]
    },
    {
        id: 'newsdesk',
        title: 'Newsdesk',
        links: [
            { label: 'NewsDesk Articles', icon: Rss, path: '/' },
            { label: 'Add/Update Feed URL', icon: Globe, path: '/' },
        ]
    },
    {
        id: 'others',
        title: 'Others',
        links: [
            { label: 'Standards', icon: FileCheck, path: '/standards' },
            { label: 'Send Push Notification', icon: Bell, path: '/' },
            { label: 'Account Document', icon: FileCheck, path: '/', editable: true },
            { label: 'Article Sheet', icon: Table, path: '/', editable: true },
        ]
    },
    {
        id: 'alert',
        title: 'Alert',
        links: [
            { label: 'Add Alert Article', icon: AlertTriangle, path: '/' },
            { label: 'View Alert Article', icon: Eye, path: '/' },
            { label: 'View Automated Alerts', icon: Bell, path: '/' },
        ]
    },
    {
        id: 'search',
        title: 'Search',
        links: [
            { label: 'Search Administration', icon: LayoutDashboard, path: '/' },
            { label: 'Create a Search', icon: Plus, path: '/' },
            { label: 'Review Search', icon: Search, path: '/' },
            { label: 'Boolean Search Guide', icon: BookOpen, path: '/' },
            { label: 'Verify Feeds', icon: FileCheck, path: '/' },
        ]
    },
    {
        id: 'analysis',
        title: 'Article Count Analysis',
        links: [
            { label: 'Article Count Analyzer', icon: PieChart, path: '/' },
        ]
    },
];

export default function Dashboard() {
    const navigate = useNavigate();
    const [showImport, setShowImport] = useState(false);

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <Users className="page-header-icon" size={22} />
                <h1>J&amp;J Innovative Medicine - Japan</h1>
            </div>

            {/* Dashboard Grid */}
            <div className="dashboard-grid">
                {cards.map(card => (
                    <div key={card.id} className="dashboard-card">
                        <div className="dashboard-card-title">{card.title}</div>
                        <div className="dashboard-card-links">
                            {card.links.map((link, i) => (
                                <button
                                    key={i}
                                    className="dashboard-card-link"
                                    onClick={() => {
                                        if (link.label === 'Import Articles') {
                                            setShowImport(true);
                                        } else {
                                            navigate(link.path);
                                        }
                                    }}
                                >
                                    {link.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {showImport && (
                <ExcelImportModal 
                    onClose={() => setShowImport(false)}
                    onSuccess={() => console.log('Import successful')} 
                />
            )}
        </div>
    );
}
