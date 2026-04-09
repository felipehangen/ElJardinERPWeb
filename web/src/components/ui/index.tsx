import React, { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Search, Plus } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const Button = ({ className, variant = "primary", size = "default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "outline" | "ghost", size?: "default" | "sm" | "lg" | "icon" }) => {
    const variants = {
        primary: "bg-jardin-primary text-white hover:bg-jardin-secondary",
        secondary: "bg-jardin-accent text-gray-900 hover:bg-yellow-400",
        danger: "bg-red-600 text-white hover:bg-red-700",
        outline: "border-2 border-gray-200 text-gray-700 hover:bg-gray-50",
        ghost: "bg-transparent text-gray-600 hover:bg-gray-100"
    };
    const sizes = {
        default: "px-4 py-2",
        sm: "px-3 py-1.5 text-sm",
        lg: "px-6 py-3 text-lg",
        icon: "p-2"
    };
    return <button className={cn("rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none", variants[variant], sizes[size], className)} {...props} />;
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
    <input ref={ref} className={cn("w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-jardin-primary/20 focus:border-jardin-primary transition-all", className)} {...props} />
));

export const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("bg-white p-6 rounded-2xl shadow-sm border border-gray-100", className)}>{children}</div>
);

export const Modal = ({ isOpen, onClose, title, children, className }: any) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && onClose) {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={cn("bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200", className)}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-bold text-lg text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
            {/* Click outside closer helper */}
            <div className="fixed inset-0 z-[-1]" onClick={onClose} />
        </div>
    );
};

// Autocomplete Combobox
interface ComboboxProps {
    items: { id: string, name: string }[];
    placeholder?: string;
    onSelect: (item: any) => void;
    onCreate?: (name: string) => void;
    onInputChange?: (value: string) => void;
    value?: string;
}

export const Combobox = ({ items, placeholder, onSelect, onCreate, onInputChange, value }: ComboboxProps) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value || ''); // Initialize with value

    // If empty, show recent/all. If typing, filter.
    const filtered = query.trim() === ''
        ? items.slice(0, 10) // Show up to 10 items when just opened
        : items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));

    // Sync with external value changes
    useEffect(() => {
        if (value !== undefined) {
            setQuery(value);
        }
    }, [value]);

    // Safe handle creation
    const handleCreate = () => {
        if (onCreate && query.trim()) {
            onCreate(query);
            setOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            setOpen(true);
        }
    };

    return (
        <div className="relative group">
            <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-jardin-primary/20 focus:border-jardin-primary transition-all"
                    placeholder={placeholder}
                    value={query}
                    onChange={e => {
                        const val = e.target.value;
                        setQuery(val);
                        setOpen(true);
                        if (onInputChange) onInputChange(val);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                />
            </div>
            {open && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-20 max-h-60 overflow-y-auto">
                    {filtered.length > 0 ? (
                        filtered.map(item => (
                            <button
                                key={item.id}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-2"
                                onClick={() => { onSelect(item); setQuery(item.name); setOpen(false); }}
                            >
                                {item.name}
                            </button>
                        ))
                    ) : (
                        onCreate && (
                            <button
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-green-50 text-jardin-primary text-sm flex items-center gap-2 font-medium"
                                onClick={handleCreate}
                            >
                                <Plus size={16} /> Crear "{query}"
                            </button>
                        )
                    )}
                </div>
            )}
            {/* Click outside closer helper */}
            {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
        </div>
    );
};
