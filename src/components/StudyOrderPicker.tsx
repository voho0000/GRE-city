import { DISTRICTS } from '../data/districts';
import { useStore } from '../lib/store';
import type { DistrictId, StudyOrder } from '../lib/types';

const OPTIONS: { id: StudyOrder; label: string }[] = [
  { id: 'mixed', label: '各區輪流' },
  { id: 'district', label: '依街區' },
  { id: 'random', label: '隨機' },
];

/** Chooses the order new words are introduced in. Reviews are unaffected: whatever is due always comes back. */
export function StudyOrderPicker() {
  const { settings, setSettings } = useStore();
  return (
    <div className="stack-6">
      <span className="small muted" id="order-label">新字順序</span>
      <div className="segmented" role="group" aria-labelledby="order-label">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" aria-pressed={settings.studyOrder === o.id} className={settings.studyOrder === o.id ? 'on' : ''} onClick={() => setSettings({ studyOrder: o.id })}>
            {o.label}
          </button>
        ))}
      </div>
      {settings.studyOrder === 'district' && (
        <label className="field">
          <span className="sr-only">先背哪一區</span>
          <select value={settings.focusDistrict} onChange={(e) => setSettings({ focusDistrict: e.target.value as DistrictId })}>
            {DISTRICTS.map((d) => <option key={d.id} value={d.id}>先背{d.name}區</option>)}
          </select>
        </label>
      )}
      {settings.studyOrder === 'random' && <span className="tiny muted">每天換一次順序，當天重開順序不變。</span>}
    </div>
  );
}
