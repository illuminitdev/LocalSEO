import { useState } from 'react';
import { Loader2, MapPin, Plus, Trash2, X } from 'lucide-react';
import { cn } from './utils';

export type SavedLocation = {
    id: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
    isPrimary: boolean;
};

type Props = {
    locations: SavedLocation[];
    selectedId: string;
    onSelect: (id: string) => void;
    limit: number;
    canAdd: boolean;
    disabled?: boolean;
    /** Returns an error message to show, or nothing when the location was added. */
    onAdd: (address: string, label: string) => Promise<string | void>;
    onRemove: (id: string) => Promise<string | void>;
};

/** Pick one of the saved scan locations. The business address is always the first one. */
export default function LocationPicker({ locations, selectedId, onSelect, limit, canAdd, disabled, onAdd, onRemove }: Props) {
    const [adding, setAdding] = useState(false);
    const [address, setAddress] = useState('');
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const selected = locations.find((l) => l.id === selectedId) || locations[0];

    const add = async () => {
        if (address.trim().length < 5) {
            setError('Enter the full address of the location.');
            return;
        }
        setBusy(true);
        setError('');
        const message = await onAdd(address.trim(), label.trim());
        setBusy(false);
        if (message) {
            setError(message);
            return;
        }
        setAddress('');
        setLabel('');
        setAdding(false);
    };

    const remove = async () => {
        if (!selected || selected.isPrimary) return;
        setBusy(true);
        const message = await onRemove(selected.id);
        setBusy(false);
        if (message) setError(message);
    };

    return (
        <div className="min-w-0">
            <div className="relative">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                    id="location-picker"
                    value={selected?.id || ''}
                    onChange={(e) => onSelect(e.target.value)}
                    disabled={disabled || busy || !locations.length}
                    className="w-full h-10 pl-9 pr-8 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[var(--brand-primary)] truncate disabled:opacity-60"
                >
                    {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.isPrimary ? `${l.label || 'Business address'} (business address)` : l.label || l.address}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mt-1 min-h-[16px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-gray-500 leading-4">
                <span>
                    {locations.length} of {limit} location{limit === 1 ? '' : 's'} used
                </span>
                {canAdd && !adding && (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        disabled={disabled || busy}
                        className="inline-flex items-center gap-0.5 text-[var(--brand-primary)] hover:underline cursor-pointer disabled:opacity-50"
                    >
                        <Plus className="w-3 h-3" /> Add location
                    </button>
                )}
                {selected && !selected.isPrimary && (
                    <button
                        type="button"
                        onClick={remove}
                        disabled={disabled || busy}
                        className="inline-flex items-center gap-0.5 text-red-500 hover:underline cursor-pointer disabled:opacity-50"
                    >
                        <Trash2 className="w-3 h-3" /> Remove
                    </button>
                )}
            </div>

            {adding && (
                <div className="mt-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0F172A]">New location</span>
                        <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="text-gray-400 hover:text-gray-600 cursor-pointer">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <input
                        id="location-address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && add()}
                        placeholder="Full address, town and postcode"
                        className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <input
                        id="location-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && add()}
                        maxLength={80}
                        placeholder="Name (optional), e.g. Leeds branch"
                        className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                        type="button"
                        onClick={add}
                        disabled={busy}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] text-white text-xs font-bold cursor-pointer',
                            busy && 'opacity-70'
                        )}
                    >
                        {busy && <Loader2 className="w-3 h-3 animate-spin" />} Save location
                    </button>
                </div>
            )}

            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
    );
}
