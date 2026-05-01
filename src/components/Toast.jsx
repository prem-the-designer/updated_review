import React, { useEffect, useState } from 'react';
import { X, CheckCircle } from 'lucide-react';

export default function Toast({ message, duration = 5000, onClose, type = 'success' }) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Allow for fade-out animation
    };

    if (!isVisible) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#10b981', // Shade of green
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 10000,
            animation: 'slideIn 0.3s ease-out',
            minWidth: '300px',
            justifyContent: 'space-between'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={20} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{message}</span>
            </div>
            <button 
                onClick={handleClose}
                style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#fff',
                    transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
            >
                <X size={14} />
            </button>

            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
