'use client';
import { useState } from 'react';
import type { ConnectionChoice } from '@/lib/deviceinfo';

interface ConnectionBarProps {
    connected: boolean;
    connecting: boolean;
    status: string;
    onConnect: (choice: ConnectionChoice) => void;
}

export function ConnectionBar({ connected, connecting, status, onConnect }: ConnectionBarProps) {
    const [choice, setChoice] = useState<ConnectionChoice>('auto');
    return (
        <div className="w-full max-w-[920px] flex flex-col items-center gap-3 mb-5">
            <div className="flex gap-2 items-center">
                <select
                    aria-label="Keyboard connection"
                    value={choice}
                    disabled={connected || connecting}
                    onChange={event => setChoice(event.target.value as ConnectionChoice)}
                    className="px-3 py-2 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-50"
                >
                    <option value="auto">Auto (USB first)</option>
                    <option value="wired">USB-C cable</option>
                    <option value="wireless">Dongle 2.4 GHz</option>
                </select>
                <button
                    onClick={() => onConnect(choice)}
                    disabled={connecting}
                    className={[
                        'px-5 py-2 rounded-lg font-medium text-sm transition-colors duration-150 disabled:opacity-50',
                        connected
                            ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-zinc-100 text-zinc-900 hover:bg-white'
                    ].join(' ')}
                >
                    {connecting ? 'Connecting…' : connected ? 'Disconnect' : 'Connect keyboard'}
                </button>
            </div>
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : status.startsWith('⚠') ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                {status}
            </p>
        </div>
    );
}
