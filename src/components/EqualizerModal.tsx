import { RotateCcw, ShieldCheck, Sliders, Waves, X } from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';
import { isEqFlat, shouldBypassDspChain } from '../services/webAudioEngine';
import { EQ_BAND_LABELS, EQ_PRESETS } from '../utils/eqPresets';

export function EqualizerModal() {
  const { isEqOpen, setEqOpen, eqSettings, updateEqSettings, applyEqPreset } = useNocturne();

  if (!isEqOpen) return null;

  const isBypassed = !eqSettings.enabled;
  const isCleanUnity = shouldBypassDspChain(eqSettings);
  const isFlat = isEqFlat(eqSettings);

  const handleBandChange = (index: number, valueDb: number) => {
    const nextBands = [...eqSettings.bands];
    nextBands[index] = valueDb;
    updateEqSettings({
      bands: nextBands,
      presetName: 'Custom',
      enabled: true,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="10-Band Web Audio Equalizer"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-[#111119] border border-white/12 p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-purple-400" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold text-white">Studio 10-Band Equalizer</h2>
              <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
                {isBypassed
                  ? 'Direct Audio bypass · Zero DSP CPU overhead'
                  : isCleanUnity && isFlat
                    ? 'Flat 0 dB unity · Zero-CPU clean bypass active'
                    : 'Anti-clipping limiter active'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEqOpen(false)}
            aria-label="Close equalizer"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Bypass EQ (Direct Audio) Switch */}
        <div className="mt-4 flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-[#0B0B11] border border-white/10">
          <div>
            <p className="text-sm font-semibold text-white">Bypass EQ (Direct Audio)</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isBypassed
                ? 'Raw unprocessed direct audio output (EQ & effects bypassed)'
                : '10-band EQ & spatial processing enabled'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isBypassed}
            aria-label="Bypass EQ (Direct Audio)"
            onClick={() => updateEqSettings({ enabled: isBypassed })}
            className={`w-12 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
              isBypassed ? 'bg-purple-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                isBypassed ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Presets */}
        <div className={`mt-4 transition-opacity ${isBypassed ? 'opacity-45 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400">Presets</span>
            <button
              type="button"
              onClick={() => applyEqPreset('Flat')}
              className="text-xs text-purple-300 hover:text-purple-200 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Reset Flat
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {EQ_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                disabled={isBypassed}
                onClick={() => applyEqPreset(preset.name)}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors truncate ${
                  eqSettings.presetName === preset.name
                    ? 'bg-purple-500 text-white shadow-[0_0_14px_rgba(168,85,247,0.35)]'
                    : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Preamp & Enhancement Toggles */}
        <div className={`mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity ${isBypassed ? 'opacity-45 pointer-events-none' : ''}`}>
          <div className="rounded-xl bg-[#0B0B11] border border-white/8 p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="eq-preamp" className="text-zinc-300 font-medium">Preamp</label>
              <span className="font-mono text-purple-300 tabular-nums">
                {eqSettings.preampDb > 0 ? `+${eqSettings.preampDb}` : eqSettings.preampDb} dB
              </span>
            </div>
            <input
              id="eq-preamp"
              type="range"
              disabled={isBypassed}
              min={-12}
              max={12}
              step={0.5}
              value={eqSettings.preampDb}
              onChange={(e) => updateEqSettings({ preampDb: Number(e.target.value) })}
              className="nocturne-range w-full"
            />
          </div>

          <button
            type="button"
            disabled={isBypassed}
            onClick={() => updateEqSettings({ bassBoost: !eqSettings.bassBoost, enabled: true })}
            aria-pressed={eqSettings.bassBoost}
            className={`rounded-xl border p-3 text-left transition-colors ${
              eqSettings.bassBoost
                ? 'bg-purple-500/18 border-purple-400/40 text-white'
                : 'bg-[#0B0B11] border-white/8 text-zinc-300 hover:border-white/20'
            }`}
          >
            <p className="text-xs font-semibold">Bass Boost</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {eqSettings.bassBoost ? '+6 dB Sub Shelf Active' : 'Low-frequency punch'}
            </p>
          </button>

          <button
            type="button"
            disabled={isBypassed}
            onClick={() => updateEqSettings({ surround3d: !eqSettings.surround3d, enabled: true })}
            aria-pressed={eqSettings.surround3d}
            className={`rounded-xl border p-3 text-left transition-colors ${
              eqSettings.surround3d
                ? 'bg-purple-500/18 border-purple-400/40 text-white'
                : 'bg-[#0B0B11] border-white/8 text-zinc-300 hover:border-white/20'
            }`}
          >
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              3D Surround / Reverb
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {eqSettings.surround3d ? 'Spatial Convolution On' : 'Acoustic room depth'}
            </p>
          </button>
        </div>

        {/* 10-Band Frequency Sliders */}
        <div className={`mt-5 rounded-2xl bg-[#0B0B11] border border-white/8 p-4 transition-opacity ${isBypassed ? 'opacity-45 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
            {EQ_BAND_LABELS.map((label, idx) => {
              const val = eqSettings.bands[idx] ?? 0;
              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-mono tabular-nums text-purple-300">
                    {val > 0 ? `+${val}` : val}
                  </span>
                  <div className="h-32 flex items-center justify-center">
                    <input
                      type="range"
                      disabled={isBypassed}
                      aria-label={`${label} band gain`}
                      min={-12}
                      max={12}
                      step={1}
                      value={val}
                      onChange={(e) => handleBandChange(idx, Number(e.target.value))}
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      className="h-28 w-5 accent-purple-400 cursor-pointer"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
