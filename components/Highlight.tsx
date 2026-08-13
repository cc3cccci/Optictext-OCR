import React from 'react';

interface HighlightTextProps {
    text: string;
    query: string;
    className?: string;
}

const HighlightText: React.FC<HighlightTextProps> = ({ text, query, className }) => {
    const q = query.trim();
    if (!q || !text) return <span className={className}>{text}</span>;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
        <span className={className}>
            {parts.map((part, i) => (
                part.toLowerCase() === q.toLowerCase()
                    ? <mark key={i}>{part}</mark>
                    : <React.Fragment key={i}>{part}</React.Fragment>
            ))}
        </span>
    );
};

export default HighlightText;
