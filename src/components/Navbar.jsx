import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ChevronDown, User, LogOut, Settings } from 'lucide-react';

const NavDropdown = ({ label, items }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="nav-dropdown" ref={ref}>
            <button className="nav-link" onClick={() => setOpen(o => !o)}>
                {label}
                <ChevronDown size={12} className="nav-dropdown-arrow" />
            </button>
            {open && (
                <div className="nav-dropdown-menu">
                    {items.map((item, i) => (
                        item.onClick
                            ? <button key={i} onClick={() => { item.onClick(); setOpen(false); }}>{item.label}</button>
                            : <a key={i} href={item.href || '#'} onClick={() => setOpen(false)}>{item.label}</a>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [seconds, setSeconds] = useState(0);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userRef = useRef(null);

    // Timer
    useEffect(() => {
        const interval = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    // Close user menu on outside click
    useEffect(() => {
        const handler = (e) => { if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const formatTime = (s) => {
        const h = String(Math.floor(s / 3600)).padStart(2, '0');
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        return `${h}:${m}:${sec}`;
    };

    const outletItems = [
        { label: 'View Outlets', onClick: () => navigate('/') },
        { label: 'Manage Outlets', onClick: () => navigate('/') },
    ];

    const contactsItems = [
        { label: 'All Contacts', onClick: () => navigate('/') },
        { label: 'Add Contact', onClick: () => navigate('/') },
    ];

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

    return (
        <nav className="navbar">
            {/* Brand */}
            <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                <div className="navbar-logo">
                    Full<span>intel</span>
                </div>
            </div>

            {/* Navigation */}
            <div className="navbar-nav">
                <button className={`nav-link ${isActive('/') && location.pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
                    <Home size={16} />
                </button>
                <button className={`nav-link ${isActive('/articles') ? 'active' : ''}`} onClick={() => navigate('/articles')}>
                    Customers
                </button>
                <NavDropdown label="Outlet" items={outletItems} />
                <NavDropdown label="Contacts" items={contactsItems} />
                <button className={`nav-link ${isActive('/qa-dashboard') ? 'active' : ''}`} onClick={() => navigate('/qa-dashboard')}>
                    QA Insights
                </button>
            </div>

            {/* Right side */}
            <div className="navbar-right">
                <div className="navbar-timer">{formatTime(seconds)}</div>

                <div className="nav-dropdown" ref={userRef}>
                    <div className="navbar-user" onClick={() => setUserMenuOpen(o => !o)}>
                        <div className="user-avatar">PK</div>
                        <span>Prem Kumar</span>
                        <ChevronDown size={12} />
                    </div>
                    {userMenuOpen && (
                        <div className="nav-dropdown-menu" style={{ right: 0, left: 'auto' }}>
                            <button onClick={() => setUserMenuOpen(false)}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={13} /> Settings</span>
                            </button>
                            <button onClick={() => setUserMenuOpen(false)}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LogOut size={13} /> Logout</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
