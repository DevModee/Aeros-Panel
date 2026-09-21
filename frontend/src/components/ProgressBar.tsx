import React from 'react';

interface ProgressBarProps {
    value: number;
    total?: number;
    length?: number;
    color?: string;
    label?: string;
}

export function ProgressBar({ value, total = 100, length = 20, color = 'text-cyan-500', label }: ProgressBarProps) {
    const percentage = Math.max(0, Math.min(100, (value / total) * 100));
    const filledLength = Math.round((percentage / 100) * length);
    const emptyLength = length - filledLength;

    const filledChar = '█';
    const emptyChar = '░';

    const bar = filledChar.repeat(filledLength) + emptyChar.repeat(emptyLength);

    return (
        <div className="flex flex-col mb-4 font-mono text-sm">
            {label && (
                <div className="flex justify-between mb-1">
                    <span className="text-gray-400">{label}</span>
                    <span className={color}>{percentage.toFixed(0)}%</span>
                </div>
            )}
            <div className={`flex w-full ${color}`}>
                <span>[</span>
                <span>{bar}</span>
                <span>]</span>
            </div>
        </div>
    );
}
