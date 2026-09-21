

interface ProgressBarProps {
    value: number;
    total?: number;
    length?: number;
    color?: string;
    label?: string;
    details?: string;
}

export function ProgressBar({ value, total = 100, length = 20, color = 'text-cyan-500', label, details }: ProgressBarProps) {
    const percentage = Math.max(0, Math.min(100, (value / total) * 100));
    const filledLength = Math.round((percentage / 100) * length);
    const emptyLength = length - filledLength;

    const filledChar = '=';
    const emptyChar = '-';

    const bar = filledChar.repeat(filledLength) + emptyChar.repeat(emptyLength);

    return (
        <div className="flex flex-col mb-4 font-mono text-xs">
            {label && (
                <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-400">{label}</span>
                    <div className="text-right flex items-center justify-end">
                        {details && <span className="text-gray-500 mr-3 text-[10px] tracking-normal">{details}</span>}
                        <span className={`${color} font-bold min-w-[32px]`}>{percentage.toFixed(0)}%</span>
                    </div>
                </div>
            )}
            <div className={`flex w-full ${color} tracking-widest`}>
                <span>[</span>
                <span>{bar}</span>
                <span>]</span>
            </div>
        </div>
    );
}
